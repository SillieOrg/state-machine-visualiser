import { describe, it, expect } from 'vitest';
import { JSMSchema, StateSchema } from './schema';

describe('StateSchema', () => {
  it('accepts a minimal state', () => {
    expect(StateSchema.safeParse({ name: 'Pending' }).success).toBe(true);
  });

  it('accepts entryActions and exitChecks', () => {
    const result = StateSchema.safeParse({
      name: 'Pending',
      entryActions: [{ check: 'cond', action: 'do something' }],
      exitChecks: [{ check: 'done', goTo: 'Complete' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts nested children recursively', () => {
    const result = StateSchema.safeParse({
      name: 'Complete',
      children: [
        { name: 'Success' },
        { name: 'Error', children: [{ name: 'Fatal' }] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a state without a name', () => {
    expect(StateSchema.safeParse({}).success).toBe(false);
  });
});

describe('JSMSchema', () => {
  it('accepts a valid JSM', () => {
    const result = JSMSchema.safeParse({
      entryStateName: 'Pending',
      states: [
        {
          name: 'Pending',
          exitChecks: [{ check: 'done', goTo: 'Complete.Success' }],
        },
        {
          name: 'Complete',
          children: [{ name: 'Success' }, { name: 'Error' }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing start', () => {
    expect(JSMSchema.safeParse({ states: [] }).success).toBe(false);
  });

  it('rejects missing states', () => {
    expect(JSMSchema.safeParse({ entryStateName: 'A' }).success).toBe(false);
  });
});

describe('EntryActionSchema', () => {
  it('accepts an action without a check', () => {
    expect(StateSchema.safeParse({ name: 'A', entryActions: [{ action: 'Do it' }] }).success).toBe(true);
  });

  it('accepts an event with schema and goTo', () => {
    const result = StateSchema.safeParse({
      name: 'A',
      entryActions: [{ event: 'Page Submitted', schema: '/forms/a.json', goTo: 'B' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an entry action with neither action nor event', () => {
    expect(StateSchema.safeParse({ name: 'A', entryActions: [{ check: 'x' }] }).success).toBe(false);
  });

  it('rejects an entry action with both action and event', () => {
    expect(
      StateSchema.safeParse({ name: 'A', entryActions: [{ action: 'a', event: 'e' }] }).success,
    ).toBe(false);
  });
});

describe('ExitCheckSchema', () => {
  it('accepts an exit check without a check', () => {
    expect(StateSchema.safeParse({ name: 'A', exitChecks: [{ goTo: 'B' }] }).success).toBe(true);
  });
});
