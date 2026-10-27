import { matchSectionsForClassLabel, matchSubject, matchTeacher } from './timetable-matching';

describe('timetable-matching', () => {
  it('matches a unique section by class number', () => {
    const result = matchSectionsForClassLabel('Class 1', [
      { id: 's1', name: 'A', grade: { id: 'g1', name: 'Class 1', level: 1 } },
      { id: 's2', name: 'B', grade: { id: 'g2', name: 'Class 7', level: 7 } },
    ]);
    expect(result.status).toBe('MATCHED');
    expect(result.sectionId).toBe('s1');
  });

  it('flags ambiguous class labels', () => {
    const result = matchSectionsForClassLabel('CLASS 7', [
      { id: 's1', name: 'A', grade: { id: 'g1', name: 'Class 7', level: 7 } },
      { id: 's2', name: 'B', grade: { id: 'g2', name: 'Class 7', level: 7 } },
    ]);
    expect(result.status).toBe('SECTION_SELECTION_REQUIRED');
    expect(result.sectionIds?.length).toBe(2);
  });

  it('matches subject aliases', () => {
    const subjects = [{ id: 'sub1', name: 'Mathematics', code: 'MATH' }];
    expect(matchSubject('maths', subjects).status).toBe('MATCHED');
  });

  it('matches teachers with honorifics', () => {
    const teachers = [
      {
        id: 't1',
        gender: 'FEMALE',
        user: { firstName: 'Alisha', lastName: null },
      },
    ];
    expect(matchTeacher('Miss Alisha', teachers).status).toBe('MATCHED');
  });
});
