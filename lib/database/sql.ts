/** Convert the application's positional SQLite placeholders without touching SQL literals. */
export function postgresPlaceholders(sql: string): { text: string; count: number } {
  let text = "";
  let index = 0;
  let count = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"') {
      const quote = character;
      const escapeString = quote === "'" && index > 0 && /e/i.test(sql[index - 1])
        && (index < 2 || !/[A-Za-z0-9_$]/.test(sql[index - 2]));
      text += character;
      index += 1;
      while (index < sql.length) {
        const current = sql[index];
        text += current;
        index += 1;
        if (current === "\\" && escapeString && index < sql.length) {
          text += sql[index++];
        } else if (current === quote) {
          if (sql[index] === quote) text += sql[index++];
          else break;
        }
      }
      continue;
    }
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index);
      if (end === -1) { text += sql.slice(index); break; }
      text += sql.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      let depth = 1;
      text += "/*";
      index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith("/*", index)) { depth += 1; text += "/*"; index += 2; }
        else if (sql.startsWith("*/", index)) { depth -= 1; text += "*/"; index += 2; }
        else text += sql[index++];
      }
      continue;
    }
    if (character === "$") {
      const delimiter = /^(?:\$\$|\$[A-Za-z_][A-Za-z_0-9]*\$)/.exec(sql.slice(index))?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        if (end === -1) { text += sql.slice(index); break; }
        text += sql.slice(index, end + delimiter.length);
        index = end + delimiter.length;
        continue;
      }
    }
    text += character === "?" ? `$${++count}` : character;
    index += 1;
  }
  return { text, count };
}
