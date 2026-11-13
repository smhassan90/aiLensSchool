import { isRowReturningSql, splitSqlStatements } from './platform-sql';

describe('splitSqlStatements', () => {
  it('keeps an ALTER statement and drops the comment', () => {
    const sql = `-- add activity columns
ALTER TABLE \`library_chapter_activity_items\`
    ADD COLUMN \`learning_objective\` TEXT NULL;`;
    expect(splitSqlStatements(sql)).toEqual([
      'ALTER TABLE `library_chapter_activity_items`\n    ADD COLUMN `learning_objective` TEXT NULL',
    ]);
    expect(isRowReturningSql(splitSqlStatements(sql)[0]!)).toBe(false);
  });

  it('splits two statements and keeps a semicolon inside a string', () => {
    const statements = splitSqlStatements("SELECT 'a;b'; SHOW TABLES;");
    expect(statements).toEqual(["SELECT 'a;b'", 'SHOW TABLES']);
    expect(statements.every(isRowReturningSql)).toBe(true);
  });
});
