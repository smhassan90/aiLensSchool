export type ContentStyleHints = {
  easy: boolean;
  hard: boolean;
  short: boolean;
  long: boolean;
  raw: string;
};

const EASY_SWAPS: Array<[RegExp, string]> = [
  [/\bapproximately\b/gi, 'about'],
  [/\btherefore\b/gi, 'so'],
  [/\bhowever\b/gi, 'but'],
  [/\bcomprehend\b/gi, 'understand'],
  [/\bdemonstrate\b/gi, 'show'],
  [/\butilize\b/gi, 'use'],
  [/\bsignificant\b/gi, 'important'],
  [/\bsubsequently\b/gi, 'then'],
  [/\bfundamental\b/gi, 'basic'],
  [/\bcharacteristic\b/gi, 'feature'],
  [/\bconsequently\b/gi, 'so'],
  [/\bnevertheless\b/gi, 'still'],
  [/\benumerate\b/gi, 'list'],
  [/\billustrate\b/gi, 'show'],
  [/\bdetermine\b/gi, 'find'],
  [/\bidentify\b/gi, 'find'],
  [/\bconclude\b/gi, 'end'],
  [/\badditional\b/gi, 'more'],
  [/\bnecessary\b/gi, 'needed'],
  [/\bappropriate\b/gi, 'right'],
];

export function parseStyleHints(instruction?: string | null): ContentStyleHints {
  const raw = instruction?.trim() ?? '';
  const text = raw.toLowerCase();
  return {
    easy: /\beasy\b|\bsimple\b|\bsimpler\b|\byoung\b|\bbasic\b|\beasier\b/.test(text),
    hard: /\bhard\b|\bdifficult\b|\badvanced\b|\bchallenging\b|\bcomplex\b|\bharder\b/.test(text),
    short: /\bshort\b|\bbrief\b|\bconcise\b|\bfew\b|\bshorter\b/.test(text),
    long: /\blong\b|\bdetailed\b|\belaborate\b|\blonger\b|\bmore detail/.test(text),
    raw,
  };
}

export function simplifyWording(text: string) {
  return EASY_SWAPS.reduce((next, [from, to]) => next.replace(from, to), text);
}

export function applyKeyPointStyle(points: string[], instruction?: string | null) {
  const hints = parseStyleHints(instruction);
  let next = points.map((point) => point.trim()).filter(Boolean);
  if (!next.length) return next;

  if (hints.easy) {
    next = next.map((point) => simplifyWording(point));
  }
  if (hints.short) {
    next = next.slice(0, Math.min(5, next.length)).map((point) => {
      const cut = point.split(/[.!?]/)[0]?.trim() || point;
      return cut.length > 90 ? `${cut.slice(0, 87).trimEnd()}…` : cut;
    });
  } else if (hints.long) {
    next = next.slice(0, 12);
  }
  return next;
}

export function generateStyledHomework(input: {
  subjectName: string;
  topicName?: string | null;
  extractedText: string;
  keyPoints: string[];
  instruction?: string | null;
  gradeName?: string | null;
}) {
  const hints = parseStyleHints(input.instruction);
  const topic = input.topicName?.trim() || input.subjectName;
  const grade = input.gradeName?.trim() || 'this class';
  const points = applyKeyPointStyle(
    input.keyPoints.length
      ? input.keyPoints
      : input.extractedText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 12)
          .slice(0, 8),
    input.instruction,
  ).slice(0, hints.short ? 3 : hints.long ? 8 : 5);

  const numbered = points.map((point, index) => `${index + 1}. ${point}`).join('\n');
  const customNote = hints.raw && !hints.easy && !hints.hard && !hints.short && !hints.long
    ? `Follow this request: ${hints.raw}\n\n`
    : '';

  if (hints.easy || hints.short) {
    return {
      title: `${topic} practice`,
      description: `${customNote}Do this short ${input.subjectName} homework for ${grade}. Use easy words.\n\n${numbered || '1. Read today’s lesson again.'}\n\nWrite 2 or 3 short answers in your notebook.`,
    };
  }

  if (hints.hard || hints.long) {
    return {
      title: `${topic} extended practice`,
      description: `${customNote}Complete a thorough ${input.subjectName} homework for ${grade}. Use complete sentences.\n\n${numbered || '1. Review the full lesson and explain the main idea.'}\n\nAdd one example of your own and one question you still have.`,
    };
  }

  return {
    title: `${topic} homework`,
    description: `${customNote}Based on today’s ${input.subjectName} lesson, complete the following:\n\n${numbered || '1. Review the lesson pages and write the main ideas.'}\n\nWrite your answers neatly.`,
  };
}

export function applyDiaryStyle(text: string, instruction?: string | null) {
  const hints = parseStyleHints(instruction);
  let next = text.trim();
  if (hints.easy) next = simplifyWording(next);
  if (hints.short) {
    next = next
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join('\n');
  }
  return next;
}
