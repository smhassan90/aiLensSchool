/**
 * Parse JSON from LLM output (markdown fences, prose wrappers, double-encoded strings).
 */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new SyntaxError('Empty model output');
  }

  const fenced = /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(trimmed);
  let body = (fenced?.[1] ?? trimmed).trim();
  const unescaped = decodeLooseEscapedJson(body);
  if (unescaped) {
    body = unescaped;
  }

  const candidates = [body];
  try {
    candidates.push(extractBalancedJsonObject(body));
  } catch {
    // no balanced object in prose
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return unwrapParsedJson(JSON.parse(candidate));
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new SyntaxError('Model output is not valid JSON');
}

/** Model sometimes returns `\n{\n  \"key\": ...` without wrapping quotes. */
function decodeLooseEscapedJson(text: string): string | null {
  const t = text.trim();
  if (!t || t.startsWith('{') || t.startsWith('[')) return null;
  if (!t.includes('{') || (!t.includes('\\"') && !t.includes('\\n'))) return null;
  const unescaped = t
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
  if (!unescaped.startsWith('{') && !unescaped.startsWith('[')) return null;
  return unescaped;
}

function unwrapParsedJson(parsed: unknown): unknown {
  if (typeof parsed !== 'string') return parsed;
  const inner = parsed.trim();
  if (!inner.startsWith('{') && !inner.startsWith('[')) return parsed;
  try {
    return JSON.parse(inner);
  } catch {
    return parsed;
  }
}

/** First top-level `{ ... }` with string/escape awareness (avoids greedy-regex mistakes). */
export function extractBalancedJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) {
    throw new SyntaxError('No JSON object in model output');
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new SyntaxError('Unbalanced JSON object in model output');
}
