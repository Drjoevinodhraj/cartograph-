/**
 * __tests__/graph.test.ts
 *
 * Unit tests for graph calculation functions.
 * Pure functions over edge lists with hardcoded test data.
 */

import {
  calculateFanIn,
  calculateFanOut,
  calculateBlastRadius,
  findCycles
} from '@/lib/graph';
import type { Edge } from '@/lib/parser';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Helper to create edge arrays for testing.
 * Reduces boilerplate by providing sensible defaults.
 */
function edge(from: string, to: string | null, type: 'import' | 'dynamic' | 'unresolved' = 'import'): Edge {
  return { from, to, type };
}

// ---------------------------------------------------------------------------
// calculateFanIn Tests
// ---------------------------------------------------------------------------

describe('calculateFanIn', () => {
  it('returns empty array for empty edges', () => {
    const edges: Edge[] = [];
    expect(calculateFanIn('foo.ts', edges)).toEqual([]);
  });

  it('returns empty array when file has no importers', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'd.ts')
    ];
    expect(calculateFanIn('z.ts', edges)).toEqual([]);
  });

  it('returns single importer', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts')
    ];
    expect(calculateFanIn('b.ts', edges)).toEqual(['a.ts']);
  });

  it('returns multiple importers in order', () => {
    const edges: Edge[] = [
      edge('a.ts', 'target.ts'),
      edge('b.ts', 'target.ts'),
      edge('c.ts', 'target.ts')
    ];
    const result = calculateFanIn('target.ts', edges);
    expect(result).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('skips unresolved edges (to: null)', () => {
    const edges: Edge[] = [
      edge('a.ts', 'target.ts'),
      edge('b.ts', null),
      edge('c.ts', 'target.ts')
    ];
    const result = calculateFanIn('target.ts', edges);
    expect(result).toEqual(['a.ts', 'c.ts']);
  });

  it('includes self-imports in fan-in', () => {
    const edges: Edge[] = [
      edge('a.ts', 'a.ts'),
      edge('b.ts', 'a.ts')
    ];
    const result = calculateFanIn('a.ts', edges);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
  });

  it('preserves order of edges', () => {
    const edges: Edge[] = [
      edge('z.ts', 'target.ts'),
      edge('a.ts', 'target.ts'),
      edge('m.ts', 'target.ts')
    ];
    const result = calculateFanIn('target.ts', edges);
    expect(result).toEqual(['z.ts', 'a.ts', 'm.ts']);
  });

  it('handles multiple imports from same file', () => {
    const edges: Edge[] = [
      edge('a.ts', 'target.ts'),
      edge('a.ts', 'target.ts')
    ];
    const result = calculateFanIn('target.ts', edges);
    expect(result).toEqual(['a.ts', 'a.ts']);
  });
});

// ---------------------------------------------------------------------------
// calculateFanOut Tests
// ---------------------------------------------------------------------------

describe('calculateFanOut', () => {
  it('returns empty array for empty edges', () => {
    const edges: Edge[] = [];
    expect(calculateFanOut('foo.ts', edges)).toEqual([]);
  });

  it('returns empty array when file imports nothing', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'd.ts')
    ];
    expect(calculateFanOut('z.ts', edges)).toEqual([]);
  });

  it('returns single import', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts')
    ];
    expect(calculateFanOut('a.ts', edges)).toEqual(['b.ts']);
  });

  it('returns multiple imports in order', () => {
    const edges: Edge[] = [
      edge('source.ts', 'dep-a.ts'),
      edge('source.ts', 'dep-b.ts'),
      edge('source.ts', 'dep-c.ts')
    ];
    const result = calculateFanOut('source.ts', edges);
    expect(result).toEqual(['dep-a.ts', 'dep-b.ts', 'dep-c.ts']);
  });

  it('skips unresolved imports (to: null)', () => {
    const edges: Edge[] = [
      edge('source.ts', 'dep-a.ts'),
      edge('source.ts', null, 'unresolved'),
      edge('source.ts', 'dep-b.ts')
    ];
    const result = calculateFanOut('source.ts', edges);
    expect(result).toEqual(['dep-a.ts', 'dep-b.ts']);
  });

  it('includes self-imports in fan-out', () => {
    const edges: Edge[] = [
      edge('a.ts', 'a.ts'),
      edge('a.ts', 'b.ts')
    ];
    const result = calculateFanOut('a.ts', edges);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
  });

  it('does not deduplicate edges (preserves duplicates)', () => {
    const edges: Edge[] = [
      edge('source.ts', 'dep.ts'),
      edge('source.ts', 'dep.ts')
    ];
    const result = calculateFanOut('source.ts', edges);
    expect(result).toEqual(['dep.ts', 'dep.ts']);
  });

  it('distinguishes fan-out from fan-in', () => {
    const edges: Edge[] = [
      edge('a.ts', 'shared.ts'),
      edge('b.ts', 'shared.ts'),
      edge('c.ts', 'shared.ts')
    ];
    expect(calculateFanOut('a.ts', edges)).toEqual(['shared.ts']);
    expect(calculateFanOut('b.ts', edges)).toEqual(['shared.ts']);
  });
});

