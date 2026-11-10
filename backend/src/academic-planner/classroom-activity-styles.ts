import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';

export type ActivityStyle = {
  name: string;
  goal: string;
  materials: string;
  minutes: number;
  steps: (ideas: string[]) => string[];
};

function ideaOr(ideas: string[], fallback: string): string {
  return ideas[0] ?? fallback;
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
        `Write this idea incorrectly on the board: ${idea}.`,
        'Students say what is wrong, then write a correct one-line version.',
        'Ask what would go wrong in real life if someone believed the mistake.',
        'Hear two corrections and fix anything still unclear.',
      ];
    },
  },
  {
    name: 'Sixty-second teach-back',
    goal: 'Each student teaches one idea to a partner in one minute.',
    materials: 'Notebooks only.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the main idea from today’s pages');
      return [
        `State the idea once, slowly: ${idea}.`,
        'Pairs: one student teaches it in 60 seconds, the other adds the missing piece.',
        'Swap roles if there is a second idea.',
        'Ask two students to teach it to the whole class. Correct one gap.',
      ];
    },
  },
  {
    name: 'Two choices',
    goal: 'Students choose between two actions and defend the choice with the lesson idea.',
    materials: 'Board.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the rule from today’s lesson');
      return [
        `Put two actions on the board, one that fits this idea and one that does not: ${idea}.`,
        'Students vote, then a neighbour has to say why in one sentence.',
        'Reveal the better choice and name the part of the idea that decides it.',
        'Students write that reason in their notebook.',
      ];
    },
  },
  {
    name: 'Sketch and label',
    goal: 'Students draw the idea and label the part that matters.',
    materials: 'Paper and pencils.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the main idea from today’s lesson');
      return [
        `Give one minute of silence to sketch this: ${idea}.`,
        'Each student labels two parts of the sketch in their own words.',
        'Neighbours compare sketches and circle one difference.',
        'Show one strong sketch and one that missed the point. Fix it together.',
      ];
    },
  },
  {
    name: 'Finish the scene',
    goal: 'Students finish a short situation using the lesson idea.',
    materials: 'Notebooks.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the idea you just taught');
      return [
        `Read a three-line scene that stops before anyone uses this idea: ${idea}.`,
        'Students write the next two lines so the idea changes what a character does.',
        'Two volunteers read their ending.',
        'The class says which ending used the idea more clearly.',
      ];
    },
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
        `Call the first prompt: write one true sentence about ${idea}.`,
        `Second prompt: write what would go wrong if we ignored ${second}.`,
        'Award the point only for a correct idea, not for speed alone. Then explain the miss.',
      ];
    },
  },
  {
    name: 'Reporter interview',
    goal: 'One student asks, the other answers, as if explaining to a younger pupil.',
    materials: 'Notebooks.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'today’s main idea');
      return [
        `Pairs sit face to face. The topic of the interview is: ${idea}.`,
        'The reporter asks three questions a younger student would ask.',
        'The expert answers in short sentences, without reading notes.',
        'Reporters share the clearest answer they heard.',
      ];
    },
  },
  {
    name: 'True or false sort',
    goal: 'Students sort statements and defend the false ones.',
    materials: 'Board or slips of paper.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the idea from today’s lesson');
      return [
        `Read four short statements about this idea. Two are false: ${idea}.`,
        'Students mark true or false in silence, then compare with a partner.',
        'For each false statement, the class says the correction in one sentence.',
        'Leave the corrected lines on the board as the recap.',
      ];
    },
  },
  {
    name: 'One change',
    goal: 'Students name one real change this idea would make and why.',
    materials: 'Notebooks.',
    minutes: 12,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'the idea from today’s lesson');
      return [
        `Remind the class of the idea in one sentence: ${idea}.`,
        'Each student writes one thing they would do differently at home or school because of it.',
        'They add the reason, using the idea, not a slogan.',
        'Hear four answers and point out which reason actually used the lesson.',
      ];
    },
  },
  {
    name: 'Two-speaker exchange',
    goal: 'Two students argue one claim; the class picks the stronger reason.',
    materials: 'Board.',
    minutes: 15,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'one claim from today’s lesson');
      return [
        `Write one claim from the lesson: ${idea}.`,
        'One student gives a reason for it, another gives a careful objection. One minute each.',
        'The class names which reason used the lesson more accurately.',
        'You add the fact they both missed, in a single sentence.',
      ];
    },
  },
  {
    name: 'Three-person poster',
    goal: 'A trio makes one poster that teaches a single idea, and every student adds a line.',
    materials: 'One sheet per three students, and pencils.',
    minutes: 18,
    steps: (ideas) => {
      const idea = ideaOr(ideas, 'one idea from today’s lesson');
      return [
        `Threes only. Their poster teaches just this: ${idea}.`,
        'One student writes the idea, one draws it, one adds a warning about getting it wrong.',
        'Hang two posters. The class says which line teaches the idea best.',
        'You add the missing point before the bell.',
      ];
    },
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

export function cleanTeachingIdea(raw: string): string | null {
  let text = fixLibraryTextEncoding(raw)
    .replace(/^#+\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 24) return null;
  if (/indexed section|page hunt|^key points$|make groups of \d/i.test(text)) return null;

  if (text.length > 110) {
    const clause = text.split(/[;]| — | – | - /)[0]?.trim() ?? text;
    text = clause.length >= 24 ? clause : text.slice(0, 110);
    if (text.length > 110) {
      const space = text.lastIndexOf(' ');
      text = space > 40 ? text.slice(0, space) : text.slice(0, 110);
    }
  }
  text = text.replace(/[.!?,:;]+$/, '').trim();
  if (text.length < 24 || text.length > 140) return null;
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

export function ideasFromChapterText(text: string | undefined, limit = 2): string[] {
  if (!text?.trim()) return [];
  const parts = text.split(/\n+|(?<=[.!?])\s+/);
  return shortTeachingIdeas(parts, limit);
}
