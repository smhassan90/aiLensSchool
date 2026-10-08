import { preferOcrTranscript } from './page-ocr.service';

describe('preferOcrTranscript', () => {
  const strong = `
READING COMPREHENSION
Pre-reading
1. Have you seen a spider? Are you afraid of it?
2. Can a spider hurt us?
3. Can a spider teach us anything?
Reading text
King Bruce and the Spider
Eliza Cook (1818-1889)
King Bruce of Scotland flung himself down
In a lonely mood to think;
'Tis true he was monarch and wore a crown,
But his heart was beginning to sink.
`.trim();

  const weak = `
9. Can a spider hurt us?
3. Can a spider teach us anything?
Reading text
King Bruce and the Spider
`.trim();

  it('prefers the fuller poem transcript over truncated title-only text', () => {
    const chosen = preferOcrTranscript(strong, weak);
    expect(chosen.engine).toBe('paddle');
    expect(chosen.text).toMatch(/flung himself/i);
  });

  it('falls back to tesseract when paddle is empty', () => {
    const chosen = preferOcrTranscript('', weak);
    expect(chosen.engine).toBe('tesseract');
    expect(chosen.text).toContain('King Bruce');
  });
});
