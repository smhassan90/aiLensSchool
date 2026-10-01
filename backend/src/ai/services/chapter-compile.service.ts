import { Inject, Injectable } from '@nestjs/common';
import { AIRequestStatus, AIRequestType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_PROVIDER, AiProvider } from '../providers/ai.provider';
import { OpenAiProvider } from '../providers/openai.provider';
import { ChapterCompileOutput } from '../schemas/chapter-compile.schema';

@Injectable()
export class ChapterCompileService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly openai: OpenAiProvider,
    private readonly prisma: PrismaService,
  ) {}

  async compile(input: {
    schoolId?: string | null;
    userId?: string | null;
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
    instruction?: string;
  }): Promise<ChapterCompileOutput> {
    const request = await this.prisma.aIRequest.create({
      data: {
        schoolId: input.schoolId ?? undefined,
        userId: input.userId ?? undefined,
        type: AIRequestType.LESSON_PROCESSING,
        provider: 'pending',
        model: 'pending',
        status: AIRequestStatus.PROCESSING,
      },
    });

    try {
      const provider = this.openai.hasJson() ? this.openai : this.ai;
      const result = await provider.compileChapter({
        sourceText: input.sourceText,
        subjectName: input.subjectName,
        gradeName: input.gradeName,
        instruction: input.instruction,
      });
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
            compilePreview: result.data.lessonBody.slice(0, 120),
          } as Prisma.InputJsonValue,
        },
      });
      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chapter compile failed';
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: {
          status: AIRequestStatus.FAILED,
          errorMessage: message,
        },
      });
      throw error;
    }
  }
}
