# Phase 4: Visualization UI — Interactive Dependency Map

## Goal
Build the frontend visualization that displays the dependency map from Phase 3 analyses. Users see folders as boxes, imports as lines, and can inspect files, their neighbors, and blast radius. The UI is a dense developer tool: small type, tight spacing, monospace paths. Color means something.

## Acceptance Criteria
1. React component that renders dependency graph with React Flow + Dagre
2. Nodes represent files, edges represent imports
3. Visual distinction: file kind (component/route/util/config) → color
4. Edge direction: incoming (green), outgoing (amber)
5. Interactive: select files, highlight neighbors, show blast radius
6. File inspection panel: show fan-in, fan-out, explanation
7. Zoom/pan the graph
8. Responsive layout
9. Dark mode support (system preference + toggle)
10. All tests passing, zero TypeScript errors

## Architecture

### Data Flow
1. User navigates to analysis detail page
2. Page fetches analysis from `GET /api/analyses/[id]` (Phase 3)
3. Parse file_list and edge_list into React Flow nodes/edges
4. Render interactive graph
5. On file select: fetch explanation from `POST /api/analyses/[id]/explain` (Phase 3)
6. Display in side panel

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Cartograph — quantwise-operational-system                    │
├────────────────────┬───────────────────────────────────────────┤
│   Controls         │                                           │
│  • Zoom controls   │          DEPENDENCY GRAPH                 │
│  • Layout toggle   │     (React Flow + Dagre)                  │
│  • Dark mode       │      (interactive, zoomable)              │
│                    │                                           │
│  File Stats:       │                                           │
│  • 87 files        │                                           │
│  • 234 edges       │                                           │
│  • Coverage: 100%  │                                           │
├────────────────────┼───────────────────────────────────────────┤
│                    │  components/Button.tsx                    │
│   FILE DETAIL      │  Kind: component                          │
│   (right panel)    │  Imports: 2 files                         │
│                    │  Imported by: 5 files                     │
│                    │  Blast radius: 8 files                    │
│                    │                                           │
│                    │  [Load Explanation]                       │
│                    │                                           │
│                    │  Neighbors:                               │
│                    │  IN: Button.stories.tsx                   │
│                    │      Dashboard.tsx                        │
│                    │  OUT: @/lib/types.ts                      │
│                    │       @/utils/format.ts                   │
└────────────────────┴───────────────────────────────────────────┘
```

### Color & Visual Design
- **File kind colors:**
  - Route (app/*/page.tsx) → Blue
  - Component → Purple
  - Util (lib/) → Gray
  - Config → Orange
- **Edge colors:**
  - Incoming (fan-in) → Green
  - Outgoing (fan-out) → Amber
- **Surfaces:** Light mode near-white, dark mode near-black
- **Text:** Monospace for file paths, small tight spacing
- **Motion:** Only on click/interaction, no ambient animation

### Components

**Main page:** `app/analyses/[id]/page.tsx` (server component, async)

**Client components:**
- `components/DependencyGraph.tsx` — React Flow canvas with nodes/edges
- `components/GraphControls.tsx` — Zoom, layout, settings
- `components/FileDetail.tsx` — Right panel with file info, explanation
- `components/QueryProvider.tsx` — Already exists (Phase 1), provides React Query

**Hooks:**
- `useAnalysis(id)` — Query/fetch the analysis
- `useGraphLayout()` — Compute node positions (Dagre)
- `useFileDetail(filePath)` — Selected file state + explanation

## Tech Decisions

**Why React Flow + Dagre?**
- React Flow handles interaction (select, zoom, pan)
- Dagre computes hierarchical layout automatically
- Trade-off: large graphs (1000+ files) may be slow

**Why color for kind and direction?**
- Kind (component/route/util) is what the file is
- Direction (in/out) is why edges matter
- Only two visual properties get color — everything else is greyscale

**Why not show all neighbors at once?**
- Cognitive overload: too many edges visible confuses the map
- Solution: on file select, highlight direct neighbors (fan-in + fan-out only)
- Users can click a neighbor to see their neighbors

**Why dense layout?**
- Developer staring at this for an hour
- Small type + tight spacing lets them see more at once
- Trade-off: must zoom in to read

## Files to Create

- `components/DependencyGraph.tsx` — React Flow + Dagre graph
- `components/GraphControls.tsx` — UI controls (zoom, layout, dark mode)
- `components/FileDetail.tsx` — Right panel with file info
- `hooks/useAnalysis.ts` — Fetch and cache analysis
- `hooks/useGraphLayout.ts` — Compute Dagre layout
- `hooks/useFileDetail.ts` — Selected file state
- `app/analyses/[id]/page.tsx` — Main page (server component)
- `__tests__/visualization.test.tsx` — Component tests

## Steps

### Step 1: Set up React Flow + Dependencies
- [ ] Install `reactflow`, `dagre`, `zustand` (for state)
- [ ] Verify imports work

### Step 2: Create DependencyGraph Component
- [ ] Receive analysis data (files, edges)
- [ ] Convert to React Flow nodes/edges format
- [ ] Apply Dagre layout (hierarchical)
- [ ] Color nodes by file kind
- [ ] Color edges by direction (green in, amber out)
- [ ] Handle click/select on nodes

### Step 3: Create GraphControls Component
- [ ] Zoom controls (in, out, fit)
- [ ] Layout toggle (hierarchical, force-directed)
- [ ] Dark mode toggle (persist to localStorage)
- [ ] File stats (count, edge count, coverage)

### Step 4: Create FileDetail Component
- [ ] Show selected file path, kind
- [ ] Calculate and show fan-in, fan-out, blast radius
- [ ] Button to load explanation (call Phase 3 explain route)
- [ ] List neighbors (imports, imported by)
- [ ] Display explanation text when loaded

### Step 5: Create Hooks
- [ ] `useAnalysis(id)` — Query analysis from Phase 3 API
- [ ] `useGraphLayout(files, edges)` — Compute Dagre layout
- [ ] `useFileDetail(filePath)` — Selected file state, explanation fetch

### Step 6: Create Main Page
- [ ] `app/analyses/[id]/page.tsx` — Server component
- [ ] Fetch analysis by ID (verify auth via Phase 1)
- [ ] Render DependencyGraph + GraphControls + FileDetail
- [ ] Layout: left controls, center graph, right detail

### Step 7: Write Comprehensive Tests
- [ ] DependencyGraph renders nodes and edges correctly
- [ ] Node colors match file kinds
- [ ] Edge colors match direction
- [ ] Clicking file updates selected state
- [ ] GraphControls zoom buttons work
- [ ] Dark mode toggle persists
- [ ] FileDetail shows correct info
- [ ] Explanation fetches on demand
- [ ] RLS verified: different user can't access

### Step 8: Build and Verify
- [ ] `pnpm build` — zero TypeScript errors
- [ ] All tests passing
- [ ] Visual inspection: graph renders, colors correct, responsive
- [ ] Dark mode works
- [ ] Zoom/pan works

## Notes

- Phase 4 focuses on displaying existing data (from Phase 3), not parsing or analysis
- No new database tables needed
- All data comes from Phase 3 API
- Explanations are cached (Phase 3), frontend just fetches them
- Large graphs (1000+ files) will be slow — acceptable for v1, optimize in later phases
- Accessibility: ensure keyboard navigation works (React Flow supports it)

## Success Criteria Verification

Before marking Phase 4 done:
- [ ] Analyze a real repo (e.g., the quantwise project user mentioned)
- [ ] View the dependency graph — files visible, edges correct
- [ ] Select a file — detail panel shows neighbors
- [ ] Click "Load Explanation" — fetches and displays explanation
- [ ] Zoom and pan work smoothly
- [ ] Dark mode toggle works
- [ ] RLS verified: sign in as different user, can't see other org's analysis
- [ ] All tests pass
- [ ] Build succeeds with zero errors

## QA Focus Areas (for QA engineers)

- **Edge cases:** Empty repo (0 files), single file, very large repo (1000+ files)
- **Interaction:** Select, deselect, rapid clicking, hover effects
- **Accessibility:** Keyboard navigation, screen reader friendly
- **Responsive:** Mobile viewport (graph should be readable)
- **Dark mode:** All colors readable in both modes
- **Error handling:** Analysis not found, explanation fails to load
- **RLS security:** Can't access other organization's analysis

## Code Analyzer Focus (architecture review)

- Verify React Flow integration follows best practices
- Check Dagre layout computation doesn't block UI
- Verify color scheme matches CLAUDE.md design rules
- Check TypeScript types are strict (no `any`)
- Verify data flow (API → hooks → components)
- Ensure no unnecessary re-renders (memoization where needed)
