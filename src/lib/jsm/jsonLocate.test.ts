import { describe, it, expect } from 'vitest';
import { indexJson, JsonSyntaxError, locatePath, offsetToLineColumn } from './jsonLocate';

describe('indexJson', () => {
  const text = '{\n  "states": [\n    { "name": "A" }\n  ]\n}';

  it('records the range of nested values', () => {
    const ranges = indexJson(text);
    const range = locatePath(ranges, ['states', 0, 'name'])!;
    expect(text.slice(range.start, range.end)).toBe('"A"');
  });

  it('falls back to the closest ancestor for missing paths', () => {
    const ranges = indexJson(text);
    const range = locatePath(ranges, ['states', 0, 'missing'])!;
    expect(text.slice(range.start, range.end)).toBe('{ "name": "A" }');
  });

  it('reports trailing commas with their position', () => {
    const bad = '{ "a": 1, }';
    expect(() => indexJson(bad)).toThrow(JsonSyntaxError);
    try {
      indexJson(bad);
    } catch (e) {
      expect((e as JsonSyntaxError).message).toMatch(/Trailing comma/);
      expect((e as JsonSyntaxError).offset).toBe(10);
    }
  });

  it('reports missing commas', () => {
    expect(() => indexJson('{ "a": 1 "b": 2 }')).toThrow(/comma missing/);
  });
});

describe('offsetToLineColumn', () => {
  it('converts offsets to 1-based line and column', () => {
    expect(offsetToLineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
  });
});
