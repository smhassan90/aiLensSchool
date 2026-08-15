import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { AIRequestStatus, AIRequestType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_PROVIDER, AiProvider } from '../providers/ai.provider';
import { QuizOutput } from '../schemas/quiz-output.schema';

@Injectable()
export class QuizGenerationService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly prisma: PrismaService,
  ) {}

  async generate(input: {
    schoolId?: string | null;
    userId?: string | null;
    lessonSummaries: string[];
    subjectName?: string;
    questionCount?: number;
    quickGenerate?: boolean;
    mcqCount?: number;
    fillBlankCount?: number;
    shortAnswerCount?: number;
  }): Promise<QuizOutput> {
    const request = await this.prisma.aIRequest.create({
      data: {
        schoolId: input.schoolId ?? undefined,
        userId: input.userId ?? undefined,
        type: AIRequestType.QUIZ_GENERATION,
        provider: 'pending',
        model: 'pending',
        status: AIRequestStatus.PROCESSING,
      },
    });

    try {
      const result = await this.ai.generateQuiz({
        lessonSummaries: input.lessonSummaries,
        subjectName: input.subjectName,
        questionCount: input.questionCount,
        quickGenerate: input.quickGenerate,
        mcqCount: input.mcqCount,
        fillBlankCount: input.fillBlankCount,
        shortAnswerCount: input.shortAnswerCount,
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
            questionCount: result.data.questions.length,
          } as Prisma.InputJsonValue,
        },
      });

      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quiz generation failed';
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: { status: AIRequestStatus.FAILED, errorMessage: message },
      });
      throw new BadGatewayException({
        code: 'QUIZ_GENERATION_FAILED',
        message,
      });
    }
  }
}
