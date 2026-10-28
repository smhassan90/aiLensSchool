import { isPackMetaPoint, polishTeacherLine, summarySentences } from './day-plan-content-quality';

describe('isPackMetaPoint', () => {
  it('flags index-outline bullets', () => {
    expect(isPackMetaPoint('The chapter is Chapter 2 and its theme is Social and Moral Values.')).toBe(true);
    expect(isPackMetaPoint('The first subsection is Glory of the Lord, listed on .')).toBe(true);
    expect(
      isPackMetaPoint(
        'Preview Places of Worship and Rituals of the Major Religions () as the section where different religions’ worship settin',
      ),
    ).toBe(true);
  });

  it('accepts real teaching sentences', () => {
    expect(
      isPackMetaPoint(
        'Muslims believe that showing mercy to others reflects Allah’s mercy toward creation.',
      ),
    ).toBe(false);
  });
});

describe('polishTeacherLine', () => {
  it('ends truncated lines cleanly', () => {
    const long =
      'Preview Accountability and its Impact on Human Character () and link the title to how accountability shapes daily choices in school and home life for teenagers';
    const out = polishTeacherLine(long, 100);
    expect(out.endsWith('.')).toBe(true);
    expect(out.toLowerCase()).not.toContain('accountabil…');
  });
});

describe('summarySentences', () => {
  it('drops meta sentences', () => {
    const s = summarySentences(
      'The chapter is Chapter 2. Allah’s glory appears in nature and daily life. The first subsection is Glory of the Lord, listed on .',
    );
    expect(s.some((x) => x.includes('Allah'))).toBe(true);
    expect(s.some((x) => x.includes('listed on'))).toBe(false);
  });
});
