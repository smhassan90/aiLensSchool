import {
  lineLooksLikeWeblinkSidebar,
  pickMainColumnLines,
  stripInterleavedWeblinkSidebar,
} from './sidebar-layout-ocr';

const PHYSICS_INTERLEAVED = `Unit 10
General Wave propertie,
(b)
Step 2:Write down the formula and rearrange if necessary.
a.
T is the time taken to move from the highest point to
18
the lowest point and from the lowest point to the
highest point.
1i.
T
iii.A is the one-half of displacement from the highest
Encourage students to
point to the lowest point
visit below link for
iv. is the distance between the two consecutive crests
Waves Ripple
b.v=fx
Tank Interference
Step 3:Put the values and calculate
https://www.youtube.com/
watch?v-0c0gvy OOKc&
a.
T=24.0s
ab channel-launchSCIEN
i.
CE
=8.0s
1
ii.
f=
8s
=0.125Hz.
in.
2
-1.5m.
iv.
=8.0m.
b.v=0.125Hz8.0m
Encourage students to
Result=1.0m/s.
visit below link for
Waves-Frequency,Speed
and Wavelength
Thus, the perlod, frequency, amplitude, and wavelength of
https://www.youtube.com/
the waves are 8.0s, 0.125Hz,1.5m, and 8.0m respectively
watch?v=4ytXp1jNBn8&a
The wave is moving at the speed of 1.0 m/s.
b_channel-JonWhite
SELR-ASSESSMENT OUESTIONS
Q1: How spherical wavefronts are produced in the ripple
tank?
Q2:What is the difference between displacement and
amplitude of the wave?
Q3:Drive the relation between wave speed and frequency.`;

describe('stripInterleavedWeblinkSidebar', () => {
  it('removes weblink/youtube sidebar lines from a physics page', () => {
    const cleaned = stripInterleavedWeblinkSidebar(PHYSICS_INTERLEAVED);
    expect(cleaned).toMatch(/Step 2/i);
    expect(cleaned).toMatch(/0\.125Hz/i);
    expect(cleaned).toMatch(/SELF-ASSESSMENT|SELR-ASSESSMENT|Q1:/i);
    expect(cleaned).not.toMatch(/youtube\.com/i);
    expect(cleaned).not.toMatch(/Encourage students to/i);
    expect(cleaned).not.toMatch(/ab channel/i);
    expect(cleaned).not.toMatch(/b_channel/i);
  });

  it('does not strip Dignity of Work literary pages', () => {
    const literary = `Pre-reading
Akhtar and Rukhsana talked about the Dignity of Work.
Uncle Inayat said the Holy Prophet (PBUH) taught dignity of labour at Khandaq.
Central idea: every honest job has honour.`;
    expect(stripInterleavedWeblinkSidebar(literary)).toBe(literary);
  });

  it('no-ops when there are no weblink cues', () => {
    const plain = `Unit 5 Matter\nSolids have fixed shape.\nLiquids take the shape of the container.`;
    expect(stripInterleavedWeblinkSidebar(plain)).toBe(plain);
  });
});

describe('lineLooksLikeWeblinkSidebar', () => {
  it('detects weblink and youtube fragments', () => {
    expect(lineLooksLikeWeblinkSidebar('Encourage students to')).toBe(true);
    expect(lineLooksLikeWeblinkSidebar('https://www.youtube.com/')).toBe(true);
    expect(lineLooksLikeWeblinkSidebar('watch?v=4ytXp1jNBn8&a')).toBe(true);
    expect(lineLooksLikeWeblinkSidebar('Step 2: Write down the formula')).toBe(false);
  });
});

describe('pickMainColumnLines', () => {
  it('keeps the wider body column when the left band is weblinks', () => {
    const lines = [
      { text: 'Encourage students to visit', x0: 10, y0: 10, x1: 120, y1: 30 },
      { text: 'https://www.youtube.com/watch', x0: 10, y0: 40, x1: 120, y1: 60 },
      { text: 'Weblinks Waves Ripple', x0: 10, y0: 70, x1: 110, y1: 90 },
      { text: 'Step 2: Write down the formula', x0: 200, y0: 10, x1: 520, y1: 30 },
      { text: 'T is the time taken to move', x0: 200, y0: 40, x1: 520, y1: 60 },
      { text: 'v = f × λ', x0: 200, y0: 70, x1: 400, y1: 90 },
      { text: 'Result = 1.0 m/s', x0: 200, y0: 100, x1: 450, y1: 120 },
      { text: 'wavelength of the waves', x0: 200, y0: 130, x1: 500, y1: 150 },
      { text: 'Q1: How spherical wavefronts', x0: 200, y0: 160, x1: 520, y1: 180 },
      { text: 'ab_channel=launchSCIENCE', x0: 10, y0: 100, x1: 120, y1: 120 },
    ];
    const main = pickMainColumnLines(lines);
    expect(main).not.toBeNull();
    const joined = (main ?? []).map((l) => l.text).join('\n');
    expect(joined).toMatch(/Step 2/);
    expect(joined).toMatch(/λ/);
    expect(joined).not.toMatch(/youtube/i);
    expect(joined).not.toMatch(/Encourage students/i);
  });
});
