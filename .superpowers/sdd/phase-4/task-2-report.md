# Phase 4, Task 2: DependencyGraph Component

## Status: COMPLETED

## Summary

Created `components/DependencyGraph.tsx` — an interactive dependency map rendered with React Flow and laid out via Dagre. Also installed the missing `@types/dagre` dev-dependency required for zero-error TypeScript compilation.

## File Created

`/components/DependencyGraph.tsx`

## Implementation Details

### Props accepted
```typescript
DependencyGraphProps {
  files: Array<{ path: string; kind: 'component'|'route'|'util'|'config'|'other' }>
  edges: Array<{ from: string; to: string; type: 'import'|'dynamic'|'unresolved' }>
  onSelectFile?: (filePath: string) => void
  selectedFile?: string | null
}
```

### Node conversion
- Each file becomes a React Flow node with `id = file.path`
- Label shows only the filename (`path.split('/').pop()`)
- Background color set by `getColorByKind()`: route=blue, component=purple, util=gray, config=orange, other=light-gray
- Selected file gets a white border; non-neighboring nodes fade to 45% opacity

### Edge conversion
- `unresolved` edges are filtered out (not rendered)
- Outgoing edges from `selectedFile` → green (`#22c55e`)
- Incoming edges to `selectedFile` → amber (`#eab308`)
- All other edges → gray (`#999`)
- Active edges (touching selectedFile) use strokeWidth 2; others use 1
- Non-active edges fade to 25% opacity when a file is selected

### Dagre layout
- `rankdir: 'TB'` (top-to-bottom hierarchy)
- `nodesep: 60`, `ranksep: 80` for readable spacing
- Isolated nodes (no edges) keep `position: {x:0, y:0}` gracefully
- Node dimensions: 150 × 40 px; position adjusted to top-left corner for React Flow

### React Flow setup
- `fitView` with 0.2 padding auto-zooms on load
- `MiniMap` colored by file kind
- `Controls` (zoom in/out/fit) — `showInteractive=false` (no lock button noise)
- `nodesConnectable=false` (read-only graph; connections come from the parser)
- Nodes are draggable for manual rearrangement
- `useNodesState` / `useEdgesState` for interactivity; synced via `useEffect` when props change

### Performance
- `useMemo` on nodes, edges, neighborSet, selectedEdgeIds, and layouted nodes
- Dagre layout only recomputes when files or edges change
- For 1000+ nodes the layout will block the main thread once; a future task can offload to a worker

## TypeScript
- `@types/dagre@0.7.54` installed as devDependency (was missing, caused TS7016)
- Zero TypeScript errors confirmed: `tsc --noEmit` exits 0

## Checklist

- [x] Component compiles with zero TypeScript errors
- [x] Receives `files` and `edges` as typed props
- [x] Renders React Flow canvas with MiniMap and Controls
- [x] Nodes colored by kind (route/component/util/config/other)
- [x] Edges colored by direction (green=outgoing, amber=incoming, gray=neutral)
- [x] Node click fires `onSelectFile` callback via `onNodeClick`
- [x] `'use client'` directive at top of file
- [x] Strict TypeScript, no `any`
- [x] Monospace font, 12px, tight spacing per design guide
