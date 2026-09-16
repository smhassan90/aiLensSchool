import { clampFeeDueDay, dueDateForMonth, isFeeOverdue, lateFeeProposal } from './late-fee';

describe('late fee helpers', () => {
  it('keeps the due day between 1 and 28', () => {
    expect(clampFeeDueDay(0)).toBe(1);
    expect(clampFeeDueDay(31)).toBe(28);
    expect(clampFeeDueDay(10)).toBe(10);
  });

  it('treats the day after the due date as overdue', () => {
    expect(isFeeOverdue('2026-09-10', new Date('2026-09-10T15:00:00Z'))).toBe(false);
    expect(isFeeOverdue('2026-09-10', new Date('2026-09-11T00:00:00Z'))).toBe(true);
  });

  it('builds a UTC due date on the configured day', () => {
    const due = dueDateForMonth(10, new Date('2026-09-12T12:00:00Z'));
    expect(due.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('proposes the school late fee only once, and not after a waiver', () => {
    const overdue = {
      dueDate: '2026-09-01',
      policyAmount: 200,
      at: new Date('2026-09-12'),
    };
    expect(lateFeeProposal(overdue).amount).toBe(200);
    expect(lateFeeProposal({ ...overdue, lateFeeCharged: 200 }).amount).toBe(0);
    expect(lateFeeProposal({ ...overdue, lateFeeWaived: true }).amount).toBe(0);
    expect(lateFeeProposal({ ...overdue, dueDate: '2026-09-20' }).amount).toBe(0);
  });
});
