import { Inject, Injectable } from '@nestjs/common';
import { AIRequestStatus, AIRequestType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_PROVIDER, AiProvider } from '../providers/ai.provider';
import { LessonOutput } from '../schemas/lesson-output.schema';

@Injectable()
export class LessonProcessingService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly prisma: PrismaService,
  ) {}

  async process(input: {
    schoolId?: string | null;
    userId?: string | null;
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
  }): Promise<LessonOutput> {
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
      const result = await this.ai.processLesson({
        sourceText: input.sourceText,
        subjectName: input.subjectName,
        gradeName: input.gradeName,
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
            summaryPreview: result.data.summary.slice(0, 200),
          } as Prisma.InputJsonValue,
        },
      });

      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lesson processing failed';
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
