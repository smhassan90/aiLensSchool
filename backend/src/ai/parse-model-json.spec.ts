import { parseModelJson } from './parse-model-json';

describe('parseModelJson', () => {
  it('parses a plain object', () => {
    const out = parseModelJson('{"chapterName":"A","summary":"Hello","concepts":[]}') as {
      summary: string;
    };
    expect(out.summary).toBe('Hello');
  });

  it('parses markdown-fenced JSON', () => {
    const out = parseModelJson('```json\n{"summary":"Hi","concepts":[]}\n```') as { summary: string };
    expect(out.summary).toBe('Hi');
  });

  it('parses JSON returned as an escaped string literal', () => {
    const inner = {
      chapterName: 'Missing Numbers',
      summary: 'Missing numbers are the numbers that have been missed.',
      concepts: ['sequence'],
    };
    const wrapped = JSON.stringify(JSON.stringify(inner));
    const out = parseModelJson(wrapped) as { summary: string };
    expect(out.summary).toContain('Missing numbers');
  });

  it('parses escaped JSON without outer quotes', () => {
    const raw =
      '\\n{\\n  \\"chapterName\\": \\"Ch1\\",\\n  \\"summary\\": \\"Lesson body text.\\",\\n  \\"concepts\\": [\\"idea\\"]\\n}';
    const out = parseModelJson(raw) as { summary: string };
    expect(out.summary).toBe('Lesson body text.');
  });

  it('does not break when summary contains braces', () => {
    const payload = {
      summary: 'Use set {1,2,3} and {4,5} in class.',
      concepts: [],
    };
    const out = parseModelJson(JSON.stringify(payload)) as { summary: string };
    expect(out.summary).toContain('{4,5}');
  });
});