// ---------------------------------------------------------------------------
// calculateBlastRadius Tests
// ---------------------------------------------------------------------------

describe('calculateBlastRadius', () => {
  it('returns empty set for empty edges', () => {
    const edges: Edge[] = [];
    const result = calculateBlastRadius('a.ts', edges);
    expect(result).toEqual(new Set());
  });

  it('returns empty set when file is not imported by anything', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'd.ts')
    ];
    const result = calculateBlastRadius('a.ts', edges);
    expect(result).toEqual(new Set());
  });

  it('returns direct importers (depth 1)', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['a.ts']));
  });

  it('returns transitive dependencies (depth 2)', () => {
    // C imports A, A imports B => blastRadius(B) = {A, C}
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'a.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['a.ts', 'c.ts']));
  });

  it('returns deep transitive chain (depth 3)', () => {
    // D imports C, C imports A, A imports B => blastRadius(B) = {A, C, D}
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'a.ts'),
      edge('d.ts', 'c.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['a.ts', 'c.ts', 'd.ts']));
  });

  it('handles cycles without infinite loop', () => {
    // A imports B, B imports A => visited tracking prevents infinite loop
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['a.ts', 'b.ts']));
  });

  it('handles multiple importers at same level', () => {
    // A imports B, C imports B, D imports A => blastRadius(B) = {A, C, D}
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'b.ts'),
      edge('d.ts', 'a.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['a.ts', 'c.ts', 'd.ts']));
  });

  it('respects maxDepth parameter (depth 1)', () => {
    // C imports A, A imports B => with maxDepth=1, should only get {A}
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'a.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges, 1);
    expect(result).toEqual(new Set(['a.ts']));
  });

  it('respects maxDepth parameter (depth 2)', () => {
    // D imports C, C imports A, A imports B => with maxDepth=2, should get {A, C}
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'a.ts'),
      edge('d.ts', 'c.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges, 2);
    expect(result).toEqual(new Set(['a.ts', 'c.ts']));
  });

  it('defaults to unlimited depth', () => {
    // Very deep chain without maxDepth
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'a.ts'),
      edge('d.ts', 'c.ts'),
      edge('e.ts', 'd.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['a.ts', 'c.ts', 'd.ts', 'e.ts']));
  });

  it('skips unresolved imports (to: null)', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', null),
      edge('c.ts', 'a.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['a.ts', 'c.ts']));
  });

  it('handles self-imports in cycle detection', () => {
    // A imports A, B imports A => blastRadius(A) includes both A and B
    const edges: Edge[] = [
      edge('a.ts', 'a.ts'),
      edge('b.ts', 'a.ts')
    ];
    const result = calculateBlastRadius('a.ts', edges);
    expect(result).toEqual(new Set(['b.ts', 'a.ts']));
  });

  it('handles complex graph with multiple branches', () => {
    // Diamond dependency: C and D both import A, B imports both C and D
    // So blastRadius(A) = {C, D, B}
    const edges: Edge[] = [
      edge('c.ts', 'a.ts'),
      edge('d.ts', 'a.ts'),
      edge('b.ts', 'c.ts'),
      edge('b.ts', 'd.ts')
    ];
    const result = calculateBlastRadius('a.ts', edges);
    expect(result).toEqual(new Set(['c.ts', 'd.ts', 'b.ts']));
  });

  it('returns Set type', () => {
    const edges: Edge[] = [edge('a.ts', 'b.ts')];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toBeInstanceOf(Set);
  });

  it('blast radius grows with depth of import chain', () => {
    // F5 -> F4 -> F3 -> F2 -> F1 -> F0
    // blastRadius(F0) starting from end should find all
    const edges: Edge[] = [
      edge('f1.ts', 'f0.ts'),
      edge('f2.ts', 'f1.ts'),
      edge('f3.ts', 'f2.ts'),
      edge('f4.ts', 'f3.ts'),
      edge('f5.ts', 'f4.ts')
    ];
    const result = calculateBlastRadius('f0.ts', edges);
    expect(result).toEqual(new Set(['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts']));
  });

  it('respects maxDepth with value 0 (direct importers only)', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges, 0);
    expect(result).toEqual(new Set(['a.ts']));
  });

  it('calculates blast radius for middle node in chain', () => {
    // D -> C -> B -> A
    // blastRadius(B) = {C, D}
    const edges: Edge[] = [
      edge('b.ts', 'a.ts'),
      edge('c.ts', 'b.ts'),
      edge('d.ts', 'c.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result).toEqual(new Set(['c.ts', 'd.ts']));
  });
});

