import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type XYPosition,
} from '@xyflow/react';
import { validateJSMText, type JsmIssue } from '@/lib/jsm/validate';
import {
  parseJSM,
  buildEventEdges,
  isEventEdge,
  type StateNode,
  type ParseProgressCallback,
} from '@/lib/jsm/parse';
import { applyLayout, type LayoutType } from '@/lib/jsm/layout';
import { serializeToJSM, syncEventActions } from '@/lib/jsm/serialize';
import { useLibraryStore, type Positions, type PersistedEdgeData } from '@/lib/libraryStore';
import type { EntryAction } from '@/lib/jsm/schema';

interface StoreState {
  input: string;
  error: string | null;
  issues: JsmIssue[];
  isLoading: boolean;
  parseProgress: { currentIndex: number; totalNodes: number; currentNodeId: string; previousNodeId?: string } | null;
  nodes: StateNode[];
  edges: Edge[];
  start: string;
  layoutAlgorithm: LayoutType;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  pendingLabelEdgeId: string | null;
  edgeControlPoints: Record<string, XYPosition>;
  // textarea-driven
  setInput: (input: string) => void;
  // load / navigation
  loadEntry: (id: string) => void;
  resetLayout: () => void;
  newJSM: () => void;
  setLayoutAlgorithm: (type: LayoutType) => void;
  // canvas editing
  addNode: (position: XYPosition) => void;
  deleteNodes: (ids: string[]) => void;
  renameNode: (id: string, newLocalName: string) => void;
  updateEntryActions: (nodeId: string, actions: EntryAction[]) => void;
  connectNodes: (connection: Connection) => void;
  updateEdgeLabel: (edgeId: string, label: string) => void;
  deleteEdges: (ids: string[]) => void;
  setEdgeControlPoint: (edgeId: string, point: XYPosition | null) => void;
  updateEdgeHandle: (edgeId: string, sourceHandle?: string | null, targetHandle?: string | null) => void;
  clearPendingLabel: () => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  // react-flow change handlers
  onNodesChange: (changes: NodeChange<StateNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
}

type ParseResult =
  | { ok: true; nodes: StateNode[]; edges: Edge[]; startName: string }
  | { ok: false; error: string; issues: JsmIssue[] };

function tryParse(
  raw: string,
  existingPositions: Positions,
  layoutType: LayoutType,
  onProgress?: ParseProgressCallback,
): ParseResult {
  const result = validateJSMText(raw);
  if (!result.success) return { ok: false, error: result.error, issues: result.issues };

  const { nodes, edges } = parseJSM(result.data, onProgress);
  const laidOut = applyLayout(nodes, edges, layoutType);
  const merged = laidOut.map(n => ({
    ...n,
    position: existingPositions[n.id] ?? n.position,
  })) as StateNode[];

  return { ok: true, nodes: merged, edges, startName: result.data.entryStateName };
}

function extractPositions(nodes: StateNode[]): Positions {
  const out: Positions = {};
  nodes.forEach(n => { out[n.id] = n.position; });
  return out;
}

function uniqueName(base: string, existingIds: Set<string>): string {
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function stableEdgeKey(edges: Edge[], edge: Edge): string {
  const sameDirection = edges.filter(e => e.source === edge.source && e.target === edge.target);
  const idx = sameDirection.indexOf(edge);
  return `${edge.source}>${edge.target}>${idx}`;
}

function buildEdgeData(
  edges: Edge[],
  controlPoints: Record<string, XYPosition>,
): Record<string, PersistedEdgeData> {
  const out: Record<string, PersistedEdgeData> = {};
  edges.forEach(edge => {
    const key = stableEdgeKey(edges, edge);
    const cp = controlPoints[edge.id];
    if (cp || edge.sourceHandle != null || edge.targetHandle != null) {
      out[key] = {
        ...(cp ? { controlPoint: cp } : {}),
        ...(edge.sourceHandle != null ? { sourceHandle: edge.sourceHandle } : {}),
        ...(edge.targetHandle != null ? { targetHandle: edge.targetHandle } : {}),
      };
    }
  });
  return out;
}

let renderTimer: ReturnType<typeof setTimeout> | null = null;
let positionTimer: ReturnType<typeof setTimeout> | null = null;
let cpTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<StoreState>((set, get) => {
  function applyCanvasEdit(
    editedNodes: StateNode[],
    newEdges: Edge[],
    newStart: string,
  ) {
    if (renderTimer) clearTimeout(renderTimer);
    const newNodes = syncEventActions(editedNodes, newEdges);
    const currentCPs = get().edgeControlPoints;
    const newInput = JSON.stringify(
      serializeToJSM(newNodes, newEdges, newStart),
      null,
      2,
    );
    set({ nodes: newNodes, edges: newEdges, start: newStart, input: newInput, error: null, issues: [] });

    const lib = useLibraryStore.getState();
    const edgeData = buildEdgeData(newEdges, currentCPs);

    if (lib.activeId) {
      lib.updateEntry(lib.activeId, { raw: newInput, positions: extractPositions(newNodes), edgeData });
    } else if (newNodes.length > 0) {
      const newId = lib.createEntry(newStart || 'Untitled', newInput, extractPositions(newNodes));
      lib.setActive(newId);
    }
  }

  return {
    input: '',
    error: null,
    issues: [],
    isLoading: false,
    parseProgress: null,
    nodes: [],
    edges: [],
    start: '',
    layoutAlgorithm: 'hierarchical',
    selectedNodeId: null,
    selectedEdgeId: null,
    pendingLabelEdgeId: null,
    edgeControlPoints: {},

    setInput: (input) => {
      set({ input });
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        set({ isLoading: true, parseProgress: null });
        const lib = useLibraryStore.getState();
        const result = tryParse(
          input,
          extractPositions(get().nodes),
          get().layoutAlgorithm,
          (progress) => set({ parseProgress: progress }),
        );

        if (!result.ok) {
          set({
            error: input.trim() ? result.error : null,
            issues: input.trim() ? result.issues : [],
            isLoading: false,
            parseProgress: null,
          });
          if (lib.activeId) lib.updateEntry(lib.activeId, { raw: input });
          return;
        }

        set({ nodes: result.nodes, edges: result.edges, start: result.startName, error: null, issues: [], isLoading: false, parseProgress: null });
        const positions = extractPositions(result.nodes);

        if (lib.activeId) {
          lib.updateEntry(lib.activeId, { raw: input, positions });
        } else {
          const newId = lib.createEntry(result.startName, input, positions);
          lib.setActive(newId);
        }
      }, 600);
    },

    loadEntry: (id) => {
      set({ isLoading: true, parseProgress: null });
      const entry = useLibraryStore.getState().entries.find(e => e.id === id);
      if (!entry) {
        set({ isLoading: false });
        return;
      }
      const layoutAlgo = entry.layoutAlgorithm ?? 'hierarchical';
      const result = tryParse(
        entry.raw,
        entry.positions,
        layoutAlgo,
        (progress) => set({ parseProgress: progress }),
      );
      if (!result.ok) {
        set({ input: entry.raw, nodes: [], edges: [], start: '', error: result.error, issues: result.issues, edgeControlPoints: {}, layoutAlgorithm: layoutAlgo, isLoading: false, parseProgress: null });
      } else {
        const storedEdgeData = entry.edgeData ?? {};
        const edgeControlPoints: Record<string, XYPosition> = {};
        const restoredEdges = result.edges.map((edge, _, allEdges) => {
          const sameDirection = allEdges.filter(e => e.source === edge.source && e.target === edge.target);
          const idx = sameDirection.indexOf(edge);
          const key = `${edge.source}>${edge.target}>${idx}`;
          const data = storedEdgeData[key];
          if (data?.controlPoint) edgeControlPoints[edge.id] = data.controlPoint;
          return {
            ...edge,
            ...(data?.sourceHandle != null ? { sourceHandle: data.sourceHandle } : {}),
            ...(data?.targetHandle != null ? { targetHandle: data.targetHandle } : {}),
          };
        });
        set({
          input: entry.raw,
          nodes: result.nodes,
          edges: restoredEdges,
          start: result.startName,
          error: null,
          issues: [],
          edgeControlPoints,
          layoutAlgorithm: layoutAlgo,
          isLoading: false,
          parseProgress: null,
        });
      }
      useLibraryStore.getState().setActive(id);
    },

    resetLayout: () => {
      const { nodes, edges, start, layoutAlgorithm } = get();
      const laidOut = applyLayout(nodes, edges, layoutAlgorithm) as StateNode[];
      set({ nodes: laidOut });
      const { activeId } = useLibraryStore.getState();
      if (activeId) useLibraryStore.getState().updateEntry(activeId, { positions: {} });
      if (renderTimer) clearTimeout(renderTimer);
      const newInput = JSON.stringify(serializeToJSM(laidOut, edges, start), null, 2);
      set({ input: newInput });
    },

    newJSM: () => {
      if (renderTimer) clearTimeout(renderTimer);
      if (positionTimer) clearTimeout(positionTimer);
      if (cpTimer) clearTimeout(cpTimer);
      set({ input: '', nodes: [], edges: [], start: '', error: null, issues: [], selectedNodeId: null, selectedEdgeId: null, edgeControlPoints: {}, layoutAlgorithm: 'hierarchical' });
      useLibraryStore.getState().setActive(null);
    },

    setLayoutAlgorithm: (type) => {
      const { nodes, edges, start } = get();
      const laidOut = applyLayout(nodes, edges, type) as StateNode[];
      set({ layoutAlgorithm: type, nodes: laidOut, edgeControlPoints: {} });
      const { activeId } = useLibraryStore.getState();
      if (activeId) {
        useLibraryStore.getState().updateEntry(activeId, {
          positions: extractPositions(laidOut),
          edgeData: {},
          layoutAlgorithm: type,
        });
      }
      const newInput = JSON.stringify(serializeToJSM(laidOut, edges, start), null, 2);
      set({ input: newInput });
    },

    addNode: (position) => {
      const { nodes, edges, start } = get();
      const existingIds = new Set(nodes.map(n => n.id));
      const id = uniqueName('New State', existingIds);
      const newNode: StateNode = {
        id,
        type: 'stateNode',
        position,
        data: { label: id, entryActions: [] },
      };
      const newNodes = [...nodes, newNode];
      const newStart = nodes.length === 0 ? id : start;
      applyCanvasEdit(newNodes, edges, newStart);
    },

    deleteNodes: (ids) => {
      const { nodes, edges, start } = get();
      const idSet = new Set(ids);
      const newNodes = nodes.filter(n => {
        if (idSet.has(n.id)) return false;
        return !ids.some(deletedId => n.id.startsWith(`${deletedId}.`));
      });
      const survivingIds = new Set(newNodes.map(n => n.id));
      const newEdges = edges.filter(
        e => survivingIds.has(e.source) && survivingIds.has(e.target),
      );
      const newStart = survivingIds.has(start)
        ? start
        : (newNodes[0]?.id ?? '');
      set({ selectedNodeId: null });
      applyCanvasEdit(newNodes, newEdges, newStart);
    },

    renameNode: (id, newLocalName) => {
      const { nodes, edges, start } = get();
      const parentId = id.lastIndexOf('.') === -1 ? null : id.slice(0, id.lastIndexOf('.'));
      const newId = parentId ? `${parentId}.${newLocalName}` : newLocalName;
      if (newId === id || nodes.some(n => n.id === newId)) return;

      const rekey = (nodeId: string) => {
        if (nodeId === id) return newId;
        if (nodeId.startsWith(`${id}.`)) return newId + nodeId.slice(id.length);
        return nodeId;
      };

      const newNodes = nodes.map(n => {
        const rekeyed = rekey(n.id);
        if (rekeyed === n.id) return n;
        return { ...n, id: rekeyed, data: { ...n.data, label: rekeyed } };
      });

      const newEdges = edges.map(e => ({
        ...e,
        source: rekey(e.source),
        target: rekey(e.target),
      }));

      const newStart = rekey(start);
      set({ selectedNodeId: newId });
      applyCanvasEdit(newNodes, newEdges, newStart);
    },

    updateEntryActions: (nodeId, actions) => {
      const { nodes, edges, start } = get();
      const newNodes = nodes.map(n =>
        n.id === nodeId
          ? ({ ...n, data: { ...n.data, entryActions: actions } } as StateNode)
          : n,
      );
      // Event edges are derived from entry actions, so rebuild this node's event edges
      const allNodeIds = new Set(newNodes.map(n => n.id));
      const newEdges = [
        ...edges.filter(e => !(e.source === nodeId && isEventEdge(e))),
        ...buildEventEdges(nodeId, actions, allNodeIds),
      ];
      applyCanvasEdit(newNodes, newEdges, start);
    },

    connectNodes: (connection) => {
      const { edges } = get();
      if (!connection.source || !connection.target) return;
      const id = crypto.randomUUID();
      const newEdge: Edge = {
        id,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        label: '',
      };
      const newEdges = [...edges, newEdge];
      set({ pendingLabelEdgeId: id, selectedEdgeId: id, selectedNodeId: null });
      const { nodes, start } = get();
      applyCanvasEdit(nodes, newEdges, start);
    },

    updateEdgeLabel: (edgeId, label) => {
      const { nodes, edges, start } = get();
      // An event transition must keep a non-empty event name
      const target = edges.find(e => e.id === edgeId);
      if (target && isEventEdge(target) && !label.trim()) return;
      const newEdges = edges.map(e => (e.id === edgeId ? { ...e, label } : e));
      applyCanvasEdit(nodes, newEdges, start);
    },

    deleteEdges: (ids) => {
      const { nodes, edges, start, edgeControlPoints } = get();
      const idSet = new Set(ids);
      const newEdges = edges.filter(e => !idSet.has(e.id));
      const newCPs = { ...edgeControlPoints };
      ids.forEach(id => delete newCPs[id]);
      set({ selectedEdgeId: null, edgeControlPoints: newCPs });
      applyCanvasEdit(nodes, newEdges, start);
    },

    setEdgeControlPoint: (edgeId, point) => {
      set(state => {
        const cp = { ...state.edgeControlPoints };
        if (point === null) delete cp[edgeId];
        else cp[edgeId] = point;
        return { edgeControlPoints: cp };
      });
      if (cpTimer) clearTimeout(cpTimer);
      cpTimer = setTimeout(() => {
        const lib = useLibraryStore.getState();
        if (!lib.activeId) return;
        const state = get();
        lib.updateEntry(lib.activeId, { edgeData: buildEdgeData(state.edges, state.edgeControlPoints) });
      }, 300);
    },

    updateEdgeHandle: (edgeId, sourceHandle, targetHandle) => {
      const { nodes, edges, start } = get();
      const newEdges = edges.map(e => {
        if (e.id !== edgeId) return e;
        const updated = { ...e };
        if (sourceHandle !== undefined) updated.sourceHandle = sourceHandle;
        if (targetHandle !== undefined) updated.targetHandle = targetHandle;
        return updated;
      });
      applyCanvasEdit(nodes, newEdges, start);
    },

    clearPendingLabel: () => set({ pendingLabelEdgeId: null }),

    selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

    onNodesChange: (changes) => {
      const removed = changes.filter(c => c.type === 'remove').map(c => c.id);
      if (removed.length > 0) {
        get().deleteNodes(removed);
        return;
      }
      set(state => ({
        nodes: applyNodeChanges(changes, state.nodes) as StateNode[],
      }));
      if (positionTimer) clearTimeout(positionTimer);
      positionTimer = setTimeout(() => {
        const { activeId } = useLibraryStore.getState();
        if (!activeId) return;
        useLibraryStore.getState().updateEntry(activeId, {
          positions: extractPositions(get().nodes),
        });
      }, 300);
    },

    onEdgesChange: (changes) => {
      const removed = changes.filter(c => c.type === 'remove').map(c => c.id);
      if (removed.length > 0) {
        get().deleteEdges(removed);
        return;
      }
      set(state => ({ edges: applyEdgeChanges(changes, state.edges) }));
    },
  };
});
