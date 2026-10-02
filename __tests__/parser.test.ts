/**
 * __tests__/parser.test.ts
 *
 * Unit tests for the Cartograph parser.
 * Uses the fixture repo at __tests__/fixtures/sample-repo/ as a controlled
 * source of truth so every assertion is against known content.
 */

import { parseRepository } from '@/lib/parser';
import { loadPathAliases, resolveImport, detectBarrel } from '@/lib/parser/resolve';
import { join } from 'path';

// Absolute path to the small fixture repo bundled with these tests
const FIXTURE = join(__dirname, 'fixtures', 'sample-repo');

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

describe('Parser', () => {
  describe('file discovery', () => {
    it('finds .ts, .tsx, .js, .jsx files', async () => {
      const { files } = await parseRepository(FIXTURE);
      const exts = new Set(files.map((f) => f.path.split('.').pop()));
      // Our fixture has .ts and .tsx files
      expect(exts.has('ts')).toBe(true);
      expect(exts.has('tsx')).toBe(true);
    });

    it('does not include node_modules files', async () => {
      const { files } = await parseRepository(FIXTURE);
      const hasNodeModules = files.some((f) => f.path.includes('node_modules'));
      expect(hasNodeModules).toBe(false);
    });

    it('counts parsed files correctly', async () => {
      const { files, coverage } = await parseRepository(FIXTURE);
      // The fixture has 7 source files (lib/index.ts, lib/helper.ts, lib/types.ts,
      // utils/format.ts, components/Button.tsx, components/plugin.ts, components/index.ts)
      expect(files).toHaveLength(7);
      expect(coverage.parsed).toBe(7);
    });

    it('records node_modules skip in coverage', async () => {
      const { coverage } = await parseRepository(FIXTURE);
      // node_modules directory was present in the fixture and should be skipped
      expect(coverage.reasons.has('node_modules')).toBe(true);
      expect((coverage.reasons.get('node_modules') ?? 0)).toBeGreaterThan(0);
    });

    it('counts total skipped entries in coverage.skipped', async () => {
      const { coverage } = await parseRepository(FIXTURE);
      let sum = 0;
      for (const v of coverage.reasons.values()) sum += v;
      expect(coverage.skipped).toBe(sum);
    });

    it('returns files with relative paths (no leading slash)', async () => {
      const { files } = await parseRepository(FIXTURE);
      for (const file of files) {
        expect(file.path).not.toMatch(/^\//);
      }
    });

    it('assigns a language to every file', async () => {
      const { files } = await parseRepository(FIXTURE);
      const validLanguages = new Set(['ts', 'tsx', 'js', 'jsx']);
      for (const file of files) {
        expect(validLanguages.has(file.language)).toBe(true);
      }
    });

    it('assigns tsx language to .tsx files', async () => {
      const { files } = await parseRepository(FIXTURE);
      const tsx = files.find((f) => f.path.endsWith('.tsx'));
      expect(tsx).toBeDefined();
      expect(tsx!.language).toBe('tsx');
    });
  });

  // -------------------------------------------------------------------------
  // Import extraction
  // -------------------------------------------------------------------------

  describe('import extraction', () => {
    it('extracts ES static imports and creates edges', async () => {
      const { edges } = await parseRepository(FIXTURE);
      // lib/helper.ts imports from '../utils/format' (relative) and 'path' (external)
      const helperEdges = edges.filter((e) => e.from === 'lib/helper.ts');
      expect(helperEdges.length).toBeGreaterThanOrEqual(2);
    });

    it('marks external (node module) imports as unresolved with reason external', async () => {
      const { edges } = await parseRepository(FIXTURE);
      const external = edges.filter((e) => e.reason === 'external');
      expect(external.length).toBeGreaterThan(0);
      // Every external edge should have to: null
      for (const e of external) {
        expect(e.to).toBeNull();
        expect(e.type).toBe('unresolved');
      }
    });

    it('resolves relative imports to the correct target path', async () => {
      const { edges } = await parseRepository(FIXTURE);
      // lib/helper.ts imports from '../utils/format' which resolves to utils/format.ts
      const relEdge = edges.find(
        (e) => e.from === 'lib/helper.ts' && e.to === 'utils/format.ts',
      );
      expect(relEdge).toBeDefined();
      expect(relEdge!.type).toBe('import');
    });

    it('extracts CommonJS require() calls as import edges', async () => {
      const { edges } = await parseRepository(FIXTURE);
      // components/plugin.ts uses require('../utils/format')
      const pluginEdges = edges.filter((e) => e.from === 'components/plugin.ts');
      const requireEdge = pluginEdges.find((e) => e.to === 'utils/format.ts');
      expect(requireEdge).toBeDefined();
      expect(requireEdge!.type).toBe('import');
    });

    it('extracts dynamic import() calls as dynamic edges', async () => {
      const { edges } = await parseRepository(FIXTURE);
      // components/Button.tsx has import('./plugin')
      const dynamicEdge = edges.find(
        (e) => e.from === 'components/Button.tsx' && e.type === 'dynamic',
      );
      expect(dynamicEdge).toBeDefined();
      expect(dynamicEdge!.to).toBe('components/plugin.ts');
    });

    it('extracts re-export declarations as import edges', async () => {
      const { edges } = await parseRepository(FIXTURE);
      // lib/index.ts re-exports from './helper' and './types'
      const barrelEdges = edges.filter((e) => e.from === 'lib/index.ts');
      const toHelper = barrelEdges.find((e) => e.to === 'lib/helper.ts');
      const toTypes = barrelEdges.find((e) => e.to === 'lib/types.ts');
      expect(toHelper).toBeDefined();
      expect(toTypes).toBeDefined();
    });

    it('creates edges with correct structure', async () => {
      const { edges } = await parseRepository(FIXTURE);
      for (const edge of edges) {
        expect(typeof edge.from).toBe('string');
        // to is either a string path or null
        expect(edge.to === null || typeof edge.to === 'string').toBe(true);
        expect(['import', 'dynamic', 'unresolved'].includes(edge.type)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Path alias resolution
  // -------------------------------------------------------------------------

  describe('path alias resolution', () => {
    it('loadPathAliases reads @/* alias from fixture tsconfig', async () => {
      const aliases = await loadPathAliases(FIXTURE);
      expect(aliases.has('@/*')).toBe(true);
    });

    it('loadPathAliases reads ~utils/* alias from fixture tsconfig', async () => {
      const aliases = await loadPathAliases(FIXTURE);
      expect(aliases.has('~utils/*')).toBe(true);
    });

    it('loadPathAliases returns an empty map for a directory with no tsconfig', async () => {
      // Use a directory that definitely has no tsconfig
      const aliases = await loadPathAliases('/tmp');
      expect(aliases.size).toBe(0);
    });

    it('resolves @/ alias import to the correct file', async () => {
      const aliases = await loadPathAliases(FIXTURE);
      // components/Button.tsx imports '@/lib/types' — should resolve to lib/types.ts
      const importingFile = join(FIXTURE, 'components', 'Button.tsx');
      const result = await resolveImport('@/lib/types', importingFile, FIXTURE, aliases);
      expect(result.kind).toBe('resolved');
      if (result.kind === 'resolved') {
        expect(result.absPath).toContain('lib/types.ts');
      }
    });

    it('resolves relative import ./foo correctly', async () => {
      const aliases = await loadPathAliases(FIXTURE);
      const importingFile = join(FIXTURE, 'lib', 'helper.ts');
      // ../utils/format should resolve to utils/format.ts
      const result = await resolveImport('../utils/format', importingFile, FIXTURE, aliases);
      expect(result.kind).toBe('resolved');
      if (result.kind === 'resolved') {
        expect(result.absPath).toContain('utils/format.ts');
      }
    });

    it('returns external for node module specifiers', async () => {
      const aliases = await loadPathAliases(FIXTURE);
      const importingFile = join(FIXTURE, 'lib', 'helper.ts');
      const result = await resolveImport('path', importingFile, FIXTURE, aliases);
      expect(result.kind).toBe('external');
    });

    it('returns not-found for an import that does not exist', async () => {
      const aliases = await loadPathAliases(FIXTURE);
      const importingFile = join(FIXTURE, 'lib', 'helper.ts');
      const result = await resolveImport('./does-not-exist', importingFile, FIXTURE, aliases);
      expect(result.kind).toBe('not-found');
    });

    it('parseRepository resolves @/ alias edges end-to-end', async () => {
      const { edges } = await parseRepository(FIXTURE);
      // components/Button.tsx imports '@/lib/types' which should resolve
      const aliasEdge = edges.find(
        (e) => e.from === 'components/Button.tsx' && e.to === 'lib/types.ts',
      );
      expect(aliasEdge).toBeDefined();
      expect(aliasEdge!.type).toBe('import');
    });
  });

  // -------------------------------------------------------------------------
  // Barrel file detection
  // -------------------------------------------------------------------------

  describe('barrel file detection', () => {
    it('detectBarrel returns true for index.ts with only re-exports', () => {
      expect(detectBarrel('index.ts', true)).toBe(true);
    });

    it('detectBarrel returns false for index.ts with non-re-export content', () => {
      expect(detectBarrel('index.ts', false)).toBe(false);
    });

    it('detectBarrel returns false for non-index file even with only re-exports', () => {
      expect(detectBarrel('helper.ts', true)).toBe(false);
    });

    it('detectBarrel returns true for index.tsx', () => {
      expect(detectBarrel('index.tsx', true)).toBe(true);
    });

    it('detectBarrel returns true for index.js', () => {
      expect(detectBarrel('index.js', true)).toBe(true);
    });

    it('lib/index.ts is marked isBarrel: true (pure re-export barrel)', async () => {
      const { files } = await parseRepository(FIXTURE);
      const libIndex = files.find((f) => f.path === 'lib/index.ts');
      expect(libIndex).toBeDefined();
      expect(libIndex!.isBarrel).toBe(true);
    });

    it('components/index.ts is marked isBarrel: false (has non-re-export content)', async () => {
      const { files } = await parseRepository(FIXTURE);
      const componentsIndex = files.find((f) => f.path === 'components/index.ts');
      expect(componentsIndex).toBeDefined();
      expect(componentsIndex!.isBarrel).toBe(false);
    });

    it('lib/helper.ts is marked isBarrel: false (not an index file)', async () => {
      const { files } = await parseRepository(FIXTURE);
      const helper = files.find((f) => f.path === 'lib/helper.ts');
      expect(helper).toBeDefined();
      expect(helper!.isBarrel).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Coverage reporting
  // -------------------------------------------------------------------------

  describe('coverage reporting', () => {
    it('coverage.parsed equals the number of files in results', async () => {
      const { files, coverage } = await parseRepository(FIXTURE);
      expect(coverage.parsed).toBe(files.length);
    });

    it('coverage.skipped is a non-negative integer', async () => {
      const { coverage } = await parseRepository(FIXTURE);
      expect(coverage.skipped).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(coverage.skipped)).toBe(true);
    });

    it('coverage.reasons is a Map', async () => {
      const { coverage } = await parseRepository(FIXTURE);
      expect(coverage.reasons).toBeInstanceOf(Map);
    });

    it('coverage.reasons values are all positive integers', async () => {
      const { coverage } = await parseRepository(FIXTURE);
      for (const [, count] of coverage.reasons) {
        expect(count).toBeGreaterThan(0);
        expect(Number.isInteger(count)).toBe(true);
      }
    });

    it('coverage.skipped equals the sum of all reason counts', async () => {
      const { coverage } = await parseRepository(FIXTURE);
      let sum = 0;
      for (const v of coverage.reasons.values()) sum += v;
      expect(coverage.skipped).toBe(sum);
    });

    it('unsupported-lang appears when non-.ts/.js files are present', async () => {
      // The fixture has no non-TS files, so let us point at the real project root
      // which has .json, .mjs, .md, etc. files
      const { coverage } = await parseRepository(
        join(__dirname, '..'), // project root
      );
      // There should be at least some skipped files due to unsupported extensions
      expect(coverage.skipped).toBeGreaterThan(0);
    });

    it('points parseRepository at a nested dir and still returns valid coverage', async () => {
      const { coverage } = await parseRepository(join(FIXTURE, 'utils'));
      expect(coverage.parsed).toBeGreaterThan(0);
      expect(typeof coverage.skipped).toBe('number');
    });
  });
});
