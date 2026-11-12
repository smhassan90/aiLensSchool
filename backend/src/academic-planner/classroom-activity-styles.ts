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

export type ActivitySection = {
  title: string;
  fact: string;
};

export const ACTIVITY_FORMATS = [
  { name: 'Finish the line' },
  { name: 'Groups of 4' },
  { name: 'Fix the board' },
  { name: 'Two chairs' },
  { name: 'Make the short product' },
  { name: 'Act the last moment' },
] as const;

export type ActivityDayScript = {
  formatName: string;
  formatIndex: number;
  objective: string;
  teacherNotes: string;
  youNeed: string;
  youSay: string;
  steps: string[];
  example: string;
  doneWhen: string;
  boardLines: string[];
};

/** Complete label. Never adds an ellipsis. */
export function cleanActivityLabel(text: string, max = 110): string {
  let t = fixLibraryTextEncoding(text)
    .replace(/\s+/g, ' ')
    .replace(/[…]+/g, ' ')
    .replace(/\.{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/[.!?,:;]+$/g, '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > 24 ? cut.slice(0, space) : cut).trim().replace(/[.!?,:;]+$/g, '').trim();
}

export function activitySectionsFromSlices(
  slices: Array<{ title: string; readingFrom?: string | null; explainPoints?: unknown }>,
): ActivitySection[] {
  const sections: ActivitySection[] = [];
  for (const slice of slices) {
    const title = cleanActivityLabel(slice.title, 90);
    if (title.length < 3) continue;
    const points = Array.isArray(slice.explainPoints)
      ? slice.explainPoints.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const fact = cleanActivityLabel(points[0] || slice.readingFrom || title, 160);
    sections.push({ title, fact: fact.length >= 8 ? fact : title });
  }
  return sections.slice(0, 12);
}

/**
 * formats[sortOrder % 6]. If that format is already used by an earlier chapter
 * in this same ordered list, take the next free format. Pass chapters in sortOrder.
 */
export function assignActivityFormatIndexes(sortOrders: number[]): number[] {
  const count = ACTIVITY_FORMATS.length;
  const used = new Set<number>();
  return sortOrders.map((order) => {
    const base = ((order % count) + count) % count;
    let idx = base;
    if (used.has(idx)) {
      for (let step = 1; step < count; step++) {
        const candidate = (base + step) % count;
        if (!used.has(candidate)) {
          idx = candidate;
          break;
        }
      }
    }
    used.add(idx);
    return idx;
  });
}

export function isCatalogActivityName(title: string | undefined | null): boolean {
  return ACTIVITY_FORMATS.some((format) => format.name === title);
}

function unfinishedLine(fact: string): string {
  const words = cleanActivityLabel(fact, 100).split(' ').filter(Boolean);
  if (words.length < 6) return `${words.join(' ')} ______`;
  return `${words.slice(0, words.length - 3).join(' ')} ______`;
}

function writingSectionIndex(sections: ActivitySection[]): number {
  const match = sections.findIndex((section) =>
    /writ|letter|diary|essay|composition/i.test(section.title),
  );
  return match >= 0 ? match : Math.max(0, sections.length - 1);
}

function linkSectionIndex(sections: ActivitySection[], avoid: number): number {
  const match = sections.findIndex(
    (section, index) => index !== avoid && /language|grammar|study|modal|pronoun/i.test(section.title),
  );
  if (match >= 0) return match;
  return sections.findIndex((_, index) => index !== avoid) >= 0
    ? sections.findIndex((_, index) => index !== avoid)
    : avoid;
}

export function buildActivityDayScript(input: {
  chapterTitle: string;
  sections: ActivitySection[];
  formatIndex: number;
}): ActivityDayScript {
  const count = ACTIVITY_FORMATS.length;
  const formatIndex = ((input.formatIndex % count) + count) % count;
  const formatName = ACTIVITY_FORMATS[formatIndex].name;
  const chapter = cleanActivityLabel(input.chapterTitle, 160) || 'this chapter';
  const sections =
    input.sections.length > 0
      ? input.sections.slice(0, 12)
      : [{ title: chapter, fact: `Open ${chapter} and use one line from the textbook` }];
  const first = sections[0];
  const second = sections[1] ?? { title: chapter, fact: first.fact };

  const boardLines = boardLinesForFormat(formatName, sections);
  const plan = planForFormat(formatName, chapter, sections, first, second);
  const steps = plan.steps;
  const example = `Student might say: "${plan.student}" You add: "${plan.teacher}"`;
  const objective = plan.objective;
  const teacherNotes = [
    formatName,
    '',
    `You need: ${plan.youNeed}`,
    '',
    `You say: "${plan.youSay}"`,
    '',
    'Write on the board:',
    ...boardLines.map((line, index) => `  ${index + 1}. ${line}`),
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    example,
    '',
    'Answers you accept:',
    ...sections.map((section, index) => `  ${index + 1}. ${section.title}: ${section.fact}`),
    '',
    `Done when: ${plan.doneWhen}`,
  ].join('\n');

  return {
    formatName,
    formatIndex,
    objective,
    teacherNotes,
    youNeed: plan.youNeed,
    youSay: plan.youSay,
    steps,
    example,
    doneWhen: plan.doneWhen,
    boardLines,
  };
}

function boardLinesForFormat(formatName: string, sections: ActivitySection[]): string[] {
  if (formatName === 'Finish the line') {
    return sections.map((section) => `${section.title} — ${unfinishedLine(section.fact)}`);
  }
  if (formatName === 'Fix the board') {
    return sections.map((section) => `False: ${section.title} is not part of this chapter`);
  }
  if (formatName === 'Two chairs') {
    return sections.map((section) => `Ask one question about ${section.title}`);
  }
  if (formatName === 'Make the short product') {
    const writing = sections[writingSectionIndex(sections)];
    return [
      `Short piece: ${writing.title}`,
      ...sections
        .filter((section) => section.title !== writing.title)
        .map((section) => `Mention ${section.title}`),
    ];
  }
  if (formatName === 'Act the last moment') {
    const last = sections[sections.length - 1];
    return [
      `Perform: ${last.title}`,
      ...sections
        .filter((section) => section.title !== last.title)
        .map((section) => `Then connect to ${section.title}`),
    ];
  }
  return sections.map((section) => `${section.title} — one fact required`);
}

function planForFormat(
  formatName: string,
  chapter: string,
  sections: ActivitySection[],
  first: ActivitySection,
  second: ActivitySection,
): {
  objective: string;
  youNeed: string;
  youSay: string;
  steps: string[];
  student: string;
  teacher: string;
  doneWhen: string;
} {
  const doneWhen = `a student can use ${first.title} and ${second.title} with one textbook fact for each.`;

  if (formatName === 'Groups of 4') {
    return {
      objective: `Groups of 4: each student gives one fact from a different section of ${chapter}. If they cannot, the other group may take the point.`,
      youNeed: 'Board and textbook.',
      youSay: `Make groups of 4. Each person gives one fact from a different section. The first section is ${first.title}: ${first.fact}`,
      steps: [
        `(5 min) Number the groups. Read the checklist. Give each student a different section, starting with ${first.title}.`,
        `(15 min) Each student says one fact from their own section. If they cannot, they pass.`,
        `(14 min) The opposing group may say that fact and take the point. Mark the checklist as you go.`,
        `(6 min) Name the winning group. Ask one student to repeat the fact for ${first.title} and one for ${second.title}.`,
      ],
      student: `I cannot think of a fact for ${first.title}.`,
      teacher: `${first.fact} The other group may take this point.`,
      doneWhen: `every section has been said once, including ${first.title} and ${second.title}, and you have named a winner.`,
    };
  }

  if (formatName === 'Fix the board') {
    return {
      objective: `Fix the board: groups correct one false statement for every section of ${chapter}, using a line they can point to in the book.`,
      youNeed: 'Board and textbook.',
      youSay: `I wrote one false line for each section of ${chapter}. We will correct ${first.title} first. The book says: ${first.fact}`,
      steps: [
        `(6 min) Read the false lines. Correct ${first.title} together and point to the line in the book.`,
        `(16 min) Each group takes the remaining lines. They write the correction and the book line they will point to.`,
        `(12 min) Groups read one correction each. Confirm it matches the textbook before you accept it.`,
        `(6 min) Ask which two corrections name ${first.title} and ${second.title}.`,
      ],
      student: `${first.title} is not in our book.`,
      teacher: `It is. ${first.fact}`,
      doneWhen,
    };
  }

  if (formatName === 'Two chairs') {
    return {
      objective: `Two chairs: one student asks and one answers, and the class hears one question from each section of ${chapter}.`,
      youNeed: 'Two chairs and the textbook.',
      youSay: `Two students sit at the front. One asks and one answers, using the speaking skill in ${chapter}. First question is about ${first.title}: ${first.fact}`,
      steps: [
        `(6 min) Place two chairs at the front. Model one question about ${first.title}.`,
        `(18 min) Each new pair asks and answers one section that has not been used yet. Continue until every section has been heard.`,
        `(10 min) After each answer, add one missing fact from the textbook.`,
        `(6 min) The last pair asks one question about ${first.title} and one about ${second.title}.`,
      ],
      student: `What should I ask about ${first.title}?`,
      teacher: `Ask a question whose answer is: ${first.fact}`,
      doneWhen: `the class has heard one question about ${first.title} and one about ${second.title}.`,
    };
  }

  if (formatName === 'Make the short product') {
    const writing = sections[writingSectionIndex(sections)];
    const other = sections[linkSectionIndex(sections, writingSectionIndex(sections))];
    return {
      objective: `Make the short product: students write a short piece from ${writing.title} in ${chapter} and say one line that connects it to ${other.title}.`,
      youNeed: 'Notebooks and the textbook.',
      youSay: `You will write a short version of ${writing.title}. Keep this fact in it: ${writing.fact}`,
      steps: [
        `(6 min) Show the product name on the board. Read aloud: ${writing.fact}`,
        `(18 min) Each student writes a miniature letter, diary note, or four-line plan, matching ${writing.title}. It must mention ${other.title}.`,
        `(10 min) Three students read their piece. Add this fact if they miss the link: ${other.fact}`,
        `(6 min) One student says how ${writing.title} and ${other.title} both belong in ${chapter}.`,
      ],
      student: `My piece is only about ${writing.title}.`,
      teacher: `Add one line from ${other.title}: ${other.fact}`,
      doneWhen: `the piece names ${writing.title} and ${other.title}.`,
    };
  }

  if (formatName === 'Act the last moment') {
    const last = sections[sections.length - 1];
    const link = sections[linkSectionIndex(sections, sections.length - 1)];
    return {
      objective: `Act the last moment: students perform ${last.title} from ${chapter}, then one student connects it to ${link.title}.`,
      youNeed: 'Textbook and space to stand.',
      youSay: `Act the closing part, ${last.title}. Then connect it to ${link.title}. ${last.fact}`,
      steps: [
        `(8 min) Groups of 4 prepare a one-minute scene of ${last.title}. Remind them: ${last.fact}`,
        `(16 min) Two groups perform. After each scene, one student links it to the next section on the board.`,
        `(10 min) Add the textbook fact for any section they skip, including ${link.fact}`,
        `(6 min) One student names ${last.title} and ${link.title} in one sentence.`,
      ],
      student: `The scene is only about ${last.title}.`,
      teacher: `Connect it to ${link.title}: ${link.fact}`,
      doneWhen: `the class has seen the scene for ${last.title} and heard a link to ${link.title}.`,
    };
  }

  return {
    objective: `Finish the line: each pair completes one unfinished sentence from each section of ${chapter} and adds an example from today.`,
    youNeed: 'Board, textbook, and notebooks.',
    youSay: `Today each pair finishes one line from every section of ${chapter}. The first line is about ${first.title}: ${first.fact}`,
    steps: [
      `(6 min) Read the board lines once. For ${first.title}, tell the class the missing words are in the book: ${first.fact}`,
      `(16 min) Each pair fills every blank and adds one example from home, school, or the street today.`,
      `(12 min) Two pairs read one finished line each. Add the textbook fact if they miss it.`,
      `(6 min) One student reads the finished lines for ${first.title} and ${second.title}.`,
    ],
    student: `The blank in ${first.title} means we can skip that section.`,
    teacher: first.fact,
    doneWhen,
  };
}
