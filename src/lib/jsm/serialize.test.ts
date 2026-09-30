import { describe, it, expect } from 'vitest';
import { serializeToJSM } from './serialize';
import type { StateNode } from './parse';
import type { Edge } from '@xyflow/react';

import type { EntryAction } from './schema';

function node(id: string, entryActions: EntryAction[] = []): StateNode {
  return {
    id,
    type: 'stateNode',
    position: { x: 0, y: 0 },
    data: { label: id, entryActions },
  };
}

function edge(source: string, target: string, label: string, i = 0): Edge {
  return { id: `${source}->${target}-${i}`, source, target, label };
}

describe('serializeToJSM', () => {
  it('serializes flat states', () => {
    const nodes = [node('Pending'), node('Done')];
    const edges = [edge('Pending', 'Done', 'finished')];
    const jsm = serializeToJSM(nodes, edges, 'Pending');

    expect(jsm.entryStateName).toBe('Pending');
    expect(jsm.states).toHaveLength(2);
    expect(jsm.states[0]).toMatchObject({
      name: 'Pending',
      exitChecks: [{ check: 'finished', goTo: 'Done' }],
    });
    expect(jsm.states[1]).toMatchObject({ name: 'Done' });
  });

  it('nests child states under their parent', () => {
    const nodes = [node('Complete'), node('Complete.Success'), node('Complete.Error')];
    const jsm = serializeToJSM(nodes, [], 'Complete');

    expect(jsm.states).toHaveLength(1);
    expect(jsm.states[0].name).toBe('Complete');
    expect(jsm.states[0].children).toHaveLength(2);
    expect(jsm.states[0].children![0].name).toBe('Success');
    expect(jsm.states[0].children![1].name).toBe('Error');
  });

  it('uses local name (last segment) for nested state names', () => {
    const nodes = [node('A'), node('A.B'), node('A.B.C')];
    const jsm = serializeToJSM(nodes, [], 'A');

    const a = jsm.states[0];
    expect(a.name).toBe('A');
    expect(a.children![0].name).toBe('B');
    expect(a.children![0].children![0].name).toBe('C');
  });

  it('attaches entry actions to the correct state', () => {
    const nodes = [
      node('Pending', [{ check: 'always', action: 'init' }]),
    ];
    const jsm = serializeToJSM(nodes, [], 'Pending');
    expect(jsm.states[0].entryActions).toEqual([{ check: 'always', action: 'init' }]);
  });

  it('omits empty arrays from output', () => {
    const jsm = serializeToJSM([node('Idle')], [], 'Idle');
    expect(jsm.states[0].entryActions).toBeUndefined();
    expect(jsm.states[0].exitChecks).toBeUndefined();
    expect(jsm.states[0].children).toBeUndefined();
  });

  it('round-trips through parse then serialize', async () => {
    const { parseJSM } = await import('./parse');
    const original = {
      entryStateName: 'Pending',
      states: [
        {
          name: 'Pending',
          entryActions: [{ check: 'ready', action: 'init' }],
          exitChecks: [{ check: 'done', goTo: 'Complete.Success' }],
        },
        {
          name: 'Complete',
          children: [{ name: 'Success' }, { name: 'Error' }],
        },
      ],
    };
    const { nodes, edges } = parseJSM(original);
    const result = serializeToJSM(nodes, edges, 'Pending');
    expect(result).toEqual(original);
  });
});

describe('serializeToJSM with events and optional checks', () => {
  const original = {
    entryStateName: 'Pending',
    states: [
      {
        name: 'Pending',
        exitChecks: [{ check: 'Is State Pending', goTo: 'Landing Page' }],
        children: [
          {
            name: 'Landing Page',
            entryActions: [
              { action: 'Output Landing Message' },
              { event: 'Page Submitted', schema: '/forms/Landing.json', goTo: 'Quote' },
            ],
          },
          {
            name: 'Quote',
            exitChecks: [{ check: 'Is Declined', goTo: 'Declined' }, { goTo: 'Landing Page' }],
          },
          { name: 'Declined' },
        ],
      },
    ],
  };

  it('round-trips events, relative goTos and check-less exit checks', async () => {
    const { parseJSM } = await import('./parse');
    const { nodes, edges } = parseJSM(original);
    expect(serializeToJSM(nodes, edges, 'Pending')).toEqual(original);
  });

  it('writes a changed event edge target back into the entry action', async () => {
    const { parseJSM } = await import('./parse');
    const { nodes, edges } = parseJSM(original);
    const moved = edges.map(e =>
      e.id === 'Pending.Landing Page~event-1' ? { ...e, target: 'Pending.Declined' } : e,
    );
    const result = serializeToJSM(nodes, moved, 'Pending');
    expect(result.states[0].children![0].entryActions![1]).toEqual({
      event: 'Page Submitted',
      schema: '/forms/Landing.json',
      goTo: 'Pending.Declined',
    });
  });

  it('drops goTo when an event edge is deleted', async () => {
    const { parseJSM } = await import('./parse');
    const { nodes, edges } = parseJSM(original);
    const remaining = edges.filter(e => e.id !== 'Pending.Landing Page~event-1');
    const result = serializeToJSM(nodes, remaining, 'Pending');
    expect(result.states[0].children![0].entryActions![1]).toEqual({
      event: 'Page Submitted',
      schema: '/forms/Landing.json',
    });
  });
});
