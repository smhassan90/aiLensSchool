import { studentSearchWhere } from './student-search';

describe('studentSearchWhere', () => {
  it('requires every word to match so Abdul H finds Abdul Hadi', () => {
    const where = studentSearchWhere('Abdul H');
    expect(where?.AND).toHaveLength(2);
    const tokens = (where?.AND ?? []) as Array<{ OR: Array<{ firstName?: { contains: string } }> }>;
    expect(tokens[0].OR.some((clause) => clause.firstName?.contains === 'Abdul')).toBe(true);
    expect(tokens[1].OR.some((clause) => clause.firstName?.contains === 'H')).toBe(true);
  });

  it('returns undefined for blank search', () => {
    expect(studentSearchWhere('  ')).toBeUndefined();
  });
});
