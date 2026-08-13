import { BillingService } from './billing.service';

describe('BillingService.calculateBranchFee', () => {
  const service = new BillingService({} as never, {} as never);

  it('returns students * rate when above minimum', () => {
    // 100 students * 100 PKR = 10000 > 5000 min
    expect(service.calculateBranchFee(100, 100, 5000)).toBe(10000);
  });

  it('returns minimum when students * rate is below minimum', () => {
    // 10 * 100 = 1000 < 5000
    expect(service.calculateBranchFee(10, 100, 5000)).toBe(5000);
  });

  it('returns minimum when no active students', () => {
    expect(service.calculateBranchFee(0, 100, 5000)).toBe(5000);
  });

  it('equals either bound when exactly at minimum', () => {
    expect(service.calculateBranchFee(50, 100, 5000)).toBe(5000);
  });
});
