export function isDeadlineOpen(
  dueAt: Date | null | undefined,
  unlockedUntil: Date | null | undefined,
): boolean {
  const now = new Date();
  if (unlockedUntil && now.getTime() <= unlockedUntil.getTime()) return true;
  if (!dueAt) return true;
  const end = new Date(dueAt);
  end.setHours(23, 59, 59, 999);
  return now.getTime() <= end.getTime();
}

export function deadlineBlockedMessage(kind: 'paper' | 'score') {
  if (kind === 'paper') {
    return 'The exam paper submission due date has passed. Please contact the school admin.';
  }
  return 'The score entry due date has passed. Please contact the school admin.';
}
