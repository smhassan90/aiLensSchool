import { Inject, Injectable } from '@nestjs/common';
import { AIRequestStatus, AIRequestType, PlannerAnalysisSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FAST_AI_PROVIDER, AiProvider } from '../providers/ai.provider';
import { parseModelJson } from '../parse-model-json';
import {
  PlannerChapterAnalysis,
  PlannerChapterAnalysisSchema,
} from '../schemas/planner-chapter-analysis.schema';
import { heuristicChapterAnalysis } from '../../academic-planner/subject-profiles';
import { PLANNER_PROMPT_VERSION } from '../prompts';

export type AnalyzeChapterResult = {
  analysis: PlannerChapterAnalysis & { meta?: Record<string, unknown> };
  source: PlannerAnalysisSource;
  warnings: Array<{ code: string; message: string }>;
};

@Injectable()
export class PlannerChapterAnalysisService {
  constructor(
    @Inject(FAST_AI_PROVIDER) private readonly ai: AiProvider,
    private readonly prisma: PrismaService,
  ) {}

  async analyze(input: {
    schoolId: string;
    userId: string;
    chapterTitle: string;
    chapterText: string;
    subjectName: string;
    classLabel: string;
    gradeLevel: number;
    periodMinutes: number;
    activityCount: number;
    activitiesEnabled: boolean;
    contentMissing: boolean;
    force?: boolean;
  }): Promise<AnalyzeChapterResult> {
    const warnings: AnalyzeChapterResult['warnings'] = [];

    if (input.contentMissing || input.chapterText.trim().length < 200) {
      const heuristic = heuristicChapterAnalysis({
        chapterTitle: input.chapterTitle,
        chapterText: input.chapterText || input.chapterTitle,
        subjectName: input.subjectName,
        periodMinutes: input.periodMinutes,
        activityCount: input.activityCount,
        activitiesEnabled: input.activitiesEnabled,
      });
      return {
        analysis: {
          ...PlannerChapterAnalysisSchema.parse(heuristic),
          meta: { promptVersion: PLANNER_PROMPT_VERSION, provisional: true },
        },
        source: PlannerAnalysisSource.PROVISIONAL,
        warnings: [{ code: 'CHAPTER_CONTENT_MISSING', message: 'Chapter text is missing or too short for AI analysis' }],
      };
    }

    const request = await this.prisma.aIRequest.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        type: AIRequestType.PLANNER_CHAPTER_ANALYSIS,
        provider: 'pending',
        model: 'pending',
        status: AIRequestStatus.PROCESSING,
      },
    });

    try {
      const result = await this.ai.analyzePlannerChapter({
        chapterTitle: input.chapterTitle,
        chapterText: input.chapterText.slice(0, 24000),
        subjectName: input.subjectName,
        classLabel: input.classLabel,
        gradeLevel: input.gradeLevel,
        periodMinutes: input.periodMinutes,
        activityCount: input.activityCount,
        activitiesEnabled: input.activitiesEnabled,
      });

      let parsed: PlannerChapterAnalysis;
      try {
        parsed = PlannerChapterAnalysisSchema.parse(
          typeof result.data === 'object' ? result.data : parseModelJson(String(result.data)),
        );
      } catch {
        warnings.push({ code: 'AI_OUTPUT_INVALID', message: 'AI output failed validation; using provisional analysis' });
        const heuristic = heuristicChapterAnalysis({
          chapterTitle: input.chapterTitle,
          chapterText: input.chapterText,
          subjectName: input.subjectName,
          periodMinutes: input.periodMinutes,
          activityCount: input.activityCount,
          activitiesEnabled: input.activitiesEnabled,
        });
        parsed = PlannerChapterAnalysisSchema.parse(heuristic);
        await this.prisma.aIRequest.update({
          where: { id: request.id },
          data: { status: AIRequestStatus.FAILED, errorMessage: 'Validation failed' },
        });
        return {
          analysis: {
            ...parsed,
            meta: {
              promptVersion: PLANNER_PROMPT_VERSION,
              gradeLevel: input.gradeLevel,
              periodMinutes: input.periodMinutes,
              model: result.model,
              provider: result.provider,
            },
          },
          source: PlannerAnalysisSource.PROVISIONAL,
          warnings,
        };
      }

      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: {
          provider: result.provider,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCost: result.estimatedCost,
          status: AIRequestStatus.COMPLETED,
          metadata: {
            promptVersion: PLANNER_PROMPT_VERSION,
            chars: input.chapterText.length,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        analysis: {
          ...parsed,
          meta: {
            promptVersion: PLANNER_PROMPT_VERSION,
            gradeLevel: input.gradeLevel,
            periodMinutes: input.periodMinutes,
            model: result.model,
            provider: result.provider,
          },
        },
        source: PlannerAnalysisSource.AI,
        warnings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: { status: AIRequestStatus.FAILED, errorMessage: message },
      });
      warnings.push({ code: 'AI_UNAVAILABLE', message });
      const heuristic = heuristicChapterAnalysis({
        chapterTitle: input.chapterTitle,
        chapterText: input.chapterText,
        subjectName: input.subjectName,
        periodMinutes: input.periodMinutes,
        activityCount: input.activityCount,
        activitiesEnabled: input.activitiesEnabled,
      });
      return {
        analysis: {
          ...PlannerChapterAnalysisSchema.parse(heuristic),
          meta: { promptVersion: PLANNER_PROMPT_VERSION, fallback: true },
        },
        source: PlannerAnalysisSource.PROVISIONAL,
        warnings,
      };
    }
  }
}
