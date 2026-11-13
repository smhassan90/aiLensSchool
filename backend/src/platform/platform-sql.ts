/** Split a SQL script into statements. Comments are removed. Quoted semicolons stay inside the statement. */
export function splitSqlStatements(input: string): string[] {
  const source = stripSqlComments(input);
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | null = null;

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quote) {
      current += char;
      if (char === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      continue;
    }
    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

export function isRowReturningSql(sql: string): boolean {
  return /^(select|show|describe|desc|explain|with)\b/i.test(sql.trim());
}

function stripSqlComments(input: string): string {
  let out = '';
  let quote: "'" | '"' | '`' | null = null;
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    const next = input[i + 1];
    if (quote) {
      out += char;
      if (char === quote && input[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
      continue;
    }
    if (char === '-' && next === '-') {
      while (i < input.length && input[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += char;
  }
  return out;
}
