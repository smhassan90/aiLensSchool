import { Inject, Injectable } from '@nestjs/common';
import { AIRequestStatus, AIRequestType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_PROVIDER, AiProvider } from '../providers/ai.provider';

@Injectable()
export class HomeworkGenerationService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly prisma: PrismaService,
  ) {}

  async generate(input: {
    schoolId?: string | null;
    userId?: string | null;
    lessonSummary: string;
    subjectName?: string;
    gradeName?: string;
    styleInstruction?: string;
  }) {
    const request = await this.prisma.aIRequest.create({
      data: {
        schoolId: input.schoolId ?? undefined,
        userId: input.userId ?? undefined,
        type: AIRequestType.HOMEWORK_GENERATION,
        provider: 'pending',
        model: 'pending',
        status: AIRequestStatus.PROCESSING,
      },
    });

    try {
      const result = await this.ai.generateHomework({
        lessonSummary: input.lessonSummary,
        subjectName: input.subjectName,
        gradeName: input.gradeName,
        styleInstruction: input.styleInstruction,
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
        },
      });
      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Homework generation failed';
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: { status: AIRequestStatus.FAILED, errorMessage: message },
      });
      throw error;
    }
  }
}
