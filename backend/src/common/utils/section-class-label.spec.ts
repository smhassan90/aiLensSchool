import { gradeClassLabel, gradeClassNumber, parseClassNumber, sectionClassLabel } from './section-class-label';

describe('parseClassNumber', () => {
  it('reads class numbers from common grade names', () => {
    expect(parseClassNumber('Class 8')).toBe(8);
    expect(parseClassNumber('Grade 9')).toBe(9);
    expect(parseClassNumber('Level 3')).toBe(3);
  });
});

describe('gradeClassLabel', () => {
  it('returns Class N without section letter', () => {
    expect(gradeClassLabel({ name: 'A', grade: { name: 'Class 8', level: 10 } })).toBe('Class 8');
    expect(gradeClassNumber({ name: 'A', grade: { name: 'Class 8', level: 10 } })).toBe(8);
  });

  it('keeps non-numeric grade names', () => {
    expect(gradeClassLabel({ name: 'A', grade: { name: 'Beginners', level: 0 } })).toBe('Beginners');
  });
});

describe('sectionClassLabel', () => {
  it('combines grade name and section', () => {
    expect(sectionClassLabel({ name: 'A', grade: { name: 'Class 8', level: 10 } })).toBe('Class 8 A');
  });
});
