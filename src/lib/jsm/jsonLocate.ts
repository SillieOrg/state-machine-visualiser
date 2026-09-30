export type JsonPath = ReadonlyArray<string | number>;

export interface TextRange {
  start: number;
  end: number;
}

export interface LineColumn {
  line: number;
  column: number;
}

export class JsonSyntaxError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(message);
    this.name = 'JsonSyntaxError';
  }
}

export function pathKey(path: JsonPath): string {
  return path.map(p => String(p)).join('\u0000');
}

function describeChar(ch: string | undefined): string {
  if (ch === undefined) return 'end of input';
  if (ch === '\n') return 'line break';
  return `"${ch}"`;
}

/**
 * Minimal JSON scanner that records the source range of every value by path.
 * Throws a {@link JsonSyntaxError} with a human-readable message and offset
 * when the input is not valid JSON.
 */
export function indexJson(text: string): Map<string, TextRange> {
  const ranges = new Map<string, TextRange>();
  let i = 0;

  const skipWs = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };

  const fail = (message: string, at = i): never => {
    throw new JsonSyntaxError(message, at);
  };

  const parseString = (): string => {
    const start = i;
    i++; // opening quote
    let out = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === '\\') {
        const next = text[i + 1];
        if (next === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid unicode escape in string', i);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (next === undefined || !(next in escapes)) fail('Invalid escape sequence in string', i);
        out += escapes[next];
        i += 2;
        continue;
      }
      if (ch === '\n') fail('Unterminated string — missing closing quote', start);
      out += ch;
      i++;
    }
    return fail('Unterminated string — missing closing quote', start);
  };

  const parseValue = (path: (string | number)[]): void => {
    skipWs();
    const start = i;
    const ch = text[i];
    if (ch === '{') {
      i++;
      skipWs();
      if (text[i] === '}') {
        i++;
      } else {
        for (;;) {
          skipWs();
          if (text[i] !== '"') {
            if (text[i] === '}') fail('Trailing comma before "}"');
            fail(`Expected a property name in double quotes but found ${describeChar(text[i])}`);
          }
          const key = parseString();
          skipWs();
          if (text[i] !== ':') fail(`Expected ":" after property name "${key}"`);
          i++;
          parseValue([...path, key]);
          skipWs();
          if (text[i] === ',') {
            i++;
            continue;
          }
          if (text[i] === '}') {
            i++;
            break;
          }
          fail(`Expected "," or "}" but found ${describeChar(text[i])} — is a comma missing?`);
        }
      }
    } else if (ch === '[') {
      i++;
      skipWs();
      if (text[i] === ']') {
        i++;
      } else {
        let index = 0;
        for (;;) {
          skipWs();
          if (text[i] === ']') fail('Trailing comma before "]"');
          parseValue([...path, index++]);
          skipWs();
          if (text[i] === ',') {
            i++;
            continue;
          }
          if (text[i] === ']') {
            i++;
            break;
          }
          fail(`Expected "," or "]" but found ${describeChar(text[i])} — is a comma missing?`);
        }
      }
    } else if (ch === '"') {
      parseString();
    } else {
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
      if (!match) {
        if (ch === "'") fail('Strings must use double quotes, not single quotes');
        fail(`Unexpected ${describeChar(ch)}`);
      }
      i += match![0].length;
    }
    ranges.set(pathKey(path), { start, end: i });
  };

  parseValue([]);
  skipWs();
  if (i < text.length) fail(`Unexpected ${describeChar(text[i])} after the end of the JSON document`);
  return ranges;
}

/**
 * Finds the source range for `path`. If the exact path does not exist
 * (e.g. a missing property), the closest existing ancestor is returned.
 */
export function locatePath(ranges: Map<string, TextRange>, path: JsonPath): TextRange | null {
  for (let len = path.length; len >= 0; len--) {
    const range = ranges.get(pathKey(path.slice(0, len)));
    if (range) return range;
  }
  return null;
}

export function offsetToLineColumn(text: string, offset: number): LineColumn {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}
