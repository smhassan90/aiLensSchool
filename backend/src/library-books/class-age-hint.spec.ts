import { approximateAgeHint, buildTeachingPackHeader, classContextLines } from './class-age-hint';

describe('class age hint', () => {
  it('passes an age hint for Class 10 without treating a grade level number as age', () => {
    expect(approximateAgeHint('Class 10')).toBe('15–16');
    expect(approximateAgeHint('Class X')).toBe('15–16');
    expect(approximateAgeHint('Grade 10')).toBe('15–16');
    expect(approximateAgeHint('Class 9')).toBeNull();
    expect(approximateAgeHint('Class IX')).toBeNull();
    expect(approximateAgeHint('Class 4')).toBeNull();
    expect(approximateAgeHint('12')).toBeNull();

    const classTen = classContextLines('Class 10').join('\n');
    expect(classTen).toContain('15–16');
    expect(classTen).toContain('Do not treat a numeric grade level as the student\'s age.');
    expect(classContextLines('Class 4').join('\n')).not.toContain('15–16');

    const header = buildTeachingPackHeader({
      subjectName: 'English',
      classLabel: 'Class 10',
      bookTitle: 'English Book 2',
      chapterTitle: 'Unit 5',
    });
    expect(header).toContain('Class: Class 10');
    expect(header).toContain('15–16');
    expect(header).not.toContain('Grade level');
  });
});
