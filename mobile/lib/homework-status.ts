import { Homework } from '@/types/api';

export type HomeworkListStatus = 'submitted' | 'due_soon' | 'open' | 'overdue';

/** Still needs a submission from the selected child. */
export function needsHomeworkSubmission(item: Homework): boolean {
  return !item.result;
}

/** @deprecated Prefer needsHomeworkSubmission / getHomeworkListStatus */
export function isHomeworkPending(item: Homework): boolean {
  return needsHomeworkSubmission(item) && new Date(item.dueDate) >= new Date();
}

export function getHomeworkListStatus(item: Homework): HomeworkListStatus {
  if (item.result) return 'submitted';
  const due = new Date(item.dueDate).getTime();
  const now = Date.now();
  if (due < now) return 'overdue';
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  if (due - now <= twoDays) return 'due_soon';
  return 'open';
}

export function homeworkStatusLabel(status: HomeworkListStatus): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'due_soon':
      return 'Due soon';
    case 'overdue':
      return 'Overdue';
    default:
      return 'To do';
  }
}

export function homeworkStatusTone(
  status: HomeworkListStatus,
): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'submitted':
      return 'success';
    case 'due_soon':
    case 'overdue':
      return 'warning';
    default:
      return 'default';
  }
}

export function isHomeworkDueToday(item: Homework): boolean {
  const due = new Date(item.dueDate);
  const today = new Date();
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  );
}
