import { syncClassFeeStructures } from './class-fees';

describe('syncClassFeeStructures', () => {
  it('creates monthly tuition and admission for a class', async () => {
    const db = {
      feeStructure: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    };

    await syncClassFeeStructures(db as never, {
      schoolId: 's1',
      gradeId: 'g1',
      gradeName: 'Class 1',
      admissionFee: 2000,
      tuitionFee: 5500,
    });

    expect(db.feeStructure.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId_name: { schoolId: 's1', name: 'Class 1 monthly tuition' } },
        create: expect.objectContaining({
          gradeId: 'g1',
          kind: 'TUITION',
          amount: 5500,
          frequency: 'MONTHLY',
        }),
      }),
    );
    expect(db.feeStructure.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId_name: { schoolId: 's1', name: 'Class 1 admission' } },
        create: expect.objectContaining({ kind: 'ADMISSION', amount: 2000, frequency: 'ONE_TIME' }),
      }),
    );
  });

  it('skips creating fees when amounts are empty', async () => {
    const db = {
      feeStructure: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    await syncClassFeeStructures(db as never, {
      schoolId: 's1',
      gradeId: 'g1',
      gradeName: 'Level 1',
    });

    expect(db.feeStructure.upsert).not.toHaveBeenCalled();
    expect(db.feeStructure.update).not.toHaveBeenCalled();
  });
});
