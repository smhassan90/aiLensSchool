import { excerptAroundAnchors } from './teaching-help-excerpt';

describe('excerptAroundAnchors', () => {
  const text = 'AAAA'.repeat(2000) + 'TARGET_ANCHOR_PHRASE' + 'BBBB'.repeat(2000);

  it('returns full text when under limit', () => {
    expect(excerptAroundAnchors('short text', ['TARGET'], 6000)).toBe('short text');
  });

  it('centers excerpt on anchor', () => {
    const excerpt = excerptAroundAnchors(text, ['TARGET_ANCHOR_PHRASE'], 500);
    expect(excerpt).toContain('TARGET_ANCHOR_PHRASE');
    expect(excerpt.length).toBeLessThanOrEqual(500);
  });
});
