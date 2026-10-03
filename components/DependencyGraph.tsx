'use client'

import React, { useMemo, useCallback } from 'react'
import ReactFlow, {
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'

export type DependencyGraphProps = {
  files: Array<{
    path: string
    kind: 'component' | 'route' | 'util' | 'config' | 'other'
  }>
  edges: Array<{
    from: string
    to: string | null
    type: 'import' | 'dynamic' | 'unresolved'
  }>
  onSelectFile?: (filePath: string) => void
  selectedFile?: string | null
  layout?: 'hierarchical' | 'force-directed'
}

const NODE_WIDTH = 150
const NODE_HEIGHT = 40

function getColorByKind(kind: string): string {
  const colors: Record<string, string> = {
    route: '#3b82f6',     // blue
    component: '#a855f7', // purple
    util: '#6b7280',      // gray
    config: '#f97316',    // orange
    other: '#9ca3af',     // light gray
  }
  return colors[kind] ?? colors['other'] ?? '#9ca3af'
}

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })
  g.setDefaultEdgeLabel(() => ({}))

  nodes.forEach(node => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })

  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  return nodes.map(node => {
    const pos = g.node(node.id)
    // pos may be undefined if the node has no edges (isolated)
    if (!pos) {
      return node
    }
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    }
  })
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  files,
  edges,
  onSelectFile,
  selectedFile,
}) => {
  // Build a set of neighbors (files that selectedFile imports or is imported by)
  const neighborSet = useMemo<Set<string>>(() => {
    if (!selectedFile) return new Set()
    const neighbors = new Set<string>()
    for (const edge of edges) {
      if (edge.from === selectedFile && edge.to) {
        neighbors.add(edge.to)
      }
      if (edge.to === selectedFile && edge.from) {
        neighbors.add(edge.from)
      }
    }
    return neighbors
  }, [edges, selectedFile])

  // Build set of selected edge ids (edges touching selectedFile)
  const selectedEdgeIds = useMemo<Set<string>>(() => {
    if (!selectedFile) return new Set()
    const ids = new Set<string>()
    for (const edge of edges) {
      if (edge.from === selectedFile || edge.to === selectedFile) {
        ids.add(`${edge.from}-${edge.to}`)
      }
    }
    return ids
  }, [edges, selectedFile])

  // Convert files to React Flow nodes
  const initialNodes: Node[] = useMemo(() => {
    return files.map(file => ({
      id: file.path,
      data: { label: file.path.split('/').pop() ?? file.path },
      position: { x: 0, y: 0 }, // overwritten by Dagre
      style: {
        background: getColorByKind(file.kind),
        color: '#fff',
        fontSize: '12px',
        fontFamily: 'monospace',
        padding: '8px',
        borderRadius: '4px',
        border: file.path === selectedFile ? '2px solid #fff' : '2px solid transparent',
        opacity: selectedFile && file.path !== selectedFile && !neighborSet.has(file.path) ? 0.45 : 1,
        cursor: 'pointer',
      },
    }))
  }, [files, selectedFile, neighborSet])

  // Convert edges to React Flow edges
  const initialEdges: Edge[] = useMemo(() => {
    return edges
      .filter((e): e is typeof edges[number] & { to: string } => e.type !== 'unresolved' && e.to !== null)
      .map(edge => {
        let strokeColor: string
        if (edge.from === selectedFile) {
          // outgoing from selected: green
          strokeColor = '#22c55e'
        } else if (edge.to === selectedFile) {
          // incoming to selected: amber
          strokeColor = '#eab308'
        } else {
          strokeColor = '#999'
        }

        const edgeId = `${edge.from}-${edge.to}`
        const isActive = selectedEdgeIds.has(edgeId)

        return {
          id: edgeId,
          source: edge.from,
          target: edge.to,
          style: {
            stroke: strokeColor,
            strokeWidth: isActive ? 2 : 1,
            opacity: selectedFile && !isActive ? 0.25 : 1,
          },
        }
      })
  }, [edges, selectedFile, selectedEdgeIds])

  // Apply Dagre layout (memoized — recompute only when files/edges change)
  const layoutedNodes = useMemo(() => {
    return applyDagreLayout(initialNodes, initialEdges)
  }, [initialNodes, initialEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Keep nodes and edges in sync when props change
  React.useEffect(() => {
    setNodes(layoutedNodes)
  }, [layoutedNodes, setNodes])

  React.useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectFile?.(node.id)
    },
    [onSelectFile],
  )

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange as OnEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={4}
        attributionPosition="bottom-right"
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <MiniMap
          nodeColor={node => {
            const file = files.find(f => f.path === node.id)
            return file ? getColorByKind(file.kind) : '#9ca3af'
          }}
          maskColor="rgba(0,0,0,0.4)"
          style={{ background: '#1a1a1a' }}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
