import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ParentsService } from './parents.service';

describe('ParentsService day-off rules', () => {
  const user = { id: 'parent-user', schoolId: 'school-1', roles: ['PARENT'] } as any;
  const tenant = {
    requireSchoolId: jest.fn().mockReturnValue('school-1'),
    isParent: jest.fn().mockReturnValue(true),
  } as any;
  const prisma = {
    parentDayOffRequest: {
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue({ id: 'request-1' }),
    },
  } as any;
  const service = new ParentsService(prisma, tenant, {} as any, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('allows a parent to delete a pending request before its start date', async () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    prisma.parentDayOffRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      startDate: tomorrow,
    });

    await expect(service.deleteDayOffRequest('request-1', user)).resolves.toEqual({ id: 'request-1' });
    expect(prisma.parentDayOffRequest.delete).toHaveBeenCalledWith({ where: { id: 'request-1' } });
  });

  it('blocks deletion on the applicable date', async () => {
    prisma.parentDayOffRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      startDate: new Date(new Date().toISOString().slice(0, 10)),
    });

    await expect(service.deleteDayOffRequest('request-1', user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.parentDayOffRequest.delete).not.toHaveBeenCalled();
  });

  it('does not allow deleting another parent request', async () => {
    prisma.parentDayOffRequest.findFirst.mockResolvedValue(null);

    await expect(service.deleteDayOffRequest('request-1', user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
