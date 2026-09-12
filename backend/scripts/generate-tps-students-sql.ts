/**
 * Offline generator: reads studentsList.csv and writes import-tps-students.sql
 * for MySQL Workbench. Does not connect to the database.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
  buildParentUsername,
  generateParentPassword,
  parentLocalEmail,
} from '../src/students/parent-accounts';

const CSV_PATH = path.resolve(__dirname, '../../../studentsList.csv');
const OUT_PATH = path.resolve(__dirname, '../../../import-tps-students.sql');

type ParsedRow = {
  classCode: string;
  className: string;
  compNo: string;
  admissionDateSql: string | null;
  studentFirst: string;
  studentLast: string;
  fatherFirst: string;
  fatherLast: string;
  phone: string | null;
};

function esc(value: string | null | undefined): string {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function mapClassCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (/^\d+$/.test(c)) return `Class ${Number(c)}`;
  if (c === 'P1') return 'Level 1';
  if (c === 'P2') return 'Level 2';
  if (c === 'NS') return 'Beginners';
  throw new Error(`Unknown class code: ${code}`);
}

function parseDateSql(value: string): string | null {
  const m = value.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  year += year >= 70 ? 1900 : 2000;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits === '0' || digits.length < 10) return null;
  return digits;
}

function splitPersonName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return { firstName: 'Unknown', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  let classCode: string | null = null;
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const header = line.match(/Class:,,([^,]+)/);
    if (header) {
      classCode = header[1].trim();
      continue;
    }
    if (!classCode || !/^\d+,/.test(line)) continue;

    const cols = line.split(',');
    const compNo = (cols[1] || '').trim();
    const nameField = (cols[9] || '').trim();
    if (!compNo || !nameField.includes('/')) continue;

    const [studentRaw, fatherRaw] = nameField.split('/').map((part) => part.trim());
    if (!studentRaw || !fatherRaw) continue;

    const phone = normalizePhone(cols[19]) || normalizePhone(cols[22]);
    const student = splitPersonName(studentRaw);
    const father = splitPersonName(fatherRaw);

    rows.push({
      classCode,
      className: mapClassCode(classCode),
      compNo,
      admissionDateSql: parseDateSql(cols[6] || ''),
      studentFirst: student.firstName,
      studentLast: student.lastName,
      fatherFirst: father.firstName,
      fatherLast: !father.lastName || father.lastName === '-' ? student.lastName : father.lastName,
      phone,
    });
  }
  return rows;
}

function uuid(): string {
  return randomUUID();
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  if (!rows.length) throw new Error('No students parsed');

  const lines: string[] = [];
  lines.push('-- TPS student import from studentsList.csv');
  lines.push('-- Run in MySQL Workbench against the sms database.');
  lines.push('-- Safe to re-run: skips existing student_code values.');
  lines.push('START TRANSACTION;');
  lines.push('');
  lines.push("SET @school_id = (SELECT id FROM schools WHERE code = 'TPS' LIMIT 1);");
  lines.push('SET @branch_id = (SELECT id FROM branches WHERE school_id = @school_id ORDER BY created_at ASC LIMIT 1);');
  lines.push('SET @year_id = (SELECT id FROM academic_years WHERE school_id = @school_id AND is_current = 1 LIMIT 1);');
  lines.push("SET @parent_role_id = (SELECT id FROM roles WHERE name = 'PARENT' LIMIT 1);");
  lines.push("SET @pre_stage_id = (SELECT id FROM school_stages WHERE school_id = @school_id AND name LIKE '%Pre%' ORDER BY sort_order ASC LIMIT 1);");
  lines.push('');
  lines.push('SELECT @school_id AS school_id, @branch_id AS branch_id, @year_id AS year_id, @parent_role_id AS parent_role_id;');
  lines.push('');
  lines.push('-- Ensure Beginners class exists for NS rows');
  lines.push("SET @beginners_id = (SELECT id FROM grades WHERE school_id = @school_id AND name = 'Beginners' LIMIT 1);");
  lines.push("INSERT INTO grades (id, school_id, stage_id, name, level, has_period_timetable, created_at, updated_at)");
  lines.push("SELECT UUID(), @school_id, @pre_stage_id, 'Beginners', 0, 0, NOW(3), NOW(3)");
  lines.push('FROM DUAL WHERE @beginners_id IS NULL AND @school_id IS NOT NULL;');
  lines.push("SET @beginners_id = (SELECT id FROM grades WHERE school_id = @school_id AND name = 'Beginners' LIMIT 1);");
  lines.push("INSERT INTO sections (id, school_id, branch_id, grade_id, name, created_at, updated_at)");
  lines.push("SELECT UUID(), @school_id, @branch_id, @beginners_id, 'A', NOW(3), NOW(3)");
  lines.push("FROM DUAL WHERE @beginners_id IS NOT NULL");
  lines.push('  AND NOT EXISTS (SELECT 1 FROM sections WHERE branch_id = @branch_id AND grade_id = @beginners_id AND name = \'A\');');
  lines.push('');

  const credLines: string[] = ['student_code,student,class,father_username,father_password,father_phone'];

  for (const row of rows) {
    const studentId = uuid();
    const enrollmentId = uuid();
    const userId = uuid();
    const parentProfileId = uuid();
    const studentParentId = uuid();
    const userRoleId = uuid();
    const password = generateParentPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const username = buildParentUsername('TPS', row.phone);
    const email = parentLocalEmail(username, 'TPS');
    const enrollDate = row.admissionDateSql ?? 'CURDATE()';
    const enrollDateSql = row.admissionDateSql ? esc(row.admissionDateSql) : 'CURDATE()';

    lines.push(`-- Comp# ${row.compNo} · ${row.className} · ${row.studentFirst} ${row.studentLast}`);
    lines.push(`SET @grade_id = (SELECT id FROM grades WHERE school_id = @school_id AND name = ${esc(row.className)} LIMIT 1);`);
    lines.push(`SET @section_id = (SELECT id FROM sections WHERE school_id = @school_id AND grade_id = @grade_id AND name = 'A' LIMIT 1);`);
    lines.push(`SET @exists = (SELECT id FROM students WHERE school_id = @school_id AND student_code = ${esc(row.compNo)} LIMIT 1);`);
    lines.push('');
    lines.push(`INSERT INTO students (id, school_id, branch_id, student_code, admission_number, first_name, last_name, status, created_at, updated_at)`);
    lines.push(`SELECT ${esc(studentId)}, @school_id, @branch_id, ${esc(row.compNo)}, ${esc(row.compNo)}, ${esc(row.studentFirst)}, ${esc(row.studentLast)}, 'ACTIVE', NOW(3), NOW(3)`);
    lines.push(`FROM DUAL WHERE @exists IS NULL AND @school_id IS NOT NULL AND @branch_id IS NOT NULL AND @grade_id IS NOT NULL AND @section_id IS NOT NULL;`);
    lines.push('');
    lines.push(`INSERT INTO student_enrollments (id, student_id, academic_year_id, grade_id, section_id, enrollment_date, status, created_at, updated_at)`);
    lines.push(`SELECT ${esc(enrollmentId)}, ${esc(studentId)}, @year_id, @grade_id, @section_id, ${enrollDateSql}, 'ACTIVE', NOW(3), NOW(3)`);
    lines.push(`FROM DUAL WHERE @exists IS NULL AND ROW_COUNT() >= 0 AND EXISTS (SELECT 1 FROM students WHERE id = ${esc(studentId)});`);
    lines.push('');

    // Parent: reuse existing parent user by phone when possible; else create
    if (row.phone) {
      lines.push(`SET @father_user_id = (SELECT id FROM users WHERE school_id = @school_id AND phone = ${esc(row.phone)} AND EXISTS (SELECT 1 FROM parent_profiles pp WHERE pp.user_id = users.id) LIMIT 1);`);
    } else {
      lines.push(`SET @father_user_id = NULL;`);
    }
    lines.push(`SET @student_ok = (SELECT id FROM students WHERE id = ${esc(studentId)} LIMIT 1);`);
    lines.push('');
    lines.push(`INSERT INTO users (id, email, username, password_hash, first_name, last_name, phone, school_id, status, must_change_password, created_at, updated_at)`);
    lines.push(`SELECT ${esc(userId)}, ${esc(email)}, ${esc(username)}, ${esc(passwordHash)}, ${esc(row.fatherFirst)}, ${esc(row.fatherLast)}, ${esc(row.phone)}, @school_id, 'ACTIVE', 1, NOW(3), NOW(3)`);
    lines.push(`FROM DUAL WHERE @student_ok IS NOT NULL AND @father_user_id IS NULL AND @exists IS NULL;`);
    lines.push('');
    lines.push(`INSERT INTO user_roles (id, user_id, role_id, school_id, created_at)`);
    lines.push(`SELECT ${esc(userRoleId)}, ${esc(userId)}, @parent_role_id, @school_id, NOW(3)`);
    lines.push(`FROM DUAL WHERE EXISTS (SELECT 1 FROM users WHERE id = ${esc(userId)});`);
    lines.push('');
    lines.push(`INSERT INTO parent_profiles (id, user_id, school_id, phone, created_at, updated_at)`);
    lines.push(`SELECT ${esc(parentProfileId)}, ${esc(userId)}, @school_id, ${esc(row.phone)}, NOW(3), NOW(3)`);
    lines.push(`FROM DUAL WHERE EXISTS (SELECT 1 FROM users WHERE id = ${esc(userId)});`);
    lines.push('');
    lines.push(`SET @link_parent_id = COALESCE(`);
    lines.push(`  (SELECT id FROM parent_profiles WHERE user_id = @father_user_id LIMIT 1),`);
    lines.push(`  (SELECT id FROM parent_profiles WHERE user_id = ${esc(userId)} LIMIT 1)`);
    lines.push(`);`);
    lines.push(`INSERT INTO student_parents (id, student_id, parent_id, relationship, is_primary, created_at)`);
    lines.push(`SELECT ${esc(studentParentId)}, ${esc(studentId)}, @link_parent_id, 'FATHER', 1, NOW(3)`);
    lines.push(`FROM DUAL WHERE @student_ok IS NOT NULL AND @link_parent_id IS NOT NULL`);
    lines.push(`  AND NOT EXISTS (SELECT 1 FROM student_parents WHERE student_id = ${esc(studentId)} AND parent_id = @link_parent_id);`);
    lines.push('');

    credLines.push(
      [
        row.compNo,
        `${row.studentFirst} ${row.studentLast}`,
        row.className,
        username,
        password,
        row.phone ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- Verification');
  lines.push("SELECT g.name AS class_name, COUNT(*) AS students");
  lines.push('FROM students s');
  lines.push('JOIN student_enrollments e ON e.student_id = s.id');
  lines.push('JOIN grades g ON g.id = e.grade_id');
  lines.push('WHERE s.school_id = @school_id');
  lines.push('GROUP BY g.name');
  lines.push('ORDER BY g.name;');

  fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');

  const credPath = path.resolve(__dirname, '../../../tps-parent-credentials.csv');
  fs.writeFileSync(credPath, credLines.join('\n'), 'utf8');

  console.log(
    JSON.stringify(
      {
        students: rows.length,
        sqlFile: OUT_PATH,
        credentialsFile: credPath,
        byClass: rows.reduce(
          (acc, row) => {
            acc[row.className] = (acc[row.className] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
