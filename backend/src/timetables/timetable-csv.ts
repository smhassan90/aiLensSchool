import { Weekday } from '@prisma/client';
import { parseClassNumber } from '../common/utils/section-class-label';
import { normalizeHm } from '../teachers/teacher-checkin';

export type ExtractedRowKind = 'LESSON' | 'BREAK' | 'OTHER';

export type ExtractedRow = {
  periodNumber: number | null;
  kind: ExtractedRowKind;
  startTime: string | null;
  endTime: string | null;
  cells: Partial<Record<Weekday, { subjectText: string; teacherText: string }>>;
};

export type TimetableCsvParseResult = {
  classLabel: string | null;
  rows: ExtractedRow[];
  meta: Record<string, string>;
  warnings: Array<{ code: string; message: string }>;
};

const WEEKDAYS: Weekday[] = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
];

const WEEKDAY_HEADER: Record<string, Weekday> = {
  MONDAY: Weekday.MONDAY,
  TUESDAY: Weekday.TUESDAY,
  WEDNESDAY: Weekday.WEDNESDAY,
  THURSDAY: Weekday.THURSDAY,
  FRIDAY: Weekday.FRIDAY,
};

const BREAK_LABELS = new Set(['BREAK TIME', 'BREAK', 'RECESS', 'LUNCH']);

export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

function parsePeriodNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseTimeRange(
  raw: string,
  morningAnchor: number | null,
): { start: string | null; end: string | null } {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { start: null, end: null };
  const parts = cleaned.split(/\s*-\s*/);
  if (parts.length !== 2) return { start: null, end: null };
  const start = parseClock(parts[0], morningAnchor);
  const end = parseClock(parts[1], morningAnchor);
  if (!start || !end) return { start: null, end: null };
  return { start, end };
}

function parseClock(token: string, morningAnchor: number | null): string | null {
  const t = token.trim().toUpperCase();
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3];
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (!ap && morningAnchor !== null && h < 7) h += 12;
  if (!ap && morningAnchor !== null && h >= 1 && h <= 6) h += 12;
  const hm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  return normalizeHm(hm);
}

function splitCell(cell: string): { subjectText: string; teacherText: string } {
  const parts = cell.split(/\r?\n/);
  if (parts.length >= 2) {
    return { subjectText: parts[0].trim(), teacherText: parts.slice(1).join(' ').trim() };
  }
  return { subjectText: cell.trim(), teacherText: '' };
}

function classLabelFromLine(line: string): string | null {
  if (parseClassNumber(line) !== null) return line.trim();
  const m = line.match(/CLASS\s+([IVX]+|\d+)/i);
  if (m) return `CLASS ${m[1].toUpperCase()}`;
  return null;
}

function isFooterRow(firstCell: string): boolean {
  const u = firstCell.trim().toUpperCase();
  return (
    u.startsWith('CLASS TEACHER') ||
    u.startsWith('WORKING DAYS') ||
    u.startsWith('FRIDAY TIMING') ||
    u === ''
  );
}

export function parseTimetableCsv(csvText: string): TimetableCsvParseResult {
  const table = parseCsvRecords(csvText);
  const warnings: TimetableCsvParseResult['warnings'] = [];
  const meta: Record<string, string> = {};
  let classLabel: string | null = null;
  let headerIndex = -1;
  let hasTimeColumn = false;
  const weekdayCols: Partial<Record<number, Weekday>> = {};

  for (let i = 0; i < table.length; i++) {
    const cells = table[i].map((c) => c.trim());
    const upper = cells.map((c) => c.toUpperCase());
    const hasPeriod = upper.some((c) => c === 'PERIOD');
    const dayCount = upper.filter((c) => WEEKDAY_HEADER[c]).length;
    if (hasPeriod && dayCount >= 3) {
      headerIndex = i;
      const periodCol = upper.indexOf('PERIOD');
      hasTimeColumn = upper[periodCol + 1] === 'TIME';
      for (let c = 0; c < upper.length; c++) {
        const wd = WEEKDAY_HEADER[upper[c]];
        if (wd) weekdayCols[c] = wd;
      }
      break;
    }
    const joined = cells.join(' ');
    const label = classLabelFromLine(joined);
    if (label && !classLabel) classLabel = label;
  }

  if (headerIndex < 0) {
    return { classLabel, rows: [], meta, warnings: [{ code: 'NO_HEADER', message: 'Could not find timetable header row' }] };
  }

  for (let i = 0; i < headerIndex; i++) {
    const line = table[i].map((c) => c.trim()).filter(Boolean).join(' ');
    const label = classLabelFromLine(line);
    if (label) classLabel = label;
  }

  const rows: ExtractedRow[] = [];
  let dataStartIndex = headerIndex + 1;
  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i].map((c) => c.trim());
    const line = cells.filter(Boolean).join(' ');
    const label = classLabelFromLine(line);
    if (label) {
      classLabel = label;
      dataStartIndex = i + 1;
      continue;
    }
    if (parsePeriodNumber(cells[0] ?? '') || cells.some((c) => BREAK_LABELS.has(c.toUpperCase()))) {
      dataStartIndex = i;
      break;
    }
  }
  let lastPeriodNumber = 0;
  let morningAnchor: number | null = null;

  for (let i = dataStartIndex; i < table.length; i++) {
    const cells = table[i].map((c) => c.trim());
    const first = cells[0] ?? '';
    if (isFooterRow(first)) {
      meta[first || `row_${i}`] = cells.filter(Boolean).join(' | ');
      if (first.toUpperCase().startsWith('FRIDAY TIMING')) {
        warnings.push({ code: 'FRIDAY_TIMING_NOTE', message: cells.join(' ') });
      }
      continue;
    }

    const periodCol = 0;
    const timeCol = hasTimeColumn ? 1 : -1;
    const periodRaw = cells[periodCol] ?? '';
    const periodNumber = parsePeriodNumber(periodRaw);
    const timeRaw = timeCol >= 0 ? cells[timeCol] ?? '' : '';
    const { start, end } = parseTimeRange(timeRaw, morningAnchor);
    if (start) {
      const [h] = start.split(':').map(Number);
      if (morningAnchor === null && h >= 7 && h <= 11) morningAnchor = h;
    }

    const cellStart = hasTimeColumn ? 2 : 1;
    const dayCells: Partial<Record<Weekday, { subjectText: string; teacherText: string }>> = {};
    for (const [col, wd] of Object.entries(weekdayCols)) {
      if (!wd) continue;
      const idx = Number(col);
      const raw = cells[idx] ?? '';
      if (!raw) continue;
      dayCells[wd] = splitCell(raw);
    }

    const firstDayText = Object.values(dayCells)[0]?.subjectText?.toUpperCase() ?? '';
    const isBreak =
      !periodNumber &&
      (BREAK_LABELS.has(firstDayText) || Object.values(dayCells).every((c) => BREAK_LABELS.has(c.subjectText.toUpperCase())));

    if (periodNumber) lastPeriodNumber = periodNumber;

    if (!periodNumber && !isBreak && lastPeriodNumber > 0 && !parsePeriodNumber(first)) {
      meta[`row_${i}`] = cells.join(' | ');
      continue;
    }

    rows.push({
      periodNumber: isBreak ? null : periodNumber,
      kind: isBreak ? 'BREAK' : periodNumber ? 'LESSON' : 'OTHER',
      startTime: start,
      endTime: end,
      cells: dayCells,
    });
  }

  return { classLabel, rows, meta, warnings };
}
