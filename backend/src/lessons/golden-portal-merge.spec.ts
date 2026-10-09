import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import { filterPageTextForLessonAssembly } from './page-text-sanitize';

/**
 * Portal-path merge regression (no live OCR): incomplete Paddle like production
 * must not erase fuller Tesseract story body for Dignity page 1.
 */
describe('golden portal merge (Dignity page 1 shape)', () => {
  it('keeps Akhtar came home when Paddle is short and incomplete', () => {
    const paddle = `
Unit
Pre-reading
Reading text
many countries and always told them interesting stories.
Akhtar
happened.
home unhappy. Uncle Inayat looked at him and asked him what had
Uncle
Akhtar
Guess the content of the text.
the teacher made me dust the cupboards and desks.
all have to do the work of servants and gardeners.Today
Uncle, we are having a social service week at school, so we
Did your teacher do anything himself?
Is it work that makes you cross?
Dignity of Work
25`.trim();

    const tesseract = `
pre-reading
What are the two home chores
Dignity of Work
Akhtar came home from school one day. He was feeling cross.
Akhtar's sister, Rukhsana, told Uncle Inayat that Akhtar had come
home unhappy. Uncle Inayat looked at him and asked him what had
happened.
Uncle, we are having a social service week at school, so we
all have to do the work of servants and gardeners. Today,
the teacher made me dust the cupboards and desks.
Uncle Is it work that makes you cross?
Akhtar Should I not be cross if I am made to work like a servant?
Uncle Did your teacher do anything himself?
Yes, he did. After taking out the desks and chairs, the
headmaster swept the room and emptied the dustbin.
Is it a matter of shame to clean what we make dirty?
`.trim();

    const merged = filterPageTextForLessonAssembly(
      mergePaddleAndTesseractPageOcr(paddle, tesseract),
    );
    expect(merged).toMatch(/Akhtar came home/i);
    expect(merged).toMatch(/feeling cross/i);
    expect(merged).toMatch(/social service/i);
    expect(merged.length).toBeGreaterThan(paddle.length);
  });
});
