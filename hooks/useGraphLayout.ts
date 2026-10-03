import { useMemo } from 'react';
import dagre from 'dagre';
import { Node, Edge as FlowEdge } from 'reactflow';
import type { File, Edge } from './useAnalysis';

const kindToColor = {
  route: '#3b82f6', // blue
  component: '#a855f7', // purple
  util: '#6b7280', // gray
  config: '#f97316', // orange
  other: '#9ca3af', // light gray
};

export interface GraphLayout {
  nodes: Node[];
  edges: FlowEdge[];
}

export function useGraphLayout(
  files: File[],
  edges: Edge[],
  selectedFile?: string | null,
  layout: 'hierarchical' | 'force-directed' = 'hierarchical'
): GraphLayout {
  return useMemo(() => {
    // Convert files to React Flow nodes
    const nodes: Node[] = files.map((file) => ({
      id: file.path,
      data: { label: file.path.split('/').pop() || file.path },
      position: { x: 0, y: 0 },
      style: {
        background: kindToColor[file.kind],
        color: '#fff',
        border: selectedFile === file.path ? '2px solid #000' : '1px solid #222',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'monospace',
        width: 'auto',
      },
    }));

    // Convert edges, filtering out unresolved (to === null)
    const resolvedEdges = edges.filter((e) => e.to !== null);
    const flowEdges: FlowEdge[] = resolvedEdges.map((edge) => {
      const isOutgoing = selectedFile && edge.from === selectedFile;
      const isIncoming = selectedFile && edge.to === selectedFile;

      return {
        id: `${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to!,
        style: {
          stroke: isOutgoing ? '#22c55e' : isIncoming ? '#eab308' : '#999',
          strokeWidth: isOutgoing || isIncoming ? 2 : 1,
          opacity: 0.8,
        },
        markerEnd: 'default',
      };
    });

    // Apply layout based on selection
    if (layout === 'hierarchical') {
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });
      g.setDefaultEdgeLabel(() => ({}));

      // Add all nodes to the graph
      nodes.forEach((node) => {
        g.setNode(node.id, { width: 120, height: 40 });
      });

      // Add edges to the graph
      flowEdges.forEach((edge) => {
        g.setEdge(edge.source, edge.target);
      });

      // Compute layout
      dagre.layout(g);

      // Update node positions from Dagre
      const layoutNodes = nodes.map((node) => {
        const dagreNode = g.node(node.id);
        return {
          ...node,
          position: { x: dagreNode.x - 60, y: dagreNode.y - 20 },
        };
      });

      return { nodes: layoutNodes, edges: flowEdges };
    } else {
      // Force-directed: use simple force layout (basic implementation)
      // In production, consider using force-graph or elkjs
      const centerX = 500;
      const centerY = 300;
      const radius = Math.min(centerX, centerY) * 0.8;

      const layoutNodes = nodes.map((node, idx) => {
        const angle = (idx / nodes.length) * 2 * Math.PI;
        return {
          ...node,
          position: {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          },
        };
      });

      return { nodes: layoutNodes, edges: flowEdges };
    }
  }, [files, edges, selectedFile, layout]);
}
