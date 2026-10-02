/**
 * lib/graph/walk.ts
 *
 * Pure functions for graph calculations over file dependencies.
 * No side effects, no I/O, no database.
 */

import type { Edge } from '../parser/index';

/**
 * Returns all files that import this file (direct imports only).
 * Example: if A imports B, fanIn(B) = [A]
 *
 * @param filePath - The file to analyze (relative path)
 * @param edges - List of edges from the parser
 * @returns Array of files that import this file
 */
export function calculateFanIn(filePath: string, edges: Edge[]): string[] {
  return edges
    .filter(edge => edge.to === filePath)
    .map(edge => edge.from);
}

/**
 * Returns all files this file imports (direct imports only).
 * Example: if A imports B, fanOut(A) = [B]
 *
 * @param filePath - The file to analyze (relative path)
 * @param edges - List of edges from the parser
 * @returns Array of files this file imports (excludes unresolved imports)
 */
export function calculateFanOut(filePath: string, edges: Edge[]): string[] {
  return edges
    .filter(edge => edge.from === filePath && edge.to !== null)
    .map(edge => edge.to as string);
}

/**
 * Returns all files that could be affected if this file changes.
 * Walks the dependency graph recursively: what imports this file, and what imports those, etc.
 * Includes transitive dependencies up to maxDepth (default: Infinity).
 * Example: if A imports B, C imports A, blastRadius(B) = {A, C}
 *
 * @param filePath - The file to analyze (relative path)
 * @param edges - List of edges from the parser
 * @param maxDepth - Maximum depth to traverse (default: Infinity)
 * @returns Set of all files affected by changes to this file
 */
export function calculateBlastRadius(
  filePath: string,
  edges: Edge[],
  maxDepth: number = Infinity
): Set<string> {
  const affected = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [
    { file: filePath, depth: 0 }
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;

    if (visited.has(file)) continue;
    visited.add(file);

    // Get files that import this file
    const importers = calculateFanIn(file, edges);

    for (const importer of importers) {
      if (!affected.has(importer)) {
        affected.add(importer);
      }

      // Continue traversal if within depth limit
      if (depth + 1 < maxDepth && !visited.has(importer)) {
        queue.push({ file: importer, depth: depth + 1 });
      }
    }
  }

  return affected;
}

/**
 * Returns all dependency cycles in the graph.
 * Example: if A imports B and B imports A, returns [[A, B]]
 *
 * @param edges - List of edges from the parser
 * @returns Array of cycles, where each cycle is an array of file paths
 */
export function findCycles(edges: Edge[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  // Build adjacency list, filtering out null edges
  const graph = new Map<string, string[]>();
  const allNodes = new Set<string>();

  for (const edge of edges) {
    if (edge.to === null) continue;

    allNodes.add(edge.from);
    allNodes.add(edge.to);

    if (!graph.has(edge.from)) {
      graph.set(edge.from, []);
    }
    graph.get(edge.from)!.push(edge.to);
  }

  // DFS to detect cycles
  const dfs = (
    node: string,
    path: string[]
  ): void => {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];

    for (const neighbor of neighbors) {
      if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);

        // Normalize cycle (start with smallest element) to avoid duplicates
        const minElement = [...cycle].sort()[0];
        const minIndex = cycle.indexOf(minElement);
        const normalized = cycle.slice(minIndex).concat(cycle.slice(0, minIndex));

        // Check if we already have this cycle
        const cycleStr = normalized.join('->');
        const hasCycle = cycles.some(c => c.join('->') === cycleStr);

        if (!hasCycle) {
          cycles.push(normalized);
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      }
    }

    recursionStack.delete(node);
  };

  // Run DFS from all nodes
  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}
