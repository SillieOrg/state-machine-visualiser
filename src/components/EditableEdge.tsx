'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useEdges,
  useReactFlow,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import { useStore } from '@/lib/store';
import type { TransitionEdgeData } from '@/lib/jsm/parse';

export type EditableEdge = Edge;

function getOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): { path: string; midX: number } {
  const CORNER_OFFSET = 40;
  const offsetX = Math.abs(targetX - sourceX) < 120 ? CORNER_OFFSET : Math.abs(targetX - sourceX) / 3;
  const midX = sourceX + (targetX > sourceX ? offsetX : -offsetX);
  const path = `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${midX},${targetY} L ${targetX},${targetY}`;
  return { path, midX };
}

export function EditableEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const isEvent = (data as Partial<TransitionEdgeData> | undefined)?.kind === 'event';
  const edgeStyle = isEvent
    ? { ...style, stroke: '#8b5cf6', strokeDasharray: '6 4' }
    : style;
  const updateEdgeLabel = useStore(s => s.updateEdgeLabel);
  const clearPendingLabel = useStore(s => s.clearPendingLabel);
  const pendingLabelEdgeId = useStore(s => s.pendingLabelEdgeId);
  const selectEdge = useStore(s => s.selectEdge);
  const storedCp = useStore(s => s.edgeControlPoints[id]);
  const setEdgeControlPoint = useStore(s => s.setEdgeControlPoint);
  const layoutAlgorithm = useStore(s => s.layoutAlgorithm);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const isPending = pendingLabelEdgeId === id;

  useLayoutEffect(() => {
    if (isPending) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setDraft(String(label ?? ''));
      setEditing(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      clearPendingLabel();
    }
  }, [isPending, label, clearPendingLabel]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const allEdges = useEdges();
  const hasReverse = allEdges.some(e => e.source === target && e.target === source);
  const OFFSET = 60;

  let edgePath: string;
  let labelX: number;
  let labelY: number;
  let cpX: number;
  let cpY: number;

  const useOrthogonal = layoutAlgorithm === 'grid' && !hasReverse;

  if (storedCp && layoutAlgorithm !== 'grid') {
    cpX = storedCp.x;
    cpY = storedCp.y;
    edgePath = `M ${sourceX},${sourceY} Q ${cpX},${cpY} ${targetX},${targetY}`;
    labelX = (sourceX + 2 * cpX + targetX) / 4;
    labelY = (sourceY + 2 * cpY + targetY) / 4;
  } else if (useOrthogonal) {
    const ortho = getOrthogonalPath(sourceX, sourceY, targetX, targetY);
    edgePath = ortho.path;
    labelX = (sourceX + ortho.midX + targetX) / 3;
    labelY = (sourceY + targetY) / 2;
    cpX = labelX;
    cpY = labelY;
  } else if (hasReverse) {
    const isCanonical = source <= target;
    const canonDx = isCanonical ? targetX - sourceX : sourceX - targetX;
    const canonDy = isCanonical ? targetY - sourceY : sourceY - targetY;
    const len = Math.sqrt(canonDx * canonDx + canonDy * canonDy) || 1;
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    const sign = isCanonical ? 1 : -1;
    cpX = midX + (-canonDy / len) * OFFSET * sign;
    cpY = midY + (canonDx / len) * OFFSET * sign;
    edgePath = `M ${sourceX},${sourceY} Q ${cpX},${cpY} ${targetX},${targetY}`;
    labelX = (sourceX + 2 * cpX + targetX) / 4;
    labelY = (sourceY + 2 * cpY + targetY) / 4;
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    cpX = labelX;
    cpY = labelY;
  }

  const showDragHandle = !!storedCp || (hasReverse && layoutAlgorithm !== 'grid');

  const commit = useCallback(() => {
    updateEdgeLabel(id, draft.trim());
    setEditing(false);
  }, [id, draft, updateEdgeLabel]);

  function startEditing() {
    setDraft(String(label ?? ''));
    setEditing(true);
    selectEdge(id);
  }

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (e.buttons !== 1) return;
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setEdgeControlPoint(id, flowPos);
    },
    [id, screenToFlowPosition, setEdgeControlPoint],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEdgeControlPoint(id, null);
    },
    [id, setEdgeControlPoint],
  );

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      {showDragHandle && (
        <circle
          cx={cpX}
          cy={cpY}
          r={4}
          fill="white"
          stroke="#94a3b8"
          strokeWidth={1.5}
          style={{ pointerEvents: 'all', cursor: 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onDoubleClick={handleDoubleClick}
        />
      )}
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          className="absolute pointer-events-all nodrag nopan"
        >
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="text-xs text-zinc-800 border border-blue-400 rounded px-1.5 py-0.5 bg-white shadow-sm outline-none w-36"
              placeholder={isEvent ? 'event…' : 'condition…'}
            />
          ) : (
            <button
              onClick={startEditing}
              className={`text-xs bg-white border rounded px-1.5 py-0.5 shadow-sm transition-colors max-w-[160px] truncate ${
                isEvent
                  ? 'border-violet-300 text-violet-700 hover:border-violet-500'
                  : 'border-zinc-200 text-zinc-800 hover:border-blue-400'
              }`}
              title={isEvent ? `Event: ${String(label ?? '')}` : label ? `Check: ${String(label)}` : 'No check — always transitions'}
            >
              {isEvent && <span aria-hidden>⚡ </span>}
              {label ? String(label) : <span className="text-zinc-400 italic">always</span>}
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