// ---------------------------------------------------------------------------
// findCycles Tests
// ---------------------------------------------------------------------------

describe('findCycles', () => {
  it('returns empty array for empty edges', () => {
    const edges: Edge[] = [];
    const result = findCycles(edges);
    expect(result).toEqual([]);
  });

  it('returns empty array when no cycles exist', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'c.ts'),
      edge('c.ts', 'd.ts')
    ];
    const result = findCycles(edges);
    expect(result).toEqual([]);
  });

  it('detects simple two-node cycle', () => {
    // A imports B, B imports A
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    const cycle = result[0];
    expect(cycle.length).toBe(2);
    expect(new Set(cycle)).toEqual(new Set(['a.ts', 'b.ts']));
  });

  it('detects self-import cycle', () => {
    const edges: Edge[] = [
      edge('a.ts', 'a.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(['a.ts']);
  });

  it('detects three-node cycle', () => {
    // A imports B, B imports C, C imports A
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'c.ts'),
      edge('c.ts', 'a.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    const cycle = result[0];
    expect(cycle.length).toBe(3);
    expect(new Set(cycle)).toEqual(new Set(['a.ts', 'b.ts', 'c.ts']));
  });

  it('detects multiple independent cycles', () => {
    // Cycle 1: A ↔ B
    // Cycle 2: C ↔ D
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts'),
      edge('c.ts', 'd.ts'),
      edge('d.ts', 'c.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(2);
  });

  it('does not report duplicate cycles', () => {
    // A imports B, B imports A (simple cycle)
    // Both paths should report same cycle once
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts'),
      edge('a.ts', 'b.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
  });

  it('handles longer cycles (4+ nodes)', () => {
    // A → B → C → D → A
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'c.ts'),
      edge('c.ts', 'd.ts'),
      edge('d.ts', 'a.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    expect(result[0].length).toBe(4);
  });

  it('skips unresolved edges (to: null) in cycle detection', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', null),
      edge('b.ts', 'a.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    expect(new Set(result[0])).toEqual(new Set(['a.ts', 'b.ts']));
  });

  it('normalizes cycle representation (starts with smallest node)', () => {
    // A → B → A can be represented as [A, B] or [B, A]
    // Should normalize to start with the smallest alphabetically
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('a.ts');
  });

  it('handles complex graph with cycles and non-cycles', () => {
    // Cycle: A ↔ B
    // Non-cycle paths: C → A, B → D
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts'),
      edge('c.ts', 'a.ts'),
      edge('b.ts', 'd.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    expect(new Set(result[0])).toEqual(new Set(['a.ts', 'b.ts']));
  });

  it('returns array of cycles', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts')
    ];
    const result = findCycles(edges);
    expect(Array.isArray(result)).toBe(true);
    expect(Array.isArray(result[0])).toBe(true);
  });

  it('detects multiple cycles sharing nodes', () => {
    // This creates two overlapping cycles: A↔B and B↔C
    // Both should be detected
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts'),
      edge('b.ts', 'c.ts'),
      edge('c.ts', 'b.ts')
    ];
    const result = findCycles(edges);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('handles large chain with single cycle at end', () => {
    // Linear: A → B → C → D, then D ↔ E creates cycle at end
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'c.ts'),
      edge('c.ts', 'd.ts'),
      edge('d.ts', 'e.ts'),
      edge('e.ts', 'd.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    expect(new Set(result[0])).toEqual(new Set(['d.ts', 'e.ts']));
  });

  it('detects cycles even when there is non-cyclic surrounding paths', () => {
    // Path: start -> A -> B -> A (cycle) -> C -> end
    const edges: Edge[] = [
      edge('start.ts', 'a.ts'),
      edge('a.ts', 'b.ts'),
      edge('b.ts', 'a.ts'),
      edge('a.ts', 'c.ts'),
      edge('c.ts', 'end.ts')
    ];
    const result = findCycles(edges);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(cycle => new Set(cycle).has('a.ts'))).toBe(true);
  });

  it('cycle nodes preserve meaningful order', () => {
    const edges: Edge[] = [
      edge('x.ts', 'y.ts'),
      edge('y.ts', 'z.ts'),
      edge('z.ts', 'x.ts')
    ];
    const result = findCycles(edges);
    expect(result).toHaveLength(1);
    const cycle = result[0];
    expect(cycle.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Edge Case Tests
// ---------------------------------------------------------------------------

describe('Graph Calculations - Edge Cases', () => {
  it('handles empty edge list consistently across all functions', () => {
    const edges: Edge[] = [];
    expect(calculateFanIn('any.ts', edges)).toEqual([]);
    expect(calculateFanOut('any.ts', edges)).toEqual([]);
    expect(calculateBlastRadius('any.ts', edges)).toEqual(new Set());
    expect(findCycles(edges)).toEqual([]);
  });

  it('handles paths with directory structure', () => {
    const edges: Edge[] = [
      edge('src/components/Button.tsx', 'src/utils/format.ts'),
      edge('src/index.ts', 'src/components/Button.tsx')
    ];
    expect(calculateFanIn('src/components/Button.tsx', edges)).toEqual(['src/index.ts']);
    expect(calculateFanOut('src/components/Button.tsx', edges)).toEqual(['src/utils/format.ts']);
  });

  it('distinguishes between different files with similar names', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('ab.ts', 'b.ts')
    ];
    const result = calculateFanIn('b.ts', edges);
    expect(result).toContain('a.ts');
    expect(result).toContain('ab.ts');
    expect(result).toHaveLength(2);
  });

  it('handles file paths with special characters (dots)', () => {
    const edges: Edge[] = [
      edge('a.test.ts', 'b.ts'),
      edge('c.config.ts', 'b.ts')
    ];
    const result = calculateFanIn('b.ts', edges);
    expect(result).toEqual(['a.test.ts', 'c.config.ts']);
  });

  it('handles moderately long dependency chains', () => {
    // Linear chain: f10 -> f9 -> ... -> f0
    const edges: Edge[] = [];
    for (let i = 0; i < 10; i++) {
      edges.push(edge(`f${i + 1}.ts`, `f${i}.ts`));
    }
    const result = calculateBlastRadius('f0.ts', edges);
    expect(result.size).toBe(10);
  });

  it('uses Set.size to verify blast radius count', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts'),
      edge('c.ts', 'a.ts'),
      edge('d.ts', 'c.ts')
    ];
    const result = calculateBlastRadius('b.ts', edges);
    expect(result.size).toBe(3);
  });

  it('different edge types (import, dynamic, unresolved) included in results', () => {
    const edges: Edge[] = [
      edge('a.ts', 'b.ts', 'import'),
      edge('c.ts', 'b.ts', 'dynamic'),
      edge('d.ts', 'external', 'unresolved')
    ];
    const result = calculateFanIn('b.ts', edges);
    expect(result).toContain('a.ts');
    expect(result).toContain('c.ts');
    expect(result).not.toContain('d.ts');
  });

  it('handles very large fan-in (many importers)', () => {
    const edges: Edge[] = [];
    for (let i = 0; i < 50; i++) {
      edges.push(edge(`file${i}.ts`, 'target.ts'));
    }
    const result = calculateFanIn('target.ts', edges);
    expect(result).toHaveLength(50);
  });

  it('handles very large fan-out (many imports)', () => {
    const edges: Edge[] = [];
    for (let i = 0; i < 50; i++) {
      edges.push(edge('source.ts', `dep${i}.ts`));
    }
    const result = calculateFanOut('source.ts', edges);
    expect(result).toHaveLength(50);
  });
});
