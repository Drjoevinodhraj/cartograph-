/**
 * __tests__/integration.test.ts
 *
 * Integration test: Parser + Adapter + Graph calculations
 * Verifies that the entire pipeline works end-to-end using the sample fixture repo.
 *
 * This test:
 * 1. Parses a real fixture repository
 * 2. Applies the Next.js adapter to identify file kinds
 * 3. Runs graph calculations (fan-in, fan-out, blast radius)
 * 4. Verifies results make sense
 */

import { parseRepository } from '@/lib/parser';
import { createNextJsAdapter } from '@/lib/parser/adapters/next';
import { calculateFanIn, calculateFanOut, calculateBlastRadius } from '@/lib/graph';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, 'fixtures/sample-repo');

describe('Integration: Parser + Adapter + Graph', () => {
  // ---------------------------------------------------------------------------
  // Test 1: Parse the sample repo end-to-end
  // ---------------------------------------------------------------------------

  describe('Parse repository end-to-end', () => {
    it('should parse the sample repo without errors', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.coverage).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it('should find all files in the sample repo', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // Should find 8 source files (excluding node_modules):
      // components/Button.tsx
      // components/index.ts
      // components/plugin.ts
      // lib/helper.ts
      // lib/index.ts
      // lib/types.ts
      // utils/format.ts
      // tsconfig.json (not a source file)
      expect(result.files.length).toBeGreaterThanOrEqual(7);
      expect(result.files.length).toBeLessThanOrEqual(8);
    });

    it('should return non-empty edge list', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // Sample repo has imports between files, so edges should not be empty
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should report coverage correctly', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      expect(result.coverage.parsed).toBeGreaterThan(0);
      expect(result.coverage.skipped).toBeGreaterThanOrEqual(0);
      expect(result.coverage.reasons).toBeInstanceOf(Map);
    });

    it('should parse files with expected paths', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      const paths = result.files.map(f => f.path);

      // Check that expected files are parsed
      expect(paths.some(p => p.includes('components') && p.includes('Button'))).toBe(true);
      expect(paths.some(p => p.includes('lib') && p.includes('helper'))).toBe(true);
      expect(paths.some(p => p.includes('utils') && p.includes('format'))).toBe(true);
    });

    it('should detect barrel files', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // lib/index.ts is a barrel (only re-exports)
      const libIndex = result.files.find(f => f.path.includes('lib') && f.path.endsWith('index.ts'));
      expect(libIndex).toBeDefined();
      expect(libIndex?.isBarrel).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Verify file kinds are identified correctly
  // ---------------------------------------------------------------------------

  describe('Verify file kinds with adapter', () => {
    it('should identify components correctly', async () => {
      const adapter = createNextJsAdapter();

      expect(adapter.identifyKind('components/Button.tsx')).toBe('component');
      expect(adapter.identifyKind('components/index.ts')).toBe('component');
      expect(adapter.identifyKind('components/plugin.ts')).toBe('component');
    });

    it('should identify utils correctly', async () => {
      const adapter = createNextJsAdapter();

      expect(adapter.identifyKind('utils/format.ts')).toBe('util');
      expect(adapter.identifyKind('lib/helper.ts')).toBe('util');
      expect(adapter.identifyKind('lib/types.ts')).toBe('util');
    });

    it('should apply adapter to parsed files', async () => {
      const result = await parseRepository(FIXTURE_DIR);
      const adapter = createNextJsAdapter();

      // Apply adapter to each file
      for (const file of result.files) {
        const kind = adapter.identifyKind(file.path);
        expect(['component', 'route', 'util', 'config', 'other']).toContain(kind);
      }
    });

    it('should identify Button as component', async () => {
      const result = await parseRepository(FIXTURE_DIR);
      const adapter = createNextJsAdapter();

      const button = result.files.find(f => f.path.includes('Button'));
      expect(button).toBeDefined();
      expect(adapter.identifyKind(button!.path)).toBe('component');
    });

    it('should identify helper as util', async () => {
      const result = await parseRepository(FIXTURE_DIR);
      const adapter = createNextJsAdapter();

      const helper = result.files.find(f => f.path.includes('helper'));
      expect(helper).toBeDefined();
      expect(adapter.identifyKind(helper!.path)).toBe('util');
    });

    it('should identify format as util', async () => {
      const result = await parseRepository(FIXTURE_DIR);
      const adapter = createNextJsAdapter();

      const format = result.files.find(f => f.path.includes('format'));
      expect(format).toBeDefined();
      expect(adapter.identifyKind(format!.path)).toBe('util');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: Verify import resolution
  // ---------------------------------------------------------------------------

  describe('Verify import resolution', () => {
    it('should resolve relative imports', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // lib/helper.ts imports ../utils/format
      const helperEdges = result.edges.filter(e => e.from.includes('helper'));
      expect(helperEdges.length).toBeGreaterThan(0);

      // Should resolve to utils/format.ts
      const formatEdge = helperEdges.find(e => e.to?.includes('format'));
      expect(formatEdge).toBeDefined();
      expect(formatEdge?.to).not.toBeNull();
    });

    it('should resolve path aliases', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // components/Button.tsx imports @/lib/types
      const buttonEdges = result.edges.filter(e => e.from.includes('Button'));
      expect(buttonEdges.length).toBeGreaterThan(0);

      // Should resolve to lib/types.ts
      const typesEdge = buttonEdges.find(e => e.to?.includes('types'));
      expect(typesEdge).toBeDefined();
      expect(typesEdge?.to).not.toBeNull();
    });

    it('should mark external imports as unresolved', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // helper.ts imports 'path' (Node.js built-in)
      const helperEdges = result.edges.filter(e => e.from.includes('helper'));

      // Should have at least one unresolved edge (for 'path')
      const unresolvedEdge = helperEdges.find(e => e.to === null && e.type === 'unresolved');
      expect(unresolvedEdge).toBeDefined();
      expect(unresolvedEdge?.reason).toBe('external');
    });

    it('should handle dynamic imports', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // components/Button.tsx has dynamic import('./plugin')
      const buttonEdges = result.edges.filter(e => e.from.includes('Button'));

      // Should have a dynamic import edge
      const dynamicEdge = buttonEdges.find(e => e.type === 'dynamic');
      expect(dynamicEdge).toBeDefined();
      expect(dynamicEdge?.to?.includes('plugin')).toBe(true);
    });

    it('should handle CommonJS require', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // components/plugin.ts uses require('../utils/format')
      const pluginEdges = result.edges.filter(e => e.from.includes('plugin'));
      expect(pluginEdges.length).toBeGreaterThan(0);

      // Should resolve to utils/format.ts
      const formatEdge = pluginEdges.find(e => e.to?.includes('format'));
      expect(formatEdge).toBeDefined();
      expect(formatEdge?.to).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4: Verify graph calculations work
  // ---------------------------------------------------------------------------

  describe('Verify graph calculations', () => {
    it('should calculate fan-in (importers)', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // utils/format.ts is imported by lib/helper.ts
      const formatPath = result.files.find(f => f.path.includes('format'))?.path;
      expect(formatPath).toBeDefined();

      const fanIn = calculateFanIn(formatPath!, result.edges);
      expect(Array.isArray(fanIn)).toBe(true);
      expect(fanIn.length).toBeGreaterThan(0);
      expect(fanIn.some(f => f.includes('helper') || f.includes('plugin'))).toBe(true);
    });

    it('should calculate fan-out (dependencies)', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // lib/helper.ts imports utils/format.ts and path
      const helperPath = result.files.find(f => f.path.includes('helper'))?.path;
      expect(helperPath).toBeDefined();

      const fanOut = calculateFanOut(helperPath!, result.edges);
      expect(Array.isArray(fanOut)).toBe(true);
      expect(fanOut.length).toBeGreaterThan(0);
      expect(fanOut.some(f => f.includes('format'))).toBe(true);
    });

    it('should calculate blast radius', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // If we change utils/format.ts, what gets affected?
      const formatPath = result.files.find(f => f.path.includes('format'))?.path;
      expect(formatPath).toBeDefined();

      const affected = calculateBlastRadius(formatPath!, result.edges);
      expect(affected).toBeInstanceOf(Set);
      expect(affected.size).toBeGreaterThanOrEqual(0);
    });

    it('should handle a central file with multiple importers', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // types.ts is imported by lib/index.ts (via re-export) and Button.tsx
      const typesPath = result.files.find(f => f.path.includes('types'))?.path;
      expect(typesPath).toBeDefined();

      const fanIn = calculateFanIn(typesPath!, result.edges);
      expect(Array.isArray(fanIn)).toBe(true);
      expect(fanIn.length).toBeGreaterThan(0);
    });

    it('should return empty results for unused files', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // A file that nobody imports and that imports nothing
      // (if such a file exists in the fixture)
      // At minimum, verify that graph functions don't error on unused files
      const unusedPath = 'lib/unused.ts';
      const fanIn = calculateFanIn(unusedPath, result.edges);
      const fanOut = calculateFanOut(unusedPath, result.edges);
      const affected = calculateBlastRadius(unusedPath, result.edges);

      expect(fanIn).toEqual([]);
      expect(fanOut).toEqual([]);
      expect(affected.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 5: End-to-end workflow
  // ---------------------------------------------------------------------------

  describe('End-to-end workflow', () => {
    it('should complete a full analysis pipeline', async () => {
      // Step 1: Parse the repo
      const result = await parseRepository(FIXTURE_DIR);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);

      // Step 2: Apply adapter to all files
      const adapter = createNextJsAdapter();
      const enrichedFiles = result.files.map(file => ({
        ...file,
        kind: adapter.identifyKind(file.path)
      }));

      expect(enrichedFiles.length).toBeGreaterThan(0);
      expect(enrichedFiles.every(f => f.kind !== undefined)).toBe(true);

      // Step 3: Pick a central file (one with fan-in > 0)
      const centralFile = enrichedFiles.find(f => {
        const fanIn = calculateFanIn(f.path, result.edges);
        return fanIn.length > 0;
      });

      expect(centralFile).toBeDefined();

      // Step 4: Calculate metrics for the central file
      const fanIn = calculateFanIn(centralFile!.path, result.edges);
      const fanOut = calculateFanOut(centralFile!.path, result.edges);
      const affected = calculateBlastRadius(centralFile!.path, result.edges);

      // Verify all calculations work without errors
      expect(Array.isArray(fanIn)).toBe(true);
      expect(Array.isArray(fanOut)).toBe(true);
      expect(affected).toBeInstanceOf(Set);

      // Results should be meaningful
      expect(fanIn.length).toBeGreaterThan(0);
    });

    it('should not throw errors on any file in the repo', async () => {
      const result = await parseRepository(FIXTURE_DIR);
      const adapter = createNextJsAdapter();

      // Try calculations on all files — should never throw
      for (const file of result.files) {
        expect(() => {
          calculateFanIn(file.path, result.edges);
          calculateFanOut(file.path, result.edges);
          calculateBlastRadius(file.path, result.edges);
          adapter.identifyKind(file.path);
        }).not.toThrow();
      }
    });

    it('should produce consistent results across multiple runs', async () => {
      const result1 = await parseRepository(FIXTURE_DIR);
      const result2 = await parseRepository(FIXTURE_DIR);

      // File count should be the same
      expect(result1.files.length).toBe(result2.files.length);

      // Edge count should be the same
      expect(result1.edges.length).toBe(result2.edges.length);

      // Pick a file and verify calculations are the same
      const testFile = result1.files[0];
      const fanIn1 = calculateFanIn(testFile.path, result1.edges).sort();
      const fanIn2 = calculateFanIn(testFile.path, result2.edges).sort();

      expect(fanIn1).toEqual(fanIn2);
    });

    it('should handle the entire graph without infinite loops', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      // Calculate metrics for all files (should complete quickly)
      let calculationCount = 0;
      for (const file of result.files) {
        calculateFanIn(file.path, result.edges);
        calculateFanOut(file.path, result.edges);
        calculateBlastRadius(file.path, result.edges);
        calculationCount++;
      }

      // All calculations should complete
      expect(calculationCount).toBe(result.files.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 6: Integration with different edge types
  // ---------------------------------------------------------------------------

  describe('Integration with edge types', () => {
    it('should include import edges in calculations', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      const importEdges = result.edges.filter(e => e.type === 'import');
      expect(importEdges.length).toBeGreaterThan(0);
    });

    it('should include dynamic edges in calculations', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      const dynamicEdges = result.edges.filter(e => e.type === 'dynamic');
      // Button.tsx has dynamic import('./plugin')
      expect(dynamicEdges.length).toBeGreaterThan(0);
    });

    it('should handle unresolved edges in calculations', async () => {
      const result = await parseRepository(FIXTURE_DIR);

      const unresolvedEdges = result.edges.filter(e => e.type === 'unresolved');
      expect(unresolvedEdges.length).toBeGreaterThan(0);

      // Unresolved edges should not affect fan-in/fan-out (they have to: null)
      const file = result.files[0];
      const fanIn = calculateFanIn(file.path, result.edges);
      // This should not include files with unresolved imports
      expect(fanIn.every(f => f !== null)).toBe(true);
    });
  });
});
