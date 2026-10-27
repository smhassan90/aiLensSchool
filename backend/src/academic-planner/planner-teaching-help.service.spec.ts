import { HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PlannerTeachingHelpService } from './planner-teaching-help.service';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { PlannerAccessService } from './planner-access.service';
import { PlannerContentService } from './planner-content.service';
import { TeachingHelpService } from '../ai/services/teaching-help.service';
import { TeachingHelpUsageService } from './teaching-help-usage';
import { TeachingHelpOutputSchema } from '../ai/schemas/teaching-help.schema';

const validAssistance = TeachingHelpOutputSchema.parse({
  overview: {
    subject: 'Math',
    classLabel: 'Grade 8',
    lessonTitle: 'Fractions',
    teachingOverview: 'Introduce fractions using examples from the assigned chapter excerpt.',
    estimatedDurationMinutes: null,
    durationIsSuggestion: true,
  },
  learningObjectives: ['Identify numerator and denominator in simple fractions.'],
  teacherExplanation: {
    simpleExplanation: 'A fraction names equal parts of a whole using two numbers.',
    stepByStep: ['Draw a shape divided into equal parts.'],
    terminology: [],
    examples: ['1/2 is one of two equal parts.'],
  },
  classroomDelivery: {
    warmUp: 'Ask students to name something they share equally.',
    teachingSteps: ['Model one fraction from the text.'],
    questionsDuringLesson: ['What does the denominator represent?'],
    activity: null,
    recap: 'Review numerator and denominator.',
  },
  assessment: {
    formativeQuestions: [
      {
        question: 'What is the numerator?',
        expectedAnswer: 'The top number counting selected parts.',
        kind: 'recall',
      },
    ],
    exitTicket: 'Write one fraction and label its parts.',
  },
  differentiation: { struggling: [], extension: [] },
  sourceAndConfidence: {
    sourcesUsed: ['Math Book — Chapter 2'],
    sourceSupportedClaims: [],
    pedagogicalSuggestions: [],
    missingOrAmbiguous: [],
    limitations: 'Based on retrieved excerpt only.',
  },
});

describe('PlannerTeachingHelpService', () => {
  const schoolId = 'school-a';
  const user = {
    id: 'user-1',
    schoolId,
    email: 't@school.test',
    firstName: 'T',
    lastName: 'Each',
    roles: [],
  } as import('../common/types/auth-user.type').AuthUser;

  const planner = {
    id: 'planner-1',
    schoolId,
    teacherId: 'teacher-profile-1',
    createdById: 'other-user',
    sectionId: 'section-1',
    approvedVersionId: 'version-1',
    subject: { name: 'Math' },
    section: { grade: { name: '8' }, name: 'A' },
    libraryBook: { id: 'book-1', title: 'Math Book' },
  };

  const lesson = {
    title: 'Lesson 1',
    objectives: ['Understand fractions'],
    portionKeys: [],
    stages: [],
    chapter: {
      contentHash: 'hash-1',
      titleSnapshot: 'Chapter 2',
      libraryBookChapterId: 'lib-ch-1',
      analysis: null,
    },
  };

  let service: PlannerTeachingHelpService;
  let helpEngine: { generate: jest.Mock };
  let usage: { assertWithinRateLimit: jest.Mock; dedupeInFlight: jest.Mock };
  let access: { resolveActor: jest.Mock };
  let content: { loadChapterText: jest.Mock };

  const prisma = {
    academicPlanner: { findFirst: jest.fn() },
    plannerLesson: { findFirst: jest.fn() },
    headTeacherSection: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    helpEngine = { generate: jest.fn() };
    usage = {
      assertWithinRateLimit: jest.fn(),
      dedupeInFlight: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
    };
    access = {
      resolveActor: jest.fn().mockResolvedValue({
        userId: 'user-1',
        teacherProfileId: 'teacher-profile-1',
        isPrincipalOrAdmin: false,
        isHeadTeacher: false,
      }),
    };
    content = {
      loadChapterText: jest.fn().mockResolvedValue({
        title: 'Chapter 2',
        text: 'x'.repeat(200),
      }),
    };

    prisma.academicPlanner.findFirst.mockResolvedValue(planner);
    prisma.plannerLesson.findFirst.mockResolvedValue(lesson);
    helpEngine.generate.mockResolvedValue({
      assistance: validAssistance,
      basis: 'CHAPTER_TEXT',
      aiGenerated: true,
      cached: false,
      promptVersion: 'teaching-help-v2',
      mode: 'PREPARE_LESSON',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerTeachingHelpService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantService,
          useValue: { requireSchoolId: () => schoolId },
        },
        { provide: PlannerAccessService, useValue: access },
        { provide: PlannerContentService, useValue: content },
        { provide: TeachingHelpService, useValue: helpEngine },
        { provide: TeachingHelpUsageService, useValue: usage },
      ],
    }).compile();

    service = module.get(PlannerTeachingHelpService);
  });

  it('returns teaching help for authorized teacher with bounded excerpt', async () => {
    const result = await service.teachingHelp(user, planner.id, 'L1');
    expect(result.assistance.overview.lessonTitle).toBeDefined();
    expect(usage.assertWithinRateLimit).toHaveBeenCalledWith(user.id, schoolId);
    expect(content.loadChapterText).toHaveBeenCalledWith(schoolId, 'lib-ch-1');
    const genInput = helpEngine.generate.mock.calls[0][0];
    expect(genInput.chapterExcerpt.length).toBeLessThanOrEqual(6000);
  });

  it('denies unauthorized teacher', async () => {
    access.resolveActor.mockResolvedValue({
      userId: 'stranger',
      teacherProfileId: 'other-teacher',
      isPrincipalOrAdmin: false,
      isHeadTeacher: false,
    });
    await expect(service.teachingHelp(user, planner.id, 'L1')).rejects.toBeInstanceOf(NotFoundException);
    expect(helpEngine.generate).not.toHaveBeenCalled();
  });

  it('returns unavailable when no text and no objectives', async () => {
    prisma.plannerLesson.findFirst.mockResolvedValue({
      ...lesson,
      objectives: [],
      chapter: { ...lesson.chapter, libraryBookChapterId: null },
    });
    await expect(service.teachingHelp(user, planner.id, 'L1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(helpEngine.generate).not.toHaveBeenCalled();
  });

  it('rejects rate limit before AI call', async () => {
    usage.assertWithinRateLimit.mockImplementation(() => {
      throw new HttpException({ code: 'TEACHING_HELP_RATE_LIMIT' }, 429);
    });
    await expect(service.teachingHelp(user, planner.id, 'L1')).rejects.toBeInstanceOf(HttpException);
    expect(helpEngine.generate).not.toHaveBeenCalled();
  });

  it('scopes planner lookup to tenant school', async () => {
    await service.teachingHelp(user, planner.id, 'L1');
    expect(prisma.academicPlanner.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: planner.id, schoolId } }),
    );
  });
});
