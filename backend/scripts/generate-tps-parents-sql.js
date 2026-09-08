/**
 * Offline: build parent accounts SQL + credentials CSV for already-imported TPS students.
 * Username: tps.<phone>  Password: Password123 (must change on first login)
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const CSV_PATH = path.resolve(__dirname, '../../../studentsList.csv');
const SQL_PATH = path.resolve(__dirname, '../../../import-tps-parents.sql');
const CRED_PATH = path.resolve(__dirname, '../../../tps-parent-credentials.csv');
const DEFAULT_PARENT_PASSWORD = 'Password123';

function slugPart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildParentUsername(schoolCode, phone, attempt = 0) {
  const school = slugPart(schoolCode) || 'school';
  const digits = String(phone || '').replace(/\D/g, '');
  const base = digits ? `${school}.${digits}` : `${school}.parent`;
  return attempt ? `${base}.${attempt}` : base;
}

function parentLocalEmail(username, schoolCode) {
  return `${username}@${slugPart(schoolCode) || 'school'}.parent.local`;
}

function esc(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits || digits === '0' || digits.length < 10) return null;
  return digits;
}

function splitName(full) {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return { first: 'Father', last: '-' };
  if (parts.length === 1) return { first: parts[0], last: '-' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function parseCsv(text) {
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
    const phone = normalizePhone(cols[19]) || normalizePhone(cols[22]);
    const father = splitName(fatherRaw);
    const student = splitName(studentRaw);
    rows.push({
      compNo,
      student: `${student.first} ${student.last}`.trim(),
      fatherFirst: father.first,
      fatherLast: father.last === '-' ? student.last : father.last,
      phone,
    });
  }
  return rows;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  const phoneCreds = new Map();
  const sql = [];
  const creds = ['username,password,father_name,phone,student_code,student_name'];

  sql.push('-- TPS parent logins for already-imported students');
  sql.push('-- Username format: tps.<phone>   e.g. tps.032123234543');
  sql.push('-- Passwords are in tps-parent-credentials.csv (same folder)');
  sql.push('START TRANSACTION;');
  sql.push('');
  sql.push("SET @school_id = (SELECT id FROM schools WHERE code = 'TPS' LIMIT 1);");
  sql.push("SET @parent_role_id = (SELECT id FROM roles WHERE name = 'PARENT' LIMIT 1);");
  sql.push('');

  let created = 0;
  let skippedNoPhone = 0;
  const password = DEFAULT_PARENT_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);

  for (const row of rows) {
    if (!row.phone) {
      skippedNoPhone += 1;
      continue;
    }

    let username;
    let userId;
    let parentProfileId;
    let reuse = false;

    if (phoneCreds.has(row.phone)) {
      const shared = phoneCreds.get(row.phone);
      username = shared.username;
      userId = shared.userId;
      parentProfileId = shared.parentProfileId;
      reuse = true;
    } else {
      username = buildParentUsername('TPS', row.phone);
      userId = randomUUID();
      parentProfileId = randomUUID();
      phoneCreds.set(row.phone, { username, userId, parentProfileId });
      created += 1;

      const email = parentLocalEmail(username, 'TPS');
      const userRoleId = randomUUID();

      sql.push(`-- Parent ${username} · ${row.fatherFirst} ${row.fatherLast}`);
      sql.push(`INSERT INTO users (id, email, username, password_hash, first_name, last_name, phone, school_id, status, must_change_password, created_at, updated_at)`);
      sql.push(`SELECT ${esc(userId)}, ${esc(email)}, ${esc(username)}, ${esc(passwordHash)}, ${esc(row.fatherFirst)}, ${esc(row.fatherLast)}, ${esc(row.phone)}, @school_id, 'ACTIVE', 1, NOW(3), NOW(3)`);
      sql.push(`FROM DUAL WHERE @school_id IS NOT NULL`);
      sql.push(`  AND NOT EXISTS (SELECT 1 FROM users WHERE school_id = @school_id AND (username = ${esc(username)} OR phone = ${esc(row.phone)}));`);
      sql.push('');
      sql.push(`SET @parent_user_id = COALESCE(`);
      sql.push(`  (SELECT id FROM users WHERE id = ${esc(userId)} LIMIT 1),`);
      sql.push(`  (SELECT id FROM users WHERE school_id = @school_id AND phone = ${esc(row.phone)} AND EXISTS (SELECT 1 FROM parent_profiles pp WHERE pp.user_id = users.id) LIMIT 1),`);
      sql.push(`  (SELECT id FROM users WHERE school_id = @school_id AND username = ${esc(username)} LIMIT 1)`);
      sql.push(`);`);
      sql.push(`INSERT INTO user_roles (id, user_id, role_id, school_id, created_at)`);
      sql.push(`SELECT ${esc(userRoleId)}, @parent_user_id, @parent_role_id, @school_id, NOW(3)`);
      sql.push(`FROM DUAL WHERE @parent_user_id IS NOT NULL`);
      sql.push(`  AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = @parent_user_id AND role_id = @parent_role_id AND school_id = @school_id);`);
      sql.push(`INSERT INTO parent_profiles (id, user_id, school_id, phone, created_at, updated_at)`);
      sql.push(`SELECT ${esc(parentProfileId)}, @parent_user_id, @school_id, ${esc(row.phone)}, NOW(3), NOW(3)`);
      sql.push(`FROM DUAL WHERE @parent_user_id IS NOT NULL`);
      sql.push(`  AND NOT EXISTS (SELECT 1 FROM parent_profiles WHERE user_id = @parent_user_id);`);
      sql.push('');

      creds.push(
        [username, password, `${row.fatherFirst} ${row.fatherLast}`, row.phone, row.compNo, row.student]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
    }

    const linkId = randomUUID();
    sql.push(`-- Link student ${row.compNo} ${row.student} → ${username}`);
    sql.push(`SET @student_id = (SELECT id FROM students WHERE school_id = @school_id AND student_code = ${esc(row.compNo)} LIMIT 1);`);
    sql.push(`SET @link_parent_id = COALESCE(`);
    sql.push(`  (SELECT id FROM parent_profiles WHERE user_id = ${esc(userId)} LIMIT 1),`);
    sql.push(`  (SELECT pp.id FROM parent_profiles pp JOIN users u ON u.id = pp.user_id WHERE u.school_id = @school_id AND u.phone = ${esc(row.phone)} LIMIT 1),`);
    sql.push(`  (SELECT pp.id FROM parent_profiles pp JOIN users u ON u.id = pp.user_id WHERE u.school_id = @school_id AND u.username = ${esc(username)} LIMIT 1)`);
    sql.push(`);`);
    sql.push(`INSERT INTO student_parents (id, student_id, parent_id, relationship, is_primary, created_at)`);
    sql.push(`SELECT ${esc(linkId)}, @student_id, @link_parent_id, 'FATHER', 1, NOW(3)`);
    sql.push(`FROM DUAL WHERE @student_id IS NOT NULL AND @link_parent_id IS NOT NULL`);
    sql.push(`  AND NOT EXISTS (SELECT 1 FROM student_parents WHERE student_id = @student_id AND parent_id = @link_parent_id);`);
    sql.push('');

    if (reuse) {
      // already in credentials once
    }
  }

  sql.push('COMMIT;');
  sql.push('');
  sql.push("SELECT u.username, u.phone, u.first_name, u.last_name, COUNT(sp.id) AS children");
  sql.push('FROM users u');
  sql.push('JOIN parent_profiles pp ON pp.user_id = u.id');
  sql.push('LEFT JOIN student_parents sp ON sp.parent_id = pp.id');
  sql.push("WHERE u.school_id = @school_id");
  sql.push('GROUP BY u.id, u.username, u.phone, u.first_name, u.last_name');
  sql.push('ORDER BY u.username;');

  fs.writeFileSync(SQL_PATH, sql.join('\n'), 'utf8');
  fs.writeFileSync(CRED_PATH, creds.join('\n'), 'utf8');

  console.log(
    JSON.stringify(
      {
        parentAccounts: created,
        skippedNoPhone,
        studentsLinked: rows.length - skippedNoPhone,
        sqlFile: SQL_PATH,
        credentialsFile: CRED_PATH,
        defaultPassword: password,
        mustChangePassword: true,
        exampleUsername: phoneCreds.size ? [...phoneCreds.values()][0].username : null,
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
