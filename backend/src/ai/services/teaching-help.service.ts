import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AIRequestStatus, AIRequestType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MemoryCacheService } from '../../common/services/memory-cache.service';
import { FAST_AI_PROVIDER, AiProvider } from '../providers/ai.provider';
import { parseModelJson } from '../parse-model-json';
import {
  TeachingAssistanceMode,
  TeachingHelpBasis,
  TeachingHelpOutput,
  TeachingHelpOutputSchema,
} from '../schemas/teaching-help.schema';
import { TEACHING_HELP_PROMPT_VERSION } from '../prompts';
import { TeachingHelpGenerationError } from '../teaching-help-errors';
import { heuristicTeachingHelp } from '../../academic-planner/teaching-help-heuristic';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type GenerateTeachingHelpInput = {
  schoolId: string;
  userId: string;
  versionId: string;
  lessonKey: string;
  contentHash: string;
  mode: TeachingAssistanceMode;
  lessonTitle: string;
  chapterTitle: string;
  classLabel: string;
  subjectName: string;
  bookTitle: string | null;
  objectives: string[];
  stagesSummary: string;
  chapterExcerpt: string;
  basis: TeachingHelpBasis;
  teacherQuestion?: string;
  variety?: number;
};

export type GenerateTeachingHelpResult = {
  assistance: TeachingHelpOutput;
  basis: TeachingHelpBasis;
  aiGenerated: boolean;
  cached: boolean;
  promptVersion: string;
  mode: TeachingAssistanceMode;
  provider?: string;
  model?: string;
};

@Injectable()
export class TeachingHelpService {
  constructor(
    @Inject(FAST_AI_PROVIDER) private readonly ai: AiProvider,
    private readonly prisma: PrismaService,
    private readonly cache: MemoryCacheService,
  ) {}

