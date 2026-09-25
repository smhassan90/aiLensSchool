export type NormalizedPunch = {
  deviceUserId: string;
  recordTime: Date;
  direction: 'in' | 'out';
};

export type PunchTimeMode = 'school_local' | 'utc';

export function resolveDeviceUserId(raw: Record<string, unknown>): string | null {
  const keys = ['deviceUserId', 'uid', 'id', 'userSn'];
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

export function parseRecordTime(
  raw: string | number | Date,
  timeZone: string,
  punchTimeMode: PunchTimeMode,
): Date {
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return new Date(ms);
  }
  const text = String(raw).trim();
  if (!text) return new Date(Number.NaN);

  if (punchTimeMode === 'utc') {
    return new Date(text);
  }

  const naive = text.replace(/Z$/i, '').replace(/\.\d{3}$/, '');
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(naive);
  if (!match) return new Date(text);

  const [, y, mo, d, h, mi, s] = match;
  const utcGuess = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? '0'),
  );
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let adjusted = utcGuess;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(adjusted));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const localAsUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    const delta = utcGuess - localAsUtc;
    adjusted += delta;
    if (Math.abs(delta) < 1000) break;
  }
  return new Date(adjusted);
}

export function punchDirectionFromRaw(
  type?: number | null,
  state?: number | null,
): 'in' | 'out' | null {
  const value = type ?? state;
  if (value === 0) return 'in';
  if (value === 1) return 'out';
  return null;
}

export function latestPunch(existing: Date | null | undefined, incoming: Date): Date {
  if (!existing) return incoming;
  return existing >= incoming ? existing : incoming;
}

export function normalizeTeacherName(first: string, last: string): string {
  return `${first} ${last}`.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Badge ghost: another user's uid equals this row's badge id. */
export function isBadgeGhostUser(
  user: { deviceUserId: string; deviceBadgeId?: string | null },
  allUsers: Array<{ deviceUserId: string; deviceBadgeId?: string | null }>,
): boolean {
  const badge = user.deviceBadgeId?.trim();
  if (!badge) return false;
  return allUsers.some(
    (other) => other.deviceUserId !== user.deviceUserId && other.deviceUserId === badge,
  );
}
