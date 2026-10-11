import {
  countConsecutiveDuplicateWords,
  mergePaddleAndTesseractPageOcr,
  ocrLinesDuplicate,
  pickOcrMergePrimary,
} from './merge-paddle-tesseract-ocr';

describe('mergePaddleAndTesseractPageOcr', () => {
  it('dedupes near-duplicate lines and keeps paddle structure', () => {
    const paddle = 'Akhtar came home looking cross.\nUncle: Is it work that makes you cross?';
    const tess =
      'Akhtar came home looking cross.\nUncle: Is it work that makes you cross?';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Akhtar came home looking cross/);
    expect(merged.split('\n').filter(Boolean).length).toBe(2);
  });

  it('replaces garbage paddle tokens with tesseract words on the same line', () => {
    const paddle = 'Akhtar came ROT bel asked him the reason';
    const tess = 'Akhtar came home and asked him the reason';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Akhtar came home/i);
    expect(merged).not.toMatch(/\bROT\b/);
  });

  it('appends tesseract-only lines not present in paddle', () => {
    const paddle = 'Exercise 1';
    const tess = 'Exercise 1\nWhat is the central idea of the text?';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/central idea/i);
  });

  it('uses tesseract as base when paddle is short and missing reading body', () => {
    const paddle = `
Pre-reading
Reading text
Dignity of Work
Uncle Inayat looked at him and asked him what had happened.
Akhtar
Uncle, we are having a social service week at school
25`.trim();
    const tess = `
Pre-reading
1. What are the two home chores you like to do, and why?
Reading text
Dignity of Work
Akhtar came home from school one day. He was feeling cross.
Akhtar's sister, Rukhsana, told Uncle Inayat that Akhtar had come home unhappy.
Uncle Inayat looked at him and asked him what had happened.
Akhtar Uncle, we are having a social service week at school, so we all have to do the work of servants and gardeners.
Uncle Is it work that makes you cross?
Akhtar Should I not be cross if I am made to work like a servant?
Uncle Did your teacher do anything himself?
Yes, he did. After taking out the desks and chairs, the headmaster swept the room and emptied the dustbin.
Is it a matter of shame to clean what we make dirty?
But think of the sweeper doing the bathroom.
`.trim();
    expect(pickOcrMergePrimary(paddle, tess)).toBe('tesseract');
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Akhtar came home from school/i);
    expect(merged).toMatch(/feeling cross/i);
    expect(merged.length).toBeGreaterThan(paddle.length);
  });

  it('ocrLinesDuplicate treats high word overlap as duplicate', () => {
    expect(
      ocrLinesDuplicate(
        'Akhtar came home looking cross',
        'Akhtar came home looking very cross',
      ),
    ).toBe(true);
  });

  it('strips interleaved weblink sidebars from physics pages after merge', () => {
    const paddle = `
Step 2: Write down the formula
Encourage students to
T is the time taken
visit below link for
v = f × λ
https://www.youtube.com/watch?v=abc
Result = 1.0 m/s
wavelength of the waves are 8.0 m
`.trim();
    const tess = `
Step 2: Write down the formula
T is the time taken
v = f × λ
Result = 1.0 m/s
wavelength of the waves are 8.0 m
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Step/i);
    expect(merged).toMatch(/λ|wavelength/i);
    expect(merged).not.toMatch(/youtube\.com/i);
    expect(merged).not.toMatch(/Encourage students/i);
  });

  it('keeps Greek lambda tokens instead of treating them as garbage', () => {
    const paddle = 'λ is the distance between the two consecutive crests\nv = f × λ';
    const tess = 'λ is the distance between the two consecutive crests\nv = f × λ';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/λ/);
    expect(merged).toMatch(/v = f/);
  });

  it('keeps MCQ stem + Yes/No grid from either engine and formats a markdown table', () => {
    const paddle = `
General Wave propertie
Water waves can be used to show reflection, refraction, and diffraction. For
2.
each of these,which row shows whether or not the speed of the water waves
changes?
Diffraction
Refraction
Reflection
Yes
yes
Yes
a)
No
yes
Yes
b)
no
yes
No
c)
no
No
no
d)
3.The diagrams show water waves that move more slowly after passing into
shallow water. Which diagram shows what happens to the waves?
`.trim();
    const tess = `
