import { orientationCandidates } from './page-image-prep';

describe('orientationCandidates', () => {
  it('tries 0° first for landscape phone photos (do not force portrait)', () => {
    expect(orientationCandidates(1024, 768)[0]).toBe(0);
    expect(orientationCandidates(1024, 768)).toContain(270);
    expect(orientationCandidates(1024, 768)).toContain(90);
  });

  it('tries 0° first for portrait photos', () => {
    expect(orientationCandidates(768, 1024)[0]).toBe(0);
  });
});
