import { describe, it, expect } from 'vitest';
import { validateJSM } from './validate';

describe('validateJSM normalization', () => {
  it('converts "start" to "entryStateName"', () => {
    const result = validateJSM({
      start: 'Pending',
      states: [{ name: 'Pending' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entryStateName).toBe('Pending');
    }
  });

  it('accepts "entryStateName" directly', () => {
    const result = validateJSM({
      entryStateName: 'Pending',
      states: [{ name: 'Pending' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entryStateName).toBe('Pending');
    }
  });

  it('converts "goto" to "goTo" in exitChecks', () => {
    const result = validateJSM({
      entryStateName: 'Pending',
      states: [
        {
          name: 'Pending',
          exitChecks: [{ check: 'done', goto: 'Complete' }],
        },
        { name: 'Complete' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.states[0].exitChecks?.[0]).toMatchObject({
        check: 'done',
        goTo: 'Complete',
      });
    }
  });

  it('accepts "goTo" directly in exitChecks', () => {
    const result = validateJSM({
      entryStateName: 'Pending',
      states: [
        {
          name: 'Pending',
          exitChecks: [{ check: 'done', goTo: 'Complete' }],
        },
        { name: 'Complete' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.states[0].exitChecks?.[0]).toMatchObject({
        check: 'done',
        goTo: 'Complete',
      });
    }
  });

  it('handles both "start" and "goto" together', () => {
    const result = validateJSM({
      start: 'Pending',
      states: [
        {
          name: 'Pending',
          exitChecks: [{ check: 'done', goto: 'Complete' }],
        },
        { name: 'Complete' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entryStateName).toBe('Pending');
      expect(result.data.states[0].exitChecks?.[0]).toMatchObject({
        check: 'done',
        goTo: 'Complete',
      });
    }
  });

  it('normalizes nested states with "goto"', () => {
    const result = validateJSM({
      entryStateName: 'Pending',
      states: [
        {
          name: 'Pending',
          exitChecks: [{ check: 'fail', goto: 'Complete.Error' }],
        },
        {
          name: 'Complete',
          children: [
            { name: 'Success' },
            { name: 'Error' },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.states[0].exitChecks?.[0]).toMatchObject({
        check: 'fail',
        goTo: 'Complete.Error',
      });
    }
  });
});

describe('validateJSM entry action normalization', () => {
  it('converts "goto" to "goTo" in entry actions', () => {
    const result = validateJSM({
      entryStateName: 'A',
      states: [{ name: 'A', entryActions: [{ event: 'Go', goto: 'B' }] }, { name: 'B' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.states[0].entryActions?.[0]).toEqual({ event: 'Go', goTo: 'B' });
    }
  });
});

describe('validateJSM issues', () => {
  it('describes missing fields with a readable location', () => {
    const result = validateJSM({
      entryStateName: 'Pending',
      states: [{ name: 'Pending', children: [{ name: 'Landing Page', entryActions: [{ check: 'x' }] }, {}] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            location: 'Pending › Landing Page › Entry action 1',
            message: 'Entry action needs either an "action" or an "event"',
          }),
          expect.objectContaining({
            location: 'Pending › State 2 › name',
            message: 'Missing required field "name" (expected text)',
          }),
        ]),
      );
    }
  });

  it('describes wrong types', () => {
    const result = validateJSM({ entryStateName: 'A', states: [{ name: 42 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].message).toBe('"name" should be text, but got a number (42)');
    }
  });
});

describe('validateJSMText', () => {
  it('reports JSON syntax errors with line and column', async () => {
    const { validateJSMText } = await import('./validate');
    const result = validateJSMText('{\n  "entryStateName": "A",\n  "states": [],\n}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]).toMatchObject({ line: 4, column: 1, message: 'Trailing comma before "}"' });
    }
  });

  it('locates schema issues in the source text', async () => {
    const { validateJSMText } = await import('./validate');
    const raw = '{\n  "start": "A",\n  "states": [\n    { "name": "A", "exitChecks": [{ "goto": 5 }] }\n  ]\n}';
    const result = validateJSMText(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.issues[0];
      expect(issue.line).toBe(4);
      expect(raw.slice(issue.start, issue.end)).toBe('5');
    }
  });
});