Water waves can be used to show reflection,
the speed of the water waves
each of these, which row shows whether or not
changes?
Reflection        Refraction        Diffraction
3. The dagrams show water waves that move more slowly after passing into
shallow water. Which diagram shows what happens to the waves?
5. Water waves pass from deep into the shallow region then refracted. The
characteristics of wave which will remains constant is:
a) Direction                  b)        Frequency
c)     Speed                       d)        Wavelength.
6. Which is not a characteristic of wave?
a) An amplitude           b)      Period
c) Mass                        d) Velocity
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/each of these/i);
    expect(merged).toMatch(/speed of the water waves/i);
    expect(merged).toMatch(/changes\?/i);
    expect(merged).toMatch(/\| Option \| Reflection \| Refraction \| Diffraction \|/);
    expect(merged).toMatch(/\|\s*a\)\s*\|\s*Yes\s*\|\s*Yes\s*\|\s*Yes\s*\|/i);
    expect(merged).toMatch(/remains constant/i);
    expect(merged).toMatch(/\bMass\b/i);
  });

  it('takes MCQ options and ÷ lines from Tess when Paddle mangles them', () => {
    const paddle = `
Exercise
3.Which of these numbers is not divisible by 5?
b.1703760C.704
Let us check
844=21
`.trim();
    const tess = `
Exercise
3. Which of these numbers is not divisible by 5?
a. 16495          b. 1703760 c. 704
Let us check
84 ÷ 4 = 21
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/divisible by 5/i);
    expect(merged).toMatch(/a\.\s*16495/i);
    expect(merged).toMatch(/b\.\s*1703760/i);
    expect(merged).toMatch(/c\.\s*704/i);
    expect(merged).not.toMatch(/1703760C\.704/i);
    expect(merged).toMatch(/84\s*÷\s*4\s*=\s*21/);
    expect(merged).not.toMatch(/^844=21$/m);
  });

  it('keeps clean Paddle over garbled Tess on multi-box math intro pages', () => {
    const paddle = `
YOUR DIGITAL RESOURCE
Multiples
2
and Factors
In this unit students will learn to
find HCF of
two numbers up to 2-digit numbers
prime factorisation method
division method
find LCM of
two numbers up to 2-digit numbers
three numbers up to 2-digit numbers using
prime factorisation method
division method
solve real Life situations involving HCF and LCM
MATH
FLASH
You have already learnt:
the rules of divisibility of 2,3,5,10
to differentiate between prime and
composite numbers
Example:
2,3,5,7,19
Prime numbers:
Composite numbers:1015,38,56
KEY
VOCABULARY
to find factors and multiples
to find common factors and highest common
factor using Venn diagram and by prime
factorisation method
to find common multiples and lowest
common multiple
Multiples and Factors
`.trim();
    const tess = `
YOUR DIGITAL RESOURCE
OFFS] ¢
«oe PW ah 4
u I les [SF LB als
and Fq et
In this unit students wi learn to:
find find of of i
two two numbers up to 2-digjt numbers
e three numbers up to 2-digit numbers using
° prime factorisation metheg
e division method
e find of of
° two numbers up to 2-digit numbers
e three numbers up to 2-digit numbers using
e prime factorisation method
e division method
solve solve real life situations involving and
MATH
FLASH
You have already learnt:
the the rules of divisibility of 2, 3, 5, i
to to differentiate between prime a
composite numbers
Example: Example: 5719 a
Prime numbers: Prime numbers: , os c a8 56 KEY
Composite Composite numbers: ea VOCABULARY
factor,common factor, to find common factor
factor using Venn diagram multiple, Least common
multiple iod multiple, divisible,
Jia factorisation = attiples and lowest visibility rule
to find common mutt
Multiples and Factors
`.trim();
    expect(pickOcrMergePrimary(paddle, tess)).toBe('paddle');
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/find HCF of/i);
    expect(merged).toMatch(/find LCM of/i);
    expect(merged).toMatch(/solve real Life situations involving HCF and LCM/i);
    expect(merged).not.toMatch(/\bfind find\b/i);
    expect(merged).not.toMatch(/\btwo two\b/i);
    expect(merged).not.toMatch(/\bthe the\b/i);
    expect(merged).not.toMatch(/OFFS]/i);
    expect(countConsecutiveDuplicateWords(merged)).toBeLessThan(
      countConsecutiveDuplicateWords(tess),
    );
  });

  it('stitches Tess rope opener onto Paddle mid-sentence body instead of orphan truncation', () => {
    const paddle = `
WaveMotion byusing a Rope
Fig10.2 slinky spring
wall and continuously moving the other end up and down
as shown in figure 10.1.These up-and-down movements
produce oscillations or vibrations. We can observe that the
generated rope waves travel towards the wall, whereas the
rope itself moves only up and down. The rope is the
medium through which the waves travel or propagate.
Waves in a Slinky Spring
A slinky spring is a pre-compressed helical or coiled spring
as shown in fig 10.2.
`.trim();
    const tess = `
Wave Motion by using a Rope.
We can produce waves on a rope by attaching one end to a
wall and continuously moving the other end up and down,
as shown in figure 10.1. These up-and-down movements
produce oscillations or vibrations. We can observe that the
generated rope waves travel towards the wall, whereas the
rope itself moves only up and down. The rope is the
medium through which the waves travel or propagate.
Waves in a Slinky Spring
nly DINPIESS
A slinky spring is a pre-compressed helical or coiled spring as shown in fig 10.2.
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/We can produce waves on a rope by attaching one end to a/i);
    expect(merged).toMatch(/wall and continuously moving the other end up and down/i);
    expect(merged).toMatch(/medium through which the waves travel/i);
    // Must not leave the Tess opener stranded without its continuation.
    expect(merged).not.toMatch(/attaching one end to a\s*\n\s*nly/i);
    expect(merged).not.toMatch(/DINPIESS/);
  });
});
