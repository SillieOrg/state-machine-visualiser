import type { Node, Edge } from '@xyflow/react';
import type { JSM, State, EntryAction } from './schema';

export type StateNodeData = {
  label: string;
  entryActions: EntryAction[];
};

export type StateNode = Node<StateNodeData, 'stateNode'>;

export type TransitionEdgeData = {
  /** 'exitCheck' edges come from `exitChecks`; 'event' edges come from event entry actions with a `goTo` */
  kind: 'exitCheck' | 'event';
  /** The `goTo` text as written in the JSM (may be relative) */
  goTo: string;
  /** The node id `goTo` resolved to when parsed */
  resolvedTarget: string;
  /** Index of the originating entry action (event edges only) */
  actionIndex?: number;
  /** JSON schema for the event payload (event edges only) */
  schema?: string;
};

export function getTransitionData(edge: Edge): TransitionEdgeData | undefined {
  const data = edge.data as Partial<TransitionEdgeData> | undefined;
  return data?.kind ? (data as TransitionEdgeData) : undefined;
}

export function isEventEdge(edge: Edge): boolean {
  return getTransitionData(edge)?.kind === 'event';
}

export type ParseProgressCallback = (progress: {
  currentIndex: number;
  totalNodes: number;
  currentNodeId: string;
  previousNodeId?: string;
}) => void;

function flattenStates(
  states: State[],
  prefix = '',
): Array<{ id: string; state: State }> {
  return states.flatMap(state => {
    const id = prefix ? `${prefix}.${state.name}` : state.name;
    const entry = { id, state };
    if (state.children?.length) {
      return [entry, ...flattenStates(state.children, id)];
    }
    return [entry];
  });
}

export function parseJSM(
  jsm: JSM,
  onProgress?: ParseProgressCallback,
): { nodes: StateNode[]; edges: Edge[] } {
  const flat = flattenStates(jsm.states);
  
  // Create a map of all possible node IDs for target resolution
  const allNodeIds = new Set(flat.map(f => f.id));

  const nodes: StateNode[] = [];
  let previousNodeId: string | undefined;

  for (let i = 0; i < flat.length; i++) {
    const { id, state } = flat[i];
    
    onProgress?.({
      currentIndex: i + 1,
      totalNodes: flat.length,
      currentNodeId: id,
      previousNodeId,
    });

    nodes.push({
      id,
      type: 'stateNode',
      position: { x: 0, y: 0 },
      data: {
        label: id,
        entryActions: state.entryActions ?? [],
      },
    });

    previousNodeId = id;
  }

  const edges: Edge[] = flat.flatMap(({ id, state }) => [
    ...(state.exitChecks ?? []).map((check, i): Edge => {
      const target = resolveTarget(id, check.goTo, allNodeIds);
      return {
        id: `${id}->${check.goTo}-${i}`,
        source: id,
        target,
        label: check.check ?? '',
        data: { kind: 'exitCheck', goTo: check.goTo, resolvedTarget: target } satisfies TransitionEdgeData,
      };
    }),
    ...buildEventEdges(id, state.entryActions ?? [], allNodeIds),
  ]);

  return { nodes, edges };
}

/** Resolves a (possibly relative) `goTo` reference from `sourceId` to a node id. */
export function resolveTarget(sourceId: string, goTo: string, allNodeIds: Set<string>): string {
  if (allNodeIds.has(goTo)) return goTo;
  // Try: source.target (child of source)
  if (allNodeIds.has(`${sourceId}.${goTo}`)) return `${sourceId}.${goTo}`;
  if (sourceId.includes('.')) {
    // Try: parent.target (sibling of source)
    const sourcePrefix = sourceId.substring(0, sourceId.lastIndexOf('.'));
    const prefixedTarget = `${sourcePrefix}.${goTo}`;
    if (allNodeIds.has(prefixedTarget)) return prefixedTarget;
  }
  // Fallback: find any node that ends with .target
  const match = Array.from(allNodeIds).find(nodeId => nodeId.endsWith(`.${goTo}`));
  return match ?? goTo;
}

/** Builds the edges for a node's event entry actions that have a `goTo`. */
export function buildEventEdges(
  sourceId: string,
  entryActions: EntryAction[],
  allNodeIds: Set<string>,
): Edge[] {
  return entryActions.flatMap((action, i): Edge[] => {
    if (action.event === undefined || !action.goTo) return [];
    const target = resolveTarget(sourceId, action.goTo, allNodeIds);
    return [{
      id: `${sourceId}~event-${i}`,
      source: sourceId,
      target,
      label: action.event,
      data: {
        kind: 'event',
        goTo: action.goTo,
        resolvedTarget: target,
        actionIndex: i,
        ...(action.schema !== undefined ? { schema: action.schema } : {}),
      } satisfies TransitionEdgeData,
    }];
  });
}
