'use client';
import { Fragment } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StateNode } from '@/lib/jsm/parse';
import { isEventAction } from '@/lib/jsm/schema';

const handleStyle = { width: 8, height: 8 };

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

export function StateNode({ data, selected }: NodeProps<StateNode>) {
  const entryActions = data.entryActions ?? [];
  const hasActions = entryActions.length > 0;
  const eventCount = entryActions.filter(isEventAction).length;
  const actionCount = entryActions.length - eventCount;

  return (
    <div className="relative">
      <div
        className={`px-4 py-2.5 rounded-lg border-2 bg-white shadow-sm min-w-[160px] text-center transition-colors ${
          selected ? 'border-blue-500 shadow-blue-100' : 'border-zinc-300 hover:border-zinc-400'
        }`}
      >
        {SIDES.map(pos => (
          <Fragment key={pos}>
            <Handle id={`${pos}-s`} type="source" position={pos} style={handleStyle} />
            <Handle id={`${pos}-t`} type="target" position={pos} style={handleStyle} />
          </Fragment>
        ))}
        <span className="text-sm font-medium text-zinc-800 select-none">{data.label}</span>
        {hasActions && (
          <div className="mt-1 flex justify-center gap-1 text-[10px] font-medium select-none">
            {actionCount > 0 && (
              <span
                className="rounded bg-emerald-50 px-1.5 py-px text-emerald-700"
                title={`${actionCount} action${actionCount > 1 ? 's' : ''}`}
              >
                ⚙ {actionCount}
              </span>
            )}
            {eventCount > 0 && (
              <span
                className="rounded bg-violet-50 px-1.5 py-px text-violet-700"
                title={`${eventCount} event${eventCount > 1 ? 's' : ''}`}
              >
                ⚡ {eventCount}
              </span>
            )}
          </div>
        )}
      </div>

      {selected && hasActions && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-zinc-200 rounded-lg shadow-lg p-3 whitespace-nowrap text-xs z-50 pointer-events-none min-w-max">
          <div className="text-zinc-500 font-medium mb-2">Entry Actions:</div>
          <div className="space-y-2">
            {entryActions.map((action, i) => (
              <div key={i} className="text-zinc-700">
                {action.check && <div className="text-blue-600">if {action.check}</div>}
                {isEventAction(action) ? (
                  <>
                    <div className="text-violet-600">
                      {action.check ? 'then ' : ''}on ⚡ {action.event}
                    </div>
                    {action.schema && (
                      <div className="text-zinc-500 pl-3">
                        schema <span className="font-mono">{action.schema}</span>
                      </div>
                    )}
                    {action.goTo && <div className="text-zinc-500 pl-3">→ go to {action.goTo}</div>}
                  </>
                ) : (
                  <div className="text-green-600">
                    {action.check ? 'then ' : ''}{action.action}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
