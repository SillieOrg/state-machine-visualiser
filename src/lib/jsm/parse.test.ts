import { describe, it, expect } from 'vitest';
import { parseJSM } from './parse';
import type { JSM } from './schema';

const sampleJSM: JSM = {
  entryStateName: 'Pending',
  states: [
    {
      name: 'Pending',
      entryActions: [{ check: 'ready', action: 'init' }],
      exitChecks: [
        { check: 'success', goTo: 'Complete.Success' },
        { check: 'error', goTo: 'Complete.Error' },
      ],
    },
    {
      name: 'Complete',
      children: [{ name: 'Success' }, { name: 'Error' }],
    },
  ],
};

describe('parseJSM', () => {
  it('creates a node for every flat and child state', () => {
    const { nodes } = parseJSM(sampleJSM);
    const ids = nodes.map(n => n.id);
    expect(ids).toContain('Pending');
    expect(ids).toContain('Complete');
    expect(ids).toContain('Complete.Success');
    expect(ids).toContain('Complete.Error');
    expect(nodes).toHaveLength(4);
  });

  it('labels child nodes with Parent.Child notation', () => {
    const { nodes } = parseJSM(sampleJSM);
    const successNode = nodes.find(n => n.id === 'Complete.Success');
    expect(successNode?.data.label).toBe('Complete.Success');
  });

  it('attaches entryActions to node data', () => {
    const { nodes } = parseJSM(sampleJSM);
    const pending = nodes.find(n => n.id === 'Pending');
    expect(pending?.data.entryActions).toEqual([{ check: 'ready', action: 'init' }]);
  });

  it('creates edges from exitChecks', () => {
    const { edges } = parseJSM(sampleJSM);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ source: 'Pending', target: 'Complete.Success', label: 'success' });
    expect(edges[1]).toMatchObject({ source: 'Pending', target: 'Complete.Error', label: 'error' });
  });

  it('sets all initial positions to 0,0', () => {
    const { nodes } = parseJSM(sampleJSM);
    nodes.forEach(n => expect(n.position).toEqual({ x: 0, y: 0 }));
  });

  it('sets node type to stateNode', () => {
    const { nodes } = parseJSM(sampleJSM);
    nodes.forEach(n => expect(n.type).toBe('stateNode'));
  });
});

describe('parseJSM events and optional checks', () => {
  const jsm = {
    entryStateName: 'Pending',
    states: [
      {
        name: 'Pending',
        children: [
          { name: 'Landing Page', entryActions: [{ event: 'Page Submitted', schema: '/f.json', goTo: 'Quote' }] },
          { name: 'Quote', exitChecks: [{ goTo: 'Landing Page' }] },
        ],
      },
    ],
  };

  it('creates event edges from event entry actions with goTo', () => {
    const { edges } = parseJSM(jsm);
    const eventEdge = edges.find(e => e.source === 'Pending.Landing Page');
    expect(eventEdge).toMatchObject({
      target: 'Pending.Quote',
      label: 'Page Submitted',
      data: { kind: 'event', goTo: 'Quote', actionIndex: 0, schema: '/f.json' },
    });
  });

  it('uses an empty label for exit checks without a check', () => {
    const { edges } = parseJSM(jsm);
    const exitEdge = edges.find(e => e.source === 'Pending.Quote');
    expect(exitEdge).toMatchObject({ target: 'Pending.Landing Page', label: '', data: { kind: 'exitCheck' } });
  });
});
