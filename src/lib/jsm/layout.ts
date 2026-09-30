import { graphlib, layout } from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;

export type LayoutType = 'hierarchical' | 'grid';

export interface LayoutAlgorithm {
  name: string;
  compute(nodes: Node[], edges: Edge[]): Node[];
}

class DagreLayout implements LayoutAlgorithm {
  name = 'hierarchical';

  compute(nodes: Node[], edges: Edge[]): Node[] {
    const g = new graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 120, nodesep: 60 });

    nodes.forEach(node => {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    edges.forEach(edge => {
      if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
        g.setEdge(edge.source, edge.target);
      }
    });

    layout(g);

    return nodes.map(node => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
      };
    });
  }
}

class GridLayout implements LayoutAlgorithm {
  name = 'grid';

  compute(nodes: Node[], edges: Edge[]): Node[] {
    if (nodes.length === 0) return nodes;

    const GRID_SPACING_X = 200;
    const GRID_SPACING_Y = 120;

    const edgeMap = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, []);
      edgeMap.get(edge.source)!.push(edge.target);
    });

    // Find all connected components
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const node of nodes) {
      if (visited.has(node.id)) continue;

      const component: string[] = [];
      const queue: string[] = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        const children = edgeMap.get(current) || [];

        for (const child of children) {
          if (!visited.has(child)) {
            visited.add(child);
            queue.push(child);
          }
        }
      }

      components.push(component);
    }

    // Assign levels within each component
    const levels = new Map<string, number>();
    let maxLevelGlobal = 0;

    for (const component of components) {
      const componentStart = component[0];
      const queue: string[] = [componentStart];
      levels.set(componentStart, 0);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentLevel = levels.get(current)!;
        const children = edgeMap.get(current) || [];

        for (const child of children) {
          if (!levels.has(child)) {
            levels.set(child, currentLevel + 1);
            queue.push(child);
          }
        }
      }

      const maxLevel = Math.max(...component.map(n => levels.get(n)!));
      maxLevelGlobal = Math.max(maxLevelGlobal, maxLevel);
    }

    // Group nodes by level
    const byLevel = new Map<number, string[]>();
    for (const [nodeId, level] of levels.entries()) {
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level)!.push(nodeId);
    }

    // Position nodes in grid
    const positioned = new Map<string, { x: number; y: number }>();

    for (const [level, nodeIds] of byLevel.entries()) {
      const x = level * GRID_SPACING_X;
      const totalHeight = nodeIds.length * GRID_SPACING_Y;
      const startY = -(totalHeight / 2) + (GRID_SPACING_Y / 2);

      nodeIds.forEach((nodeId, idx) => {
        const y = startY + idx * GRID_SPACING_Y;
        positioned.set(nodeId, { x, y });
      });
    }

    // Center the layout
    const centerX = (maxLevelGlobal * GRID_SPACING_X) / 2;
    const centerY = 0;

    return nodes.map(node => {
      const pos = positioned.get(node.id) ?? { x: 0, y: 0 };
      return {
        ...node,
        position: {
          x: pos.x - centerX,
          y: pos.y - centerY,
        },
      };
    });
  }
}

const LAYOUT_ALGORITHMS: Record<LayoutType, LayoutAlgorithm> = {
  hierarchical: new DagreLayout(),
  grid: new GridLayout(),
};

export function applyLayout(nodes: Node[], edges: Edge[], type: LayoutType): Node[] {
  return LAYOUT_ALGORITHMS[type].compute(nodes, edges);
}

export function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  return applyLayout(nodes, edges, 'hierarchical');
}
