import { Weekday } from '@prisma/client';
import { parseTimetableCsv } from './timetable-csv';

const CLASS_ONE_CSV = `PERIOD,TIME,MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY
    THE PIERCING STARS,,,,,,
    CLASS I,,,,,,
1,8:00 - 8:45,"QAIDA / NAZRA
Muallima Hadiqa","QAIDA / NAZRA
Muallima Hadiqa","QAIDA / NAZRA
Muallima Hadiqa","QAIDA / NAZRA
Muallima Hadiqa","QAIDA / NAZRA
Muallima Hadiqa"
2,8:45 - 9:30,"PT
Sir Daniyal","SST
Miss Alisha","SST
Miss Alisha","SST
Miss Alisha","ARTS
Miss Alisha"
,10:15 - 10:30,BREAK TIME,BREAK TIME,BREAK TIME,BREAK TIME,BREAK TIME
4,10:30 - 11:15,"MATH
Miss Alisha","MATH
Miss Alisha","MATH
Miss Alisha","MATH
Miss Alisha","MATH
Miss Alisha"
Friday Timing,8:00 AM - 12:00 PM,,,,,
`;

describe('parseTimetableCsv', () => {
  it('parses Class I grid with TIME column and subject/teacher cells', () => {
    const result = parseTimetableCsv(CLASS_ONE_CSV);
    expect(result.classLabel).toMatch(/CLASS I/i);
    expect(result.rows.some((r) => r.kind === 'BREAK')).toBe(true);
    const lesson1 = result.rows.find((r) => r.periodNumber === 1);
    expect(lesson1?.startTime).toBe('08:00');
    expect(lesson1?.endTime).toBe('08:45');
    expect(lesson1?.cells[Weekday.MONDAY]?.subjectText).toContain('QAIDA');
    expect(lesson1?.cells[Weekday.MONDAY]?.teacherText).toMatch(/Hadiqa/i);
    expect(result.warnings.some((w) => w.code === 'FRIDAY_TIMING_NOTE')).toBe(true);
  });
});
