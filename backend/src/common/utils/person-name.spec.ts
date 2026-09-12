import { personFullName, sanitizeLastName } from './person-name';

describe('personFullName', () => {
  it('hides a placeholder hyphen last name', () => {
    expect(personFullName('Aaira', '-')).toBe('Aaira');
    expect(sanitizeLastName('-')).toBe('');
  });

  it('keeps a real last name', () => {
    expect(personFullName('Abdul', 'Hadi')).toBe('Abdul Hadi');
  });
});
