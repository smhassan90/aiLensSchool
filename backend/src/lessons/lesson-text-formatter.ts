const GARBAGE =
  /^(?:[|.\-_—–=¢>•*~`'+]+|\d+\s*[gG]\s+\S+|eae\b|om separately|ha asm nade|it should not show|^Activity$|^Ackiuik$)/i;

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/Allah\s+\d+\s+/g, 'Allah '],
  [/\bAckiuik\b/gi, 'Activity'],
  [/\bAS\s*lla\)/gi, 'Activity:'],
  [/\bAxelson\s+Ask\b/gi, 'Activity: Ask'],
  [/What we should do when someone visit us\??/gi, 'What should we do when someone visits us?'],
  [/A\s+Of course not!\s*It is a bad manner\.?/gi, 'A. No. It is bad manners.'],
  [/Of course not!\s*It is a bad manner\.?/gi, 'No. It is bad manners.'],
  [/\bvisit us\?/gi, 'visits us?'],
  [/\bAlla\s+ah\b/gi, 'Allah'],
  [/\bwh at\b/gi, 'what'],
  [/\s+\|\s*/g, ' '],
  [/\s{2,}/g, ' '],
];

function isGarbage(line: string) {
  const trimmed = line.trim();
  if (trimmed.length < 2) return true;
  if (GARBAGE.test(trimmed)) return true;
  if (/^Page\s+\d+$/i.test(trimmed)) return false;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (
    letters / trimmed.length < 0.42 &&
    !/^(Q\.|A\.|Aim|Activity|Hadith|\(?sahih bukhari)/i.test(trimmed)
  ) {
    return true;
  }
  if (/(.)\1{6,}/.test(trimmed)) return true;
  return false;
}

function cleanLine(line: string) {
  let text = line.replace(/[|]+/g, ' ').replace(/[•¢]+/g, ' ').trim();
  for (const [pattern, replacement] of REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/\sE[—\-–\s]+l\b/gi, '')
    .replace(/\bwe\s*$/i, '')
    .replace(/\b6 as a host\b/gi, 'as a host')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (/^A\s+[A-Z]/.test(text) && !text.startsWith('A.')) {
    text = text.replace(/^A\s+/, 'A. ');
  }
  if (/^Q\s+[A-Z]/.test(text) && !text.startsWith('Q.')) {
    text = text.replace(/^Q\s+/, 'Q. ');
  }
  return text;
}

function splitPages(ocrText: string) {
  const chunks = ocrText.split(/^\s*Page\s+(\d+)\s*$/gim);
  if (chunks.length === 1) {
    return [{ title: '', lines: ocrText.split(/\r?\n/) }];
  }
  const pages: Array<{ title: string; lines: string[] }> = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const number = chunks[i];
    const body = chunks[i + 1] ?? '';
    pages.push({
      title: `Page ${number}`,
      lines: body.split(/\r?\n/),
    });
  }
  return pages;
}

function extractKeyPoints(formatted: string) {
  const points: string[] = [];
  const blocks = formatted.split(/\n{2,}/);

  for (const block of blocks) {
    const text = block.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (/^Aim:/i.test(text)) {
      points.push(text.replace(/^Aim:\s*/i, 'Aim: '));
      continue;
    }
    if (/^Q\./i.test(text) && /A\./i.test(text)) {
      const [question, answer] = text.split(/\sA\.\s*/i);
      points.push(
        `${question.replace(/^Q\.\s*/i, '').replace(/\?$/, '').trim()}: ${answer?.trim() ?? ''}`.trim(),
      );
      continue;
    }
    if (/^Hadith:/i.test(text)) {
      points.push(text);
      continue;
    }
    if (/^Activity:/i.test(text)) {
      points.push(text.length > 160 ? `${text.slice(0, 157).trim()}…` : text);
      continue;
    }
    if (/^Allah\b/i.test(text) && text.length < 140) {
      points.push(text);
    }
  }

  return [...new Set(points.filter((point) => point.length > 8))].slice(0, 10);
}

export function formatOcrLesson(ocrText: string, subjectName: string) {
  const pages = splitPages(ocrText);
  const formattedPages: string[] = [];
  let topicName = `${subjectName} lesson`;
  let chapterName: string | undefined;

  for (const page of pages) {
    const cleaned = page.lines.map(cleanLine).filter((line) => line && !isGarbage(line));
    if (!cleaned.length) continue;

    const body: string[] = [];
    if (page.title) body.push(page.title);

    for (let i = 0; i < cleaned.length; i += 1) {
      const line = cleaned[i];
      const next = cleaned[i + 1];

      if (!chapterName && /chapter/i.test(line) && line.length < 80) {
        chapterName = line;
      }
      if (topicName.endsWith('lesson') && line.length <= 40 && /^[A-Z][A-Za-z ]+$/.test(line)) {
        topicName = line;
      }

      if (/^Aim\b/i.test(line)) {
        body.push('', line.replace(/^Aim\s*[:.-]?\s*/i, 'Aim: '));
        continue;
      }
      if (/^(Activity|Do a skit)\b/i.test(line)) {
        const parts = [line.replace(/^Activity:\s*/i, '')];
        while (
          cleaned[i + 1] &&
          !/^(Q\.|A\.|Aim|Who\b|What\b|Should\b|Activity|Hadith|Teacher note)/i.test(cleaned[i + 1])
        ) {
          i += 1;
          parts.push(cleaned[i]);
        }
        body.push('', `Activity: ${parts.join(' ')}`);
        continue;
      }
      if (/serve your guests/i.test(line) || /^\(?sahih bukhari\)?\.?$/i.test(line)) {
        const extra = next && /^\(?sahih bukhari\)?\.?$/i.test(next) ? ` ${next}` : '';
        if (extra) i += 1;
        const quote = `${line}${extra}`.replace(/^Hadith:\s*/i, '').trim();
        if (/^\(?sahih bukhari\)?\.?$/i.test(quote) && body[body.length - 1]?.startsWith('Hadith:')) {
          body[body.length - 1] = `${body[body.length - 1]} ${quote}`;
        } else {
          body.push('', `Hadith: ${quote}`);
        }
        continue;
      }
      if (/^Q\./i.test(line) || /^What\b.+\?$/.test(line) || /^Should\b.+\?$/.test(line) || /^Who\b.+\?$/.test(line)) {
        const question = line.startsWith('Q.') ? line : `Q. ${line}`;
        body.push('', question);
        if (next && !/^(Q\.|Aim|Activity|Who\b|What\b|Should\b)/i.test(next)) {
          const [answer, activity] = next.split(/\s+(?=Activity:)/i);
          body.push(answer.startsWith('A.') ? answer : `A. ${answer}`);
          i += 1;
          if (activity) {
            const parts = [activity.replace(/^Activity:\s*/i, '').trim()];
            while (
              cleaned[i + 1] &&
              !/^(Q\.|A\.|Aim|Who\b|What\b|Should\b|Activity|Hadith|Teacher note)/i.test(cleaned[i + 1])
            ) {
              i += 1;
              parts.push(cleaned[i]);
            }
            body.push('', `Activity: ${parts.join(' ')}`);
          }
        }
        continue;
      }
      if (/^A\./i.test(line)) {
        body.push(line);
        continue;
      }
      if (/^Explain in detail/i.test(line) || /^Supervise the activity/i.test(line)) {
        body.push('', `Teacher note: ${line}`);
        continue;
      }
      body.push(line);
    }

    formattedPages.push(body.join('\n').replace(/\n{3,}/g, '\n\n').trim());
  }

  const summary = formattedPages.join('\n\n').trim();
  return {
    chapterName,
    topicName,
    summary,
    concepts: extractKeyPoints(summary),
  };
}
