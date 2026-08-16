import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

export type GradeStylePreference = {
  keyPointStyle: string | null;
  homeworkStyle: string | null;
  diaryStyle: string | null;
};

type StyleRow = {
  key_point_style: string | null;
  homework_style: string | null;
  diary_style: string | null;
};

@Injectable()
export class TeacherGradeStyleService {
  constructor(private readonly prisma: PrismaService) {}

  async get(teacherId: string, gradeId: string): Promise<GradeStylePreference | null> {
    const rows = await this.prisma.$queryRaw<StyleRow[]>`
      SELECT key_point_style, homework_style, diary_style
      FROM teacher_grade_styles
      WHERE teacher_id = ${teacherId} AND grade_id = ${gradeId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      keyPointStyle: row.key_point_style,
      homeworkStyle: row.homework_style,
      diaryStyle: row.diary_style,
    };
  }

  async remember(input: {
    teacherId: string;
    gradeId: string;
    schoolId: string;
    keyPointStyle?: string;
    homeworkStyle?: string;
    diaryStyle?: string;
  }) {
    const keyPointStyle = input.keyPointStyle?.trim() || null;
    const homeworkStyle = input.homeworkStyle?.trim() || null;
    const diaryStyle = input.diaryStyle?.trim() || null;
    if (!keyPointStyle && !homeworkStyle && !diaryStyle) return;

    await this.prisma.$executeRaw`
      INSERT INTO teacher_grade_styles (
        id, teacher_id, grade_id, school_id, key_point_style, homework_style, diary_style, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${input.teacherId}, ${input.gradeId}, ${input.schoolId},
        ${keyPointStyle}, ${homeworkStyle}, ${diaryStyle}, NOW(), NOW()
      )
      ON DUPLICATE KEY UPDATE
        key_point_style = COALESCE(VALUES(key_point_style), key_point_style),
        homework_style = COALESCE(VALUES(homework_style), homework_style),
        diary_style = COALESCE(VALUES(diary_style), diary_style),
        updated_at = NOW()
    `;
  }
}
