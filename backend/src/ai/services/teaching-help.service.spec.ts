import { Test, TestingModule } from '@nestjs/testing';

import { AIRequestType } from '@prisma/client';

import { TeachingHelpService } from './teaching-help.service';

import { FAST_AI_PROVIDER } from '../providers/ai.provider';

import { PrismaService } from '../../database/prisma.service';

import { MemoryCacheService } from '../../common/services/memory-cache.service';

import { TeachingHelpOutputSchema } from '../schemas/teaching-help.schema';

import { TeachingHelpGenerationError } from '../teaching-help-errors';



const validOutput = TeachingHelpOutputSchema.parse({

  overview: {

    subject: 'Math',

    classLabel: 'Grade 8',

    lessonTitle: 'Fractions',

    teachingOverview: 'Introduce fractions using the chapter examples and short practice.',

    estimatedDurationMinutes: 40,

    durationIsSuggestion: true,

  },

  learningObjectives: ['Understand parts of a whole as fractions.'],

  teacherExplanation: {

    simpleExplanation: 'Fractions name equal parts of a whole using a numerator and denominator.',

    stepByStep: ['Draw a rectangle divided into equal parts.'],

    terminology: [{ term: 'Numerator', definition: 'The top number counts selected parts.' }],

    examples: ['1/2 means one of two equal parts.'],

  },

  classroomDelivery: {

    warmUp: 'Ask students to share something they split equally.',

    teachingSteps: ['Model one example from the text.'],

    questionsDuringLesson: ['What does the bottom number mean?'],

    activity: null,

    recap: 'Summarize numerator and denominator.',

  },

  assessment: {

    formativeQuestions: [

      {

        question: 'Name the parts of a fraction.',

        expectedAnswer: 'Numerator and denominator.',

        kind: 'recall',

      },

    ],

    exitTicket: 'Write 3/4 and explain what it means.',

  },

  differentiation: { struggling: ['Use physical fraction strips.'], extension: ['Compare two fractions.'] },

  sourceAndConfidence: {

    sourcesUsed: ['Textbook Ch 3'],

    sourceSupportedClaims: ['Definition matches excerpt.'],

    pedagogicalSuggestions: ['Exit ticket is a teaching suggestion.'],

    missingOrAmbiguous: [],

    limitations: 'Excerpt only; no page numbers invented.',

  },

});



describe('TeachingHelpService', () => {

  const ai = {

    generateTeachingHelp: jest.fn(),

  };

  const prismaWrites: string[] = [];

  const prisma = {

    aIRequest: {

      create: jest.fn().mockImplementation(async (args) => {

        prismaWrites.push('aIRequest.create');

        expect(args.data.type).toBe(AIRequestType.TEACHING_ASSISTANCE);

        return { id: 'req-1' };

      }),

      update: jest.fn().mockImplementation(async () => {

        prismaWrites.push('aIRequest.update');

        return {};

      }),

    },

    academicPlanner: { update: jest.fn() },

    plannerLesson: { update: jest.fn() },

  };

  const cache = {

    get: jest.fn().mockReturnValue(undefined),

    set: jest.fn(),

  };



  let service: TeachingHelpService;



  beforeEach(async () => {

    jest.clearAllMocks();

    prismaWrites.length = 0;

    const module: TestingModule = await Test.createTestingModule({

      providers: [

        TeachingHelpService,

        { provide: FAST_AI_PROVIDER, useValue: ai },

        { provide: PrismaService, useValue: prisma },

        { provide: MemoryCacheService, useValue: cache },

      ],

    }).compile();

    service = module.get(TeachingHelpService);



    ai.generateTeachingHelp.mockResolvedValue({

      data: validOutput,

      provider: 'mock',

      model: 'test',

      inputTokens: 1,

      outputTokens: 1,

      estimatedCost: 0,

    });

  });



  const baseInput = {

    schoolId: 's1',

    userId: 'u1',

    versionId: 'v1',

    lessonKey: 'L1',

    contentHash: 'hash',

    mode: 'PREPARE_LESSON' as const,

    lessonTitle: 'Lesson',

    chapterTitle: 'Ch',

    classLabel: 'Grade 8',

    subjectName: 'Math',

    bookTitle: null,

    objectives: ['Understand fractions'],

    stagesSummary: 'EXPLANATION (40m)',

    chapterExcerpt: 'x'.repeat(100),

    basis: 'CHAPTER_TEXT' as const,

  };



  it('uses OBJECTIVES_ONLY basis without planner writes', async () => {

    const result = await service.generate({

      ...baseInput,

      chapterExcerpt: '',

      basis: 'OBJECTIVES_ONLY',

    });

    expect(result.basis).toBe('OBJECTIVES_ONLY');

    expect(result.assistance.learningObjectives.length).toBeGreaterThan(0);

    expect(prisma.academicPlanner.update).not.toHaveBeenCalled();

    expect(prisma.plannerLesson.update).not.toHaveBeenCalled();

    expect(prismaWrites.every((w) => w.startsWith('aIRequest'))).toBe(true);

  });



  it('includes mode in cache key', async () => {

    await service.generate(baseInput);

    const key = cache.set.mock.calls[0][0] as string;

    expect(key).toContain('PREPARE_LESSON');

  });



  it('throws on invalid AI output when provider is real', async () => {

    ai.generateTeachingHelp.mockResolvedValue({

      data: { invalid: true },

      provider: 'openai',

      model: 'gpt',

      inputTokens: 1,

      outputTokens: 1,

      estimatedCost: 0,

    });

    await expect(service.generate(baseInput)).rejects.toBeInstanceOf(TeachingHelpGenerationError);

  });

});


