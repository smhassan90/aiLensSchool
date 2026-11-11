import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';

export type ActivityStyle = {
  name: string;
  goal: string;
  materials: string;
  minutes: number;
  steps: (ideas: string[]) => string[];
  /** Worked classroom script a teacher can copy: board line + student line. */
  example: (ideas: string[]) => string[];
};

function ideaOr(ideas: string[], fallback: string): string {
  return ideas[0] ?? fallback;
}

function clipExample(text: string, max = 480): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  const cut = compact.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut.slice(0, max - 1).trimEnd()}.`;
}

/** Everyday classroom pair (do this / skip this) so the teacher has something to say. */
export function classroomHook(idea: string): { doThis: string; skipThis: string } {
  const t = idea.toLowerCase();
  if (/helmet|seat.?belt|traffic|road accident|over-speed/.test(t)) {
    return {
      doThis: 'Put the helmet on before the motorcycle leaves the gate, even for a short ride',
      skipThis: 'Skip the helmet because the shop is nearby',
    };
  }
  if (/read|narrative|prior knowledge|pre-reading|question/.test(t)) {
    return {
      doThis: 'Ask “Have you ever waited for a late van?” then open the story',
      skipThis: 'Start on line one with a silent class',
    };
  }
  if (/debate|motion|rebuttal/.test(t)) {
    return {
      doThis: 'Two sides, a clear motion, and a judge who lets each speaker finish',
      skipThis: 'Everyone shouts at once with no motion',
    };
  }
  if (/relative pronoun|who, whom|clause/.test(t)) {
    return {
      doThis: '“The girl who missed the van waited at the gate.”',
      skipThis: '“The girl which missed the van.”',
    };
  }
  if (/fraction|numerator|denominator/.test(t)) {
    return {
      doThis: 'Share one roti equally among four — each piece is 1/4',
      skipThis: 'Break it into uneven pieces and still call them equal',
    };
  }
  if (/photosynth|chlorophyll|leaf/.test(t)) {
    return {
      doThis: 'A green leaf in sunlight makes food; a leaf in a closed drawer does not',
      skipThis: 'A plant in a dark cupboard still grows the same',
    };
  }
  return {
    doThis: `Do what this idea asks: ${idea}`,
    skipThis: 'Skip it and hope it will be fine',
  };
}

export function workedClassroomExamples(ideas: string[], kind: string): string[] {
  const idea = ideaOr(ideas, 'the idea from today’s lesson');
  const { doThis, skipThis } = classroomHook(idea);
  switch (kind) {
    case 'teach-back':
      return [
        clipExample(`You say: “${idea}.” Then model it: ${doThis}.`),
        clipExample(
          `Good 60-second teach-back: they restate the idea and use this moment — ${doThis}. Weak: “It is important” or “${skipThis}.” Ask for the example.`,
        ),
      ];
    case 'two-choices':
      return [
        clipExample(`Board A (skip): ${skipThis}. Board B (do): ${doThis}. Idea: ${idea}.`),
        clipExample('Good reason for B names the idea. Weak: “B looks better.” Ask which choice uses the idea.'),
      ];
    case 'correct':
      return [
        clipExample(`You write (wrong): “${skipThis}.” Correct line you want: “${idea}.”`),
        clipExample(`Good student fix: “${doThis}.” Weak: “The book is important.” Ask them to name the mistake.`),
      ];
    case 'sketch':
      return [
        clipExample(`You sketch first: ${doThis}. Label the part that matches: ${idea}.`),
        clipExample(`Good labels name that moment. Weak: they copy the chapter title. Ask them to label ${doThis}.`),
      ];
    case 'scene':
      return [
        clipExample(`Scene stops before anyone does this: ${doThis}. Idea they must use: ${idea}.`),
        clipExample(`Good ending: a character does ${doThis}. Weak ending: they ignore it and ${skipThis}.`),
      ];
    case 'sprint':
      return [
        clipExample(`Prompt 1 (true): “${idea}.” Sample: ${doThis}.`),
        clipExample(`Prompt 2 (if we ignore it): ${skipThis}. Weak board line: “Be good students.” No point.`),
      ];
    case 'interview':
      return [
        clipExample(`Reporter asks: “What should we do, and what happens if we don’t?” Idea: ${idea}.`),
        clipExample(`Good expert: “${doThis}.” Weak: “The teacher told us.” Ask them to contrast ${skipThis}.`),
      ];
    case 'true-false':
      return [
        clipExample(`True: ${doThis}. False: ${skipThis}. The idea: ${idea}.`),
        clipExample(`Correction of the false line uses the idea, not “because teacher said so.”`),
      ];
    case 'one-change':
      return [
        clipExample(`You model: “After class I will ${doThis}.” Idea: ${idea}.`),
        clipExample(`Good student names that change. Weak: “I will study more.” Ask them not to choose ${skipThis}.`),
      ];
    case 'exchange':
      return [
        clipExample(`Claim: ${idea}. For: ${doThis}. Against: ${skipThis}.`),
        clipExample('Stronger reason uses the idea. Weak: “I like it.”'),
      ];
    case 'poster':
      return [
        clipExample(`Poster: draw ${doThis}. Warning: do not ${skipThis}. Title: ${idea}.`),
        clipExample('Weak poster: only the chapter name. Ask them to draw the do-this box.'),
      ];
    default:
      return [
        clipExample(`You say: “${idea}.” Class example: ${doThis}.`),
        clipExample(`Good student uses that example. Weak: “${skipThis}.”`),
      ];
  }
}

/** Different classroom moves. Only one of these is a small-group task. */
export const ACTIVITY_STYLES: ActivityStyle[] = [
  {
    name: 'Correct the mistake',
    goal: 'Students spot a wrong explanation and rewrite it correctly.',
    materials: 'Board and notebooks.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'one idea from today’s lesson');
      return [
        `Write a wrong version of this on the board: ${idea}.`,
        'Students say what is wrong, then write a correct one-line version.',
        'Ask what would go wrong if someone believed the mistake.',
        'Hear two corrections and fix anything still unclear.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'correct'),
  },
  {
    name: 'Sixty-second teach-back',
    goal: 'Each student teaches one idea to a partner in one minute.',
    materials: 'Notebooks only.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the main idea from today’s pages');
      return [
        `Say the idea once: ${idea}. Then give the example below.`,
        'Pairs: one student teaches it in 60 seconds using that example. The partner adds what was missing.',
        'Swap roles.',
        'Two students teach it to the class. Reject a vague line; ask for the example.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'teach-back'),
  },
  {
    name: 'Two choices',
    goal: 'Students choose between two actions and defend the choice with the lesson idea.',
    materials: 'Board.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the rule from today’s lesson');
      return [
        `Write two actions. One follows this idea, one does not: ${idea}.`,
        'Students vote, then tell a neighbour why in one sentence.',
        'Name the part of the idea that decides the better choice.',
        'Students copy that reason.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'two-choices'),
  },
  {
    name: 'Sketch and label',
    goal: 'Students draw the idea and label the part that matters.',
    materials: 'Paper and pencils.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the main idea from today’s lesson');
      return [
        `One quiet minute to sketch this: ${idea}.`,
        'Each student labels two parts in their own words.',
        'Neighbours compare and circle one difference.',
        'Show one strong sketch and fix one that missed the point.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'sketch'),
  },
  {
    name: 'Finish the scene',
    goal: 'Students finish a short situation using the lesson idea.',
    materials: 'Notebooks.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the idea you just taught');
      return [
        `Read a three-line scene that stops before anyone uses this: ${idea}.`,
        'Students write the next two lines so the idea changes what a character does.',
        'Two volunteers read their ending.',
        'The class says which ending used the idea more clearly.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'scene'),
  },
  {
    name: 'Board sprint',
    goal: 'Students race to write a correct one-line answer from the lesson.',
    materials: 'Board and two markers.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'a point from today’s lesson');
      const second = ideas[1] ?? idea;
      return [
        'Split the class into two lines facing the board.',
        `Prompt 1: write one true sentence about this — ${idea}.`,
        `Prompt 2: write what goes wrong if we ignore this — ${second}.`,
        'Give the point for a correct idea, not for speed. Then explain any miss.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'sprint'),
  },
  {
    name: 'Reporter interview',
    goal: 'One student asks, the other answers, as if explaining to a younger pupil.',
    materials: 'Notebooks.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'today’s main idea');
      return [
        `Pairs sit face to face. The interview topic is: ${idea}.`,
        'The reporter asks three questions a younger student would ask.',
        'The expert answers in short sentences, without notes.',
        'Reporters share the clearest answer they heard.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'interview'),
  },
  {
    name: 'True or false sort',
    goal: 'Students sort statements and defend the false ones.',
    materials: 'Board or slips of paper.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the idea from today’s lesson');
      return [
        `Read four short statements. Two are false. The idea: ${idea}.`,
        'Students mark true or false, then compare with a partner.',
        'For each false one, the class says the correction in one sentence.',
        'Leave the corrected lines on the board.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'true-false'),
  },
  {
    name: 'One change',
    goal: 'Students name one real change this idea would make and why.',
    materials: 'Notebooks.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the idea from today’s lesson');
      return [
        `Remind them in one sentence: ${idea}.`,
        'Each student writes one thing they would do differently at home or school.',
        'They add a reason that uses the idea, not a slogan.',
        'Hear four answers and mark which reason used the lesson.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'one-change'),
  },
  {
    name: 'Two-speaker exchange',
    goal: 'Two students argue one claim; the class picks the stronger reason.',
    materials: 'Board.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'one claim from today’s lesson');
      return [
        `Write one claim: ${idea}.`,
        'One student gives a reason, another a careful objection. One minute each.',
        'The class names which reason used the lesson more accurately.',
        'You add the fact they both missed, in one sentence.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'exchange'),
  },
  {
    name: 'Three-person poster',
    goal: 'A trio makes one poster that teaches a single idea, and every student adds a line.',
    materials: 'One sheet per three students, and pencils.',
    minutes: 18,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'one idea from today’s lesson');
      return [
        `Threes only. The poster teaches just this: ${idea}.`,
        'One writes the idea, one draws it, one adds a warning about getting it wrong.',
        'Hang two posters. The class says which line teaches the idea best.',
        'You add the missing point before the bell.',
      ];
    },
    example: (ideas) => workedClassroomExamples(ideas, 'poster'),
  },
];

export function pickActivityStyle(seed: string, variety = 0): ActivityStyle {
  let hash = 0;
  const text = seed.trim() || 'lesson';
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 33) + text.charCodeAt(i)) >>> 0;
  }
  const shift = Number.isFinite(variety) ? Math.max(0, Math.floor(variety)) : 0;
  return ACTIVITY_STYLES[(hash + shift) % ACTIVITY_STYLES.length];
}

function trimAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const period = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  if (period >= 40) return cut.slice(0, period + 1);
  const space = cut.lastIndexOf(' ');
  return space > 30 ? cut.slice(0, space) : cut;
}

/** Short board label (not the full bullet repeated everywhere). */
export function themeShortLabel(idea: string): string {
  const t = idea.replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
  if (t.length <= 72) return t;
  const words = t.split(/\s+/);
  if (words.length <= 12) return `${t.slice(0, 69)}…`;
  return `${words.slice(0, 9).join(' ')}…`;
}

export function cleanTeachingIdea(raw: string): string | null {
  let text = fixLibraryTextEncoding(raw)
    .replace(/^#+\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 24) return null;
  if (/indexed section|page hunt|^key points$|make groups of \d|the idea from today/i.test(text)) return null;

  text = trimAtSentence(text, 200);
  text = text.replace(/[.!?,:;]+$/, '').trim();
  if (text.length < 24 || text.length > 200) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shortTeachingIdeas(raw: string[], limit = 2): string[] {
  const seen = new Set<string>();
  const ideas: string[] = [];
  for (const item of raw) {
    const cleaned = cleanTeachingIdea(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ideas.push(cleaned);
    if (ideas.length >= limit) break;
  }
  return ideas;
}

export function ideasFromChapterText(text: string | undefined, limit = 5): string[] {
  if (!text?.trim()) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*•]/.test(l) || /^\d+[.)]/.test(l) || /^#+\s/.test(l));
  if (bullets.length >= 2) return shortTeachingIdeas(bullets, limit);

  const parts = text.split(/(?<=[.!?])\s+|\n+/);
  return shortTeachingIdeas(parts, limit);
}

/** Whole-chapter activity script: teachers see parts on the board, not one repeated bullet. */
function recapExampleForTheme(theme: string): { student: string; teacher: string } {
  const lower = theme.toLowerCase();
  const shortName = theme.split(/[—–-]/)[0]?.trim() || theme;
  if (/helmet|seat.?belt|traffic|road accident|over-speed|civic|speeding/.test(lower)) {
    const { doThis, skipThis } = classroomHook(theme);
    return {
      student: doThis,
      teacher: `Yes — and if we ignore it: ${skipThis}. Say why the book cares about this.`,
    };
  }
  if (/debate|motion|rebuttal/.test(lower)) {
    return {
      student: 'Two teams, a clear motion, and a judge.',
      teacher: 'Add: each side gets a turn; rebuttal comes after both sides speak.',
    };
  }
  if (/relative pronoun|who, whom|clause|grammar/.test(lower)) {
    return {
      student: 'The girl who helped her friend waited at the gate.',
      teacher: 'Fix if they say “which” for a person — who is for people.',
    };
  }
  if (/kant/i.test(lower)) {
    return {
      student: 'We should treat people fairly and keep our promises.',
      teacher: 'Open the book page and read one sentence about his moral teaching.',
    };
  }
  if (/nightingale/i.test(lower)) {
    return {
      student: 'She cared for sick soldiers and improved hospitals.',
      teacher: 'Link it to character: service to others, not only fame.',
    };
  }
  if (/ghazali|imam/i.test(lower)) {
    return {
      student: 'He taught Muslims to balance religion with daily life.',
      teacher: 'Name one habit from the text that students can copy this week.',
    };
  }
  if (/aristotle/i.test(lower)) {
    return {
      student: 'Good habits make a good person — not luck alone.',
      teacher: 'Ask: what is one habit your class already shows?',
    };
  }
  if (/page\s*\d+/i.test(theme) && shortName.length > 4) {
    return {
      student: `I learned something important about ${shortName}.`,
      teacher: `Turn to that page and read one key line aloud. Then put it in your own words.`,
    };
  }
  const { doThis, skipThis } = classroomHook(theme);
  if (!/idea from today|skip it and hope/i.test(skipThis)) {
    return { student: doThis, teacher: themeShortLabel(theme) };
  }
  return {
    student: `This part is about ${shortName}.`,
    teacher: 'Ask the class to find one sentence in the book that proves it.',
  };
}

/** Plain “student says / you add” lines for each board part (chapter recap). */
export function workedPartExamples(themes: string[]): string[] {
  const topics = shortTeachingIdeas(themes, 5);
  if (!topics.length) {
    return [
      'Part 1 — Open the textbook headings together. Student might say: “We learned about being good citizens.” You add one real example from the first page they name.',
    ];
  }
  return topics.map((theme, index) => {
    const label = themeShortLabel(theme);
    const n = index + 1;
    const { student, teacher } = recapExampleForTheme(theme);
    return `Part ${n} — ${label}. Student might say: “${student}.” You add: “${clipExample(teacher, 200)}”`;
  });
}

export function buildChapterActivityScript(chapterTitle: string, themes: string[]): string {
  const topics = shortTeachingIdeas(themes, 5);
  const chapter = chapterTitle.trim() || 'this chapter';
  const labels =
    topics.length > 0
      ? topics.map(themeShortLabel)
      : ['Main ideas from the chapter (open the book and list 3–4 headings together)'];

  return [
    `Chapter recap: ${chapter}`,
    'Goal: students explain each main part of the chapter — not only the first topic in the book.',
    '',
    'Write on the board:',
    ...labels.map((label, i) => `  ${i + 1}. ${label}`),
    '',
    'Example you can say:',
    `"Today we close ${chapter}. I will give each group one numbered part from the board. You explain it in plain words and give one example from school, the road, or home."`,
    '',
    '1. Setup (5 min): Read the numbered parts once. One student restates part 1 without the book.',
    '2. Groups (18 min): One part per group (split a part if you have more groups than items). Each group writes: what it means, one line from the textbook, one real-life example.',
    '3. Share (12 min): About two minutes per group. After each group, add one fact they missed from the chapter.',
    '4. Close (5 min): Ask how the parts fit the chapter title — one sentence that names at least two parts.',
  ].join('\n');
}