  async generate(input: GenerateTeachingHelpInput): Promise<GenerateTeachingHelpResult> {
    if (input.basis === 'UNAVAILABLE') {
      throw new TeachingHelpGenerationError(
        'TEACHING_HELP_UNAVAILABLE',
        'Lesson content is not available for teaching assistance.',
      );
    }

    const cacheKey = `planner-help:${input.schoolId}:${input.versionId}:${input.lessonKey}:${input.contentHash}:${input.basis}:${input.mode}`;
    const cached = this.cache.get<GenerateTeachingHelpResult>(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    const request = await this.prisma.aIRequest.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        type: AIRequestType.TEACHING_ASSISTANCE,
        provider: 'pending',
        model: 'pending',
        status: AIRequestStatus.PROCESSING,
        metadata: {
          mode: input.mode,
          lessonKey: input.lessonKey,
          versionId: input.versionId,
          basis: input.basis,
          promptVersion: TEACHING_HELP_PROMPT_VERSION,
        },
      },
    });

    const failRequest = async (message: string) => {
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: { status: AIRequestStatus.FAILED, errorMessage: message.slice(0, 500) },
      });
    };

    try {
      let completion = await this.ai.generateTeachingHelp({
        mode: input.mode,
        lessonTitle: input.lessonTitle,
        chapterTitle: input.chapterTitle,
        classLabel: input.classLabel,
        subjectName: input.subjectName,
        bookTitle: input.bookTitle,
        objectives: input.objectives,
        stagesSummary: input.stagesSummary,
        chapterExcerpt: input.chapterExcerpt,
        teacherQuestion: input.teacherQuestion,
        variety: input.variety,
      });

      const aiGenerated =
        completion.provider !== 'mock' && completion.model !== 'heuristic';

      const parseCompletion = (data: unknown) => {
        const raw =
          typeof data === 'object' && data !== null ? data : parseModelJson(String(data));
        return TeachingHelpOutputSchema.parse(raw);
      };

      let assistance: TeachingHelpOutput;
      try {
        assistance = parseCompletion(completion.data);
      } catch {
        if (!aiGenerated) {
          await failRequest('Validation failed');
          throw new TeachingHelpGenerationError(
            'TEACHING_HELP_INVALID_OUTPUT',
            'Could not validate teaching assistance output.',
          );
        }
        const retry = await this.ai.generateTeachingHelp({
          mode: input.mode,
          lessonTitle: input.lessonTitle,
          chapterTitle: input.chapterTitle,
          classLabel: input.classLabel,
          subjectName: input.subjectName,
          bookTitle: input.bookTitle,
          objectives: input.objectives,
          stagesSummary: input.stagesSummary,
          chapterExcerpt: input.chapterExcerpt,
          teacherQuestion: input.teacherQuestion,
          repairInvalidJson: true,
          variety: input.variety,
        });
        completion = retry;
        try {
          assistance = parseCompletion(retry.data);
        } catch {
          await failRequest('Validation failed');
          throw new TeachingHelpGenerationError(
            'TEACHING_HELP_INVALID_OUTPUT',
            'AI output did not match the expected teaching plan format. Please try again.',
          );
        }
      }

      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: {
          status: AIRequestStatus.COMPLETED,
          provider: completion.provider,
          model: completion.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          estimatedCost: completion.estimatedCost,
        },
      });

      const result: GenerateTeachingHelpResult = {
        assistance,
        basis: input.basis,
        aiGenerated,
        cached: false,
        promptVersion: TEACHING_HELP_PROMPT_VERSION,
        mode: input.mode,
        provider: completion.provider,
        model: completion.model,
      };
      this.cache.set(cacheKey, result, CACHE_TTL_MS);
      return result;
    } catch (err) {
      if (err instanceof TeachingHelpGenerationError && err.code === 'TEACHING_HELP_UNAVAILABLE') {
        throw err;
      }
      await failRequest(err instanceof Error ? err.message : 'AI failed');
      const assistance = TeachingHelpOutputSchema.parse(
        heuristicTeachingHelp({
          lessonTitle: input.lessonTitle,
          chapterTitle: input.chapterTitle,
          classLabel: input.classLabel,
          subjectName: input.subjectName,
          objectives: input.objectives,
          bookTitle: input.bookTitle,
          mode: input.mode,
          chapterExcerpt: input.chapterExcerpt,
          variety: input.variety,
        }),
      );
      return {
        assistance,
        basis: input.basis,
        aiGenerated: false,
        cached: false,
        promptVersion: TEACHING_HELP_PROMPT_VERSION,
        mode: input.mode,
        provider: 'heuristic-fallback',
        model: 'heuristic',
      };
    }
  }

  async translateActivityText(input: {
    schoolId: string;
    userId: string;
    title: string;
    text: string;
  }): Promise<{ urdu: string; cached: boolean }> {
    const hash = createHash('sha256').update(input.text).digest('hex').slice(0, 24);
    const cacheKey = `activity-urdu:${hash}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached) return { urdu: cached, cached: true };

    const request = await this.prisma.aIRequest.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        type: AIRequestType.TEACHING_ASSISTANCE,
        provider: 'pending',
        model: 'pending',
        status: AIRequestStatus.PROCESSING,
        metadata: { kind: 'activity-urdu', title: input.title.slice(0, 120) },
      },
    });

    try {
      const completion = await this.ai.translateClassroomText({
        title: input.title,
        text: input.text,
      });
      const urdu = completion.data.urdu.trim();
      if (!urdu) throw new Error('The translation came back empty. Try again.');
      this.cache.set(cacheKey, urdu, CACHE_TTL_MS);
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: {
          status: AIRequestStatus.COMPLETED,
          provider: completion.provider,
          model: completion.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          estimatedCost: completion.estimatedCost,
        },
      });
      return { urdu, cached: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not translate this activity.';
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: { status: AIRequestStatus.FAILED, errorMessage: message.slice(0, 500) },
      });
      throw error;
    }
  }

  static contentHash(parts: string[]): string {
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
  }
}
