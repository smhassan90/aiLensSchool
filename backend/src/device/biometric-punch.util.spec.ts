import {
  isBadgeGhostUser,
  parseRecordTime,
  punchDirectionFromRaw,
  resolveDeviceUserId,
} from './biometric-punch.util';

describe('biometric-punch.util', () => {
  it('resolves device user id from alternate keys', () => {
    expect(resolveDeviceUserId({ uid: '7' })).toBe('7');
    expect(resolveDeviceUserId({ userSn: '9' })).toBe('9');
  });

  it('maps punch direction', () => {
    expect(punchDirectionFromRaw(0, null)).toBe('in');
    expect(punchDirectionFromRaw(null, 1)).toBe('out');
  });

  it('parses school_local wall time', () => {
    const instant = parseRecordTime('2026-03-24T08:15:00', 'Asia/Karachi', 'school_local');
    expect(Number.isNaN(instant.getTime())).toBe(false);
  });

  it('detects badge ghost users', () => {
    const users = [
      { deviceUserId: '1', deviceBadgeId: null },
      { deviceUserId: '99', deviceBadgeId: '1' },
    ];
    expect(isBadgeGhostUser(users[1], users)).toBe(true);
    expect(isBadgeGhostUser(users[0], users)).toBe(false);
  });
});
