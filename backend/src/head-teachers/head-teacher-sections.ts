import { PrismaService } from '../database/prisma.service';

/** Section IDs supervised by this user as head teacher (empty if not a head teacher). */
export async function resolveHeadTeacherSectionIds(
  prisma: PrismaService,
  schoolId: string,
  userId: string,
): Promise<string[]> {
  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!teacher) return [];

  const assignment = await prisma.headTeacherAssignment.findFirst({
    where: { schoolId, teacherId: teacher.id },
    select: { sections: { select: { sectionId: true } } },
  });
  if (!assignment?.sections.length) return [];
  return assignment.sections.map((row) => row.sectionId);
}

export function canAccessExamPaperAssignment(
  teacherId: string,
  assignment: { teacherId: string | null; sectionId: string; subjectId: string },
  teachKeys: Set<string>,
  headSectionIds: string[],
): boolean {
  if (headSectionIds.includes(assignment.sectionId)) {
    return true;
  }
  const key = `${assignment.sectionId}:${assignment.subjectId}`;
  if (!teachKeys.has(key)) {
    return false;
  }
  if (assignment.teacherId && assignment.teacherId !== teacherId) {
    return false;
  }
  return true;
}
