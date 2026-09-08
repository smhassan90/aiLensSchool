const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const CSV_PATH = path.resolve(__dirname, '../../../studentsList.csv');
const OUT_PATH = path.resolve(__dirname, '../../../import-tps-students.sql');

function esc(v) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function mapClass(code) {
  const c = String(code).trim().toUpperCase();
  if (/^\d+$/.test(c)) return `Class ${Number(c)}`;
  if (c === 'P1') return 'Level 1';
  if (c === 'P2') return 'Level 2';
  if (c === 'NS') return 'Beginners';
  throw new Error(`Unknown class: ${code}`);
}

function parseDate(value) {
  const m = String(value || '').trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let y = Number(m[3]);
  y += y >= 70 ? 1900 : 2000;
  return `${y}-${m[2]}-${m[1]}`;
}

function splitName(full) {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return { first: 'Unknown', last: '-' };
  if (parts.length === 1) return { first: parts[0], last: '-' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const text = fs.readFileSync(CSV_PATH, 'utf8');
const lines = text.split(/\r?\n/);
let classCode = null;
const rows = [];

for (const line of lines) {
  const h = line.match(/Class:,,([^,]+)/);
  if (h) {
    classCode = h[1].trim();
    continue;
  }
  if (!classCode || !/^\d+,/.test(line)) continue;
  const cols = line.split(',');
  const compNo = (cols[1] || '').trim();
  const nameField = (cols[9] || '').trim();
  if (!compNo || !nameField.includes('/')) continue;
  const [studentRaw, fatherRaw] = nameField.split('/').map((p) => p.trim());
  if (!studentRaw || !fatherRaw) continue;
  const student = splitName(studentRaw);
  rows.push({
    className: mapClass(classCode),
    compNo,
    first: student.first,
    last: student.last,
    enrollDate: parseDate(cols[6]),
  });
}

const out = [];
out.push('-- TPS students from studentsList.csv');
out.push('-- Run against sms database in Workbench');
out.push('START TRANSACTION;');
out.push('');
out.push("SET @school_id = (SELECT id FROM schools WHERE code = 'TPS' LIMIT 1);");
out.push('SET @branch_id = (SELECT id FROM branches WHERE school_id = @school_id ORDER BY created_at ASC LIMIT 1);');
out.push('SET @year_id = (SELECT id FROM academic_years WHERE school_id = @school_id AND is_current = 1 LIMIT 1);');
out.push("SET @pre_stage_id = (SELECT id FROM school_stages WHERE school_id = @school_id AND name LIKE '%Pre%' ORDER BY sort_order ASC LIMIT 1);");
out.push('');
out.push('-- Beginners class for NS rows (skip if already exists)');
out.push("INSERT INTO grades (id, school_id, stage_id, name, level, has_period_timetable, created_at, updated_at)");
out.push("SELECT UUID(), @school_id, @pre_stage_id, 'Beginners', 0, 0, NOW(3), NOW(3)");
out.push("FROM DUAL WHERE @school_id IS NOT NULL");
out.push("  AND NOT EXISTS (SELECT 1 FROM grades WHERE school_id = @school_id AND name = 'Beginners');");
out.push("SET @beginners_id = (SELECT id FROM grades WHERE school_id = @school_id AND name = 'Beginners' LIMIT 1);");
out.push("INSERT INTO sections (id, school_id, branch_id, grade_id, name, created_at, updated_at)");
out.push("SELECT UUID(), @school_id, @branch_id, @beginners_id, 'A', NOW(3), NOW(3)");
out.push("FROM DUAL WHERE @beginners_id IS NOT NULL");
out.push("  AND NOT EXISTS (SELECT 1 FROM sections WHERE branch_id = @branch_id AND grade_id = @beginners_id AND name = 'A');");
out.push('');

for (const row of rows) {
  const studentId = randomUUID();
  const enrollmentId = randomUUID();
  const enrollDate = row.enrollDate ? esc(row.enrollDate) : 'CURDATE()';
  out.push(`-- ${row.compNo} ${row.first} ${row.last} / ${row.className}`);
  out.push(`INSERT INTO students (id, school_id, branch_id, student_code, admission_number, first_name, last_name, status, created_at, updated_at)`);
  out.push(`SELECT ${esc(studentId)}, @school_id, @branch_id, ${esc(row.compNo)}, ${esc(row.compNo)}, ${esc(row.first)}, ${esc(row.last)}, 'ACTIVE', NOW(3), NOW(3)`);
  out.push(`FROM DUAL`);
  out.push(`WHERE @school_id IS NOT NULL AND @branch_id IS NOT NULL`);
  out.push(`  AND NOT EXISTS (SELECT 1 FROM students WHERE school_id = @school_id AND student_code = ${esc(row.compNo)});`);
  out.push('');
  out.push(`INSERT INTO student_enrollments (id, student_id, academic_year_id, grade_id, section_id, enrollment_date, status, created_at, updated_at)`);
  out.push(`SELECT ${esc(enrollmentId)}, s.id, @year_id, g.id, sec.id, ${enrollDate}, 'ACTIVE', NOW(3), NOW(3)`);
  out.push(`FROM students s`);
  out.push(`JOIN grades g ON g.school_id = s.school_id AND g.name = ${esc(row.className)}`);
  out.push(`JOIN sections sec ON sec.grade_id = g.id AND sec.name = 'A' AND sec.school_id = s.school_id`);
  out.push(`WHERE s.id = ${esc(studentId)}`);
  out.push(`  AND @year_id IS NOT NULL`);
  out.push(`  AND NOT EXISTS (SELECT 1 FROM student_enrollments e WHERE e.student_id = s.id AND e.academic_year_id = @year_id);`);
  out.push('');
}

out.push('COMMIT;');
out.push('');
out.push("SELECT g.name AS class_name, COUNT(*) AS students");
out.push('FROM students s');
out.push('JOIN student_enrollments e ON e.student_id = s.id');
out.push('JOIN grades g ON g.id = e.grade_id');
out.push('WHERE s.school_id = @school_id');
out.push('GROUP BY g.name');
out.push('ORDER BY g.name;');

fs.writeFileSync(OUT_PATH, out.join('\n'), 'utf8');
console.log(`Wrote ${rows.length} students to ${OUT_PATH}`);
