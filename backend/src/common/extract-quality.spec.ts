import {
  englishOnlyFromMixedOcr,
  isGarbledRtlOcr,
  isPoorLessonOcr,
  isUsableLessonOcr,
  looksLikeMangledRtlOcr,
} from './extract-quality';
import { looksLikeGarbledLatinOcr } from './garbled-latin-ocr';

describe('extract-quality RTL OCR', () => {
  const mangledSample = `
Two Nation Theory is the base of Pakistan.
The Holy Qur'an says:
@2 A nid) et) Udi SNUB Ge) 1 2 £ IN nL NTL MGI)
Hazrat Muhammad FR di at the occasion of Hujat-ukvidassaid:
SH ed HLS wl bh SS GIF rif STIR anh Te po prs
Quaid-e-Azamele «4 2r.also put forward this theory
On another occasion He X55 ae did said:
(6065 Fo S 1:6) Sot Sure smi piso fios sir Kozel BAT”
`;

  it('detects English OCR that mangled Urdu/Arabic quotes', () => {
    expect(looksLikeMangledRtlOcr(mangledSample)).toBe(true);
    expect(isGarbledRtlOcr(mangledSample)).toBe(true);
    expect(isUsableLessonOcr(mangledSample)).toBe(false);
  });

  it('rejects partially-garbled Urdu OCR that still contains SNUB junk', () => {
    const partial = `
The Holy Qur'an says:
 نبر42) nid) et) Udi SNUB Ge) کے در مان انصاف کے سا أله NTL MGI)
Equality
Hazrat Muhammad صل لله at the occasion of Hujjat-Ul-vidassaid:
SABA oe کی فیا تقول
`;
    expect(isGarbledRtlOcr(partial)).toBe(true);
    expect(isUsableLessonOcr(partial)).toBe(false);
  });

  it('keeps clean English with real Urdu quotes usable', () => {
    const clean = `
Equality
Islam is torch bearer of equality among human beings.
The Holy Quran says:
(ترجمہ): تمام مسلمان آپس میں بھائی بھائی ہیں۔
(سورۃ الحجرات، آیت نمبر 10)
In Islamic law, all human beings are equal.
`;
    expect(looksLikeMangledRtlOcr(clean)).toBe(false);
    expect(isGarbledRtlOcr(clean)).toBe(false);
    expect(isUsableLessonOcr(clean)).toBe(true);
  });

  it('english fallback drops Latin junk quote lines', () => {
    const mixed = `
promotes peaceful and prosperous society. Only injustice system, the collective
betterment and character building of individuals is possible. Islam emphasizes on
establishing justice. The Holy Qur'an says:
Sins Loh 2 ag A Lads id GD,
357 dW.) nl JF Re Pr SB 79 2 52 (isIE foih FS imo
The fundamental rights of individuals are protected in the judicial system of Islam.
Q9 Fed) en Sal ce pn)
LE lie nln JF Spline": ( 27)
Equality
Islam is torch bearer of equality among human beings. Islam denies all distinctions including
colour and race, language and culture, and-wealth and poverty. Hazrat Muhammad
3         fos dir, at the occasion of Hujjat-Ul-vidassaid:
In Islamic law, all human beings. are equal and have equal opportunities for legal
progress and protection.
Brotherhood
Akhuwat means brotherhood. The Holy-Quran says:
0A 221 £5) BSS (EATS or B22)
The principle. of brotherhood is.an important aspect of Islamic society.
`;
    const out = englishOnlyFromMixedOcr(mixed);
    expect(out).toMatch(/Islam emphasizes on\s*establishing justice/i);
    expect(out).toMatch(/torch bearer of equality/i);
    expect(out).toMatch(/Akhuwat means brotherhood/i);
    expect(out).not.toMatch(/Urdu\/Arabic quotations/);
    expect(out).not.toMatch(/Sins Loh/);
    expect(out).not.toMatch(/Q9 Fed/);
    expect(out).not.toMatch(/fos dir/i);
    expect(out).not.toMatch(/0A 221/);
  });
});

describe('garbled English/Math textbook OCR', () => {
  const mathPage = `
Missing Numbers |
1 in the given series ol
y bers are the numbers that have been Loge Sill 2 BE
Missing wm 3 iyi differences among them. ho ober: IB
a quar WO! 5 stated as finding similar changes :
re misng terms in the specific series and, places: be
9 F' 4 Missing Flashcards
Paste number flashcards E
10 on the board in sequence. &
Miss out a few. Ask children
to read and complete the missing sequence.
Provide duldren with fake money
`;

  const cleanEnglish = `
Missing Numbers
Missing numbers are the numbers that have been missed in the given series.
Paste number flashcards on the board in sequence. Miss out a few. Ask children
to read and complete the missing sequence.
`;

  it('flags decorative-font math pages as poor OCR', () => {
    expect(looksLikeGarbledLatinOcr(mathPage)).toBe(true);
    expect(isPoorLessonOcr(mathPage)).toBe(true);
    expect(isUsableLessonOcr(mathPage)).toBe(false);
  });

  it('keeps clean English textbook OCR usable', () => {
    expect(looksLikeGarbledLatinOcr(cleanEnglish)).toBe(false);
    expect(isPoorLessonOcr(cleanEnglish)).toBe(false);
    expect(isUsableLessonOcr(cleanEnglish)).toBe(true);
  });
});
