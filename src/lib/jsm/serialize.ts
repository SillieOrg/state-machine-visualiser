import type { Edge } from '@xyflow/react';
import type { JSM, State, EntryAction, ExitCheck } from './schema';
import { getTransitionData, type StateNode } from './parse';

function getParentId(id: string): string | null {
  const dot = id.lastIndexOf('.');
  return dot === -1 ? null : id.slice(0, dot);
}

function getLocalName(id: string): string {
  return id.split('.').pop()!;
}

/** Returns the `goTo` to write for an edge, keeping the original (possibly relative) text if the target is unchanged. */
function edgeGoTo(edge: Edge): string {
  const data = getTransitionData(edge);
  return data && data.resolvedTarget === edge.target ? data.goTo : edge.target;
}

/**
 * Writes event edges back into their source node's entry actions: the edge label
 * becomes the `event` name and the edge target becomes `goTo`. Event actions whose
 * edge was deleted lose their `goTo`.
 */
export function syncEventActions(nodes: StateNode[], edges: Edge[]): StateNode[] {
  const eventEdges = new Map<string, Edge>();
  edges.forEach(edge => {
    const data = getTransitionData(edge);
    if (data?.kind === 'event' && data.actionIndex !== undefined) {
      eventEdges.set(`${edge.source}\u0000${data.actionIndex}`, edge);
    }
  });

  return nodes.map(node => {
    const actions = node.data.entryActions ?? [];
    let changed = false;
    const synced = actions.map((action, i): EntryAction => {
      if (action.event === undefined) return action;
      const edge = eventEdges.get(`${node.id}\u0000${i}`);
      const { goTo: _goTo, ...rest } = action;
      void _goTo;
      const next: EntryAction = edge
        ? { ...rest, event: String(edge.label ?? '').trim() || action.event, goTo: edgeGoTo(edge) }
        : rest;
      if (next.event !== action.event || next.goTo !== action.goTo) changed = true;
      return next;
    });
    return changed ? { ...node, data: { ...node.data, entryActions: synced } } : node;
  });
}

export function serializeToJSM(
  nodes: StateNode[],
  edges: Edge[],
  start: string,
): JSM {
  const exitChecksMap = new Map<string, ExitCheck[]>();
  edges.forEach(edge => {
    if (getTransitionData(edge)?.kind === 'event') return;
    const label = String(edge.label ?? '').trim();
    const checks = exitChecksMap.get(edge.source) ?? [];
    checks.push({ ...(label ? { check: label } : {}), goTo: edgeGoTo(edge) });
    exitChecksMap.set(edge.source, checks);
  });

  const syncedNodes = syncEventActions(nodes, edges);

  function serializeState(node: StateNode): State {
    const id = node.id;
    const entryActions: EntryAction[] = node.data.entryActions ?? [];
    const exitChecks = exitChecksMap.get(id) ?? [];
    const children = syncedNodes.filter(n => getParentId(n.id) === id);

    return {
      name: getLocalName(id),
      ...(entryActions.length > 0 ? { entryActions } : {}),
      ...(exitChecks.length > 0 ? { exitChecks } : {}),
      ...(children.length > 0 ? { children: children.map(serializeState) } : {}),
    };
  }

  const topLevel = syncedNodes.filter(n => getParentId(n.id) === null);

  return {
    entryStateName: start,
    states: topLevel.map(serializeState),
  };
}
