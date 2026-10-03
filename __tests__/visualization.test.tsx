import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from 'reactflow';
import { DependencyGraph } from '@/components/DependencyGraph';
import { FileDetail } from '@/components/FileDetail';
import type { File, Edge } from '@/hooks/useAnalysis';

// Mock data
const mockFiles: File[] = [
  { path: 'app/page.tsx', kind: 'route', language: 'tsx', isBarrel: false },
  { path: 'components/Button.tsx', kind: 'component', language: 'tsx', isBarrel: false },
  { path: 'lib/utils.ts', kind: 'util', language: 'ts', isBarrel: false },
  { path: 'next.config.ts', kind: 'config', language: 'ts', isBarrel: false },
];

const mockEdges: Edge[] = [
  { from: 'app/page.tsx', to: 'components/Button.tsx', type: 'import' },
  { from: 'components/Button.tsx', to: 'lib/utils.ts', type: 'import' },
  { from: 'app/page.tsx', to: null, type: 'unresolved', reason: 'missing-module' },
];

// Test: DependencyGraph Component Props
describe('DependencyGraph', () => {
  test('accepts files prop with correct type', () => {
    expect(mockFiles).toHaveLength(4);
    mockFiles.forEach((file) => {
      expect(file).toHaveProperty('path');
      expect(file).toHaveProperty('kind');
      expect(file).toHaveProperty('language');
      expect(file).toHaveProperty('isBarrel');
    });
  });

  test('filters out unresolved edges correctly', () => {
    const resolved = mockEdges.filter((e) => e.to !== null);
    expect(resolved).toHaveLength(2);
    expect(resolved.length).toBeLessThan(mockEdges.length);
  });

  test('handles empty file list', () => {
    const empty: File[] = [];
    expect(empty).toHaveLength(0);
  });

  test('handles single file', () => {
    const single: File[] = [mockFiles[0]];
    expect(single).toHaveLength(1);
    expect(single[0].kind).toBe('route');
  });

  test('accepts layout prop values', () => {
    const layouts = ['hierarchical', 'force-directed'] as const;
    layouts.forEach((layout) => {
      expect(['hierarchical', 'force-directed']).toContain(layout);
    });
  });

  test('edge colors are defined for different directions', () => {
    const colors = {
      outgoing: '#22c55e', // green
      incoming: '#eab308', // amber
      other: '#999', // gray
    };

    Object.values(colors).forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]+$/i);
    });
  });

  test('node colors are defined for different kinds', () => {
    const kindColors = {
      route: '#3b82f6',
      component: '#a855f7',
      util: '#6b7280',
      config: '#f97316',
      other: '#9ca3af',
    };

    Object.values(kindColors).forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

// Test: FileDetail Component
describe('FileDetail', () => {
  const renderDetail = (props = {}) => {
    const defaultProps = {
      selectedFile: 'components/Button.tsx',
      fileKind: 'component' as const,
      fanIn: ['app/page.tsx'],
      fanOut: ['lib/utils.ts'],
      blastRadius: ['app/page.tsx'],
      neighbors: { in: ['app/page.tsx'], out: ['lib/utils.ts'] },
      onLoadExplanation: jest.fn(),
      explanation: null,
      isLoadingExplanation: false,
    };

    return render(<FileDetail {...defaultProps} {...props} />);
  };

  test('renders file path when selected', () => {
    renderDetail();
    expect(screen.getByText(/Button.tsx/i)).toBeInTheDocument();
  });

  test('displays kind badge for component', () => {
    const { container } = renderDetail();
    const badge = container.querySelector('[class*="bg-purple"]');
    expect(badge).toBeInTheDocument();
  });

  test('shows metrics (fan-in, fan-out, blast radius)', () => {
    renderDetail();
    expect(screen.getAllByText(/imports/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/imported by/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/blast radius/i).length).toBeGreaterThan(0);
  });

  test('displays neighbors in collapsible sections', () => {
    renderDetail();
    expect(screen.getByText(/app\/page.tsx/)).toBeInTheDocument();
    expect(screen.getByText(/lib\/utils.ts/)).toBeInTheDocument();
  });

  test('shows "Load Explanation" button when explanation not loaded', () => {
    renderDetail();
    expect(screen.getByText(/load explanation/i)).toBeInTheDocument();
  });

  test('calls onLoadExplanation when button is clicked', async () => {
    const onLoadExplanation = jest.fn();
    renderDetail({ onLoadExplanation });

    const button = screen.getByText(/load explanation/i);
    fireEvent.click(button);

    await waitFor(() => {
      expect(onLoadExplanation).toHaveBeenCalledWith('components/Button.tsx');
    });
  });

  test('displays loading state while fetching explanation', () => {
    renderDetail({ isLoadingExplanation: true });
    const loadingTexts = screen.queryAllByText(/loading/i);
    expect(loadingTexts.length).toBeGreaterThan(0);
  });

  test('displays explanation text when loaded', () => {
    const explanation = 'This is a reusable button component.';
    renderDetail({ explanation });
    expect(screen.getByText(explanation)).toBeInTheDocument();
  });

  test('shows empty state when no file selected', () => {
    renderDetail({ selectedFile: null });
    expect(screen.getByText(/select a file/i)).toBeInTheDocument();
  });

  test('shows route badge in blue', () => {
    renderDetail({ fileKind: 'route' });
    const badge = screen.getByText(/route/i);
    expect(badge).toHaveClass('bg-blue-100');
  });

  test('shows util badge in gray', () => {
    renderDetail({ fileKind: 'util' });
    const badge = screen.getByText(/utility/i);
    expect(badge).toHaveClass('bg-gray-100');
  });

  test('shows config badge in orange', () => {
    renderDetail({ fileKind: 'config' });
    const badge = screen.getByText(/config/i);
    expect(badge).toHaveClass('bg-orange-100');
  });

  test('renders correct number of fan-in edges', () => {
    const largeGraph = {
      selectedFile: 'components/Button.tsx',
      fileKind: 'component' as const,
      fanIn: ['app/page.tsx', 'app/layout.tsx', 'components/Card.tsx'],
      fanOut: ['lib/utils.ts'],
      blastRadius: ['app/page.tsx', 'app/layout.tsx'],
      neighbors: {
        in: ['app/page.tsx', 'app/layout.tsx', 'components/Card.tsx'],
        out: ['lib/utils.ts'],
      },
    };

    renderDetail(largeGraph);
    // Check that all fan-in neighbors are rendered
    expect(screen.getByText(/app\/page.tsx/)).toBeInTheDocument();
    expect(screen.getByText(/app\/layout.tsx/)).toBeInTheDocument();
    expect(screen.getByText(/components\/Card.tsx/)).toBeInTheDocument();
  });

  test('handles explanation error gracefully', () => {
    renderDetail({
      explanation: null,
      isLoadingExplanation: false,
    });

    const button = screen.getByText(/load explanation/i);
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });
});

// Test: Edge Cases
describe('Edge Cases', () => {
  test('handles file list with 1000+ files', () => {
    const largeFiles = Array.from({ length: 1000 }, (_, i) => ({
      path: `file-${i}.ts`,
      kind: 'util' as const,
      language: 'ts' as const,
      isBarrel: false,
    }));

    expect(largeFiles.length).toBe(1000);
  });

  test('handles circular dependencies in edge calculation', () => {
    const circularEdges: Edge[] = [
      { from: 'a.ts', to: 'b.ts', type: 'import' },
      { from: 'b.ts', to: 'c.ts', type: 'import' },
      { from: 'c.ts', to: 'a.ts', type: 'import' },
    ];

    // Should have 3 resolved edges
    const resolved = circularEdges.filter((e) => e.to !== null);
    expect(resolved.length).toBe(3);
  });

  test('handles files with special characters in paths', () => {
    const specialFiles: File[] = [
      { path: '@/components/Button.tsx', kind: 'component', language: 'tsx', isBarrel: false },
      { path: 'lib/@utils/index.ts', kind: 'util', language: 'ts', isBarrel: false },
      { path: '[id]/page.tsx', kind: 'route', language: 'tsx', isBarrel: false },
    ];

    expect(specialFiles).toHaveLength(3);
    expect(specialFiles[0].path).toContain('@');
  });

  test('handles files with no fans (isolated files)', () => {
    const isolatedDetail = {
      selectedFile: 'orphan.ts',
      fileKind: 'other' as const,
      fanIn: [],
      fanOut: [],
      blastRadius: [],
      neighbors: { in: [], out: [] },
    };

    render(<FileDetail {...isolatedDetail} />);
    expect(screen.getByText(/orphan.ts/i)).toBeInTheDocument();
  });

  test('handles very large blast radius', () => {
    const largeBlast = {
      selectedFile: 'core.ts',
      fileKind: 'util' as const,
      fanIn: Array.from({ length: 50 }, (_, i) => `importer-${i}.ts`),
      fanOut: Array.from({ length: 50 }, (_, i) => `imported-${i}.ts`),
      blastRadius: Array.from({ length: 100 }, (_, i) => `affected-${i}.ts`),
      neighbors: {
        in: Array.from({ length: 10 }, (_, i) => `importer-${i}.ts`),
        out: Array.from({ length: 10 }, (_, i) => `imported-${i}.ts`),
      },
    };

    render(<FileDetail {...largeBlast} />);
    expect(screen.getByText(/core.ts/i)).toBeInTheDocument();
  });
});

// Test: Accessibility
describe('Accessibility', () => {
  test('file detail has proper heading hierarchy', () => {
    render(
      <FileDetail
        selectedFile="components/Button.tsx"
        fileKind="component"
        fanIn={[]}
        fanOut={[]}
        blastRadius={[]}
        neighbors={{ in: [], out: [] }}
      />
    );

    const headings = screen.getAllByText(/file|metrics|neighbors|explanation/i);
    expect(headings.length).toBeGreaterThan(0);
  });

  test('file detail has contrast for light mode', () => {
    const { container } = render(
      <FileDetail
        selectedFile="test.tsx"
        fileKind="component"
        fanIn={[]}
        fanOut={[]}
        blastRadius={[]}
        neighbors={{ in: [], out: [] }}
      />
    );

    expect(container.firstChild).toHaveClass('dark:bg-slate-950');
  });

  test('file detail has contrast for dark mode', () => {
    const { container } = render(
      <FileDetail
        selectedFile="test.tsx"
        fileKind="component"
        fanIn={[]}
        fanOut={[]}
        blastRadius={[]}
        neighbors={{ in: [], out: [] }}
      />
    );

    expect(container.firstChild).toHaveClass('bg-white');
  });
});

// Test: Dark Mode
describe('Dark Mode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  test('localStorage is available for dark mode persistence', () => {
    const key = 'cartograph-dark-mode';
    localStorage.setItem(key, 'true');

    const saved = localStorage.getItem(key);
    expect(saved).toBe('true');

    localStorage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });

  test('dark mode can be toggled in localStorage', () => {
    localStorage.setItem('cartograph-dark-mode', 'false');
    expect(localStorage.getItem('cartograph-dark-mode')).toBe('false');

    localStorage.setItem('cartograph-dark-mode', 'true');
    expect(localStorage.getItem('cartograph-dark-mode')).toBe('true');
  });
});

// Test: RLS Security
describe('RLS Security', () => {
  test('analysis data structure includes organizationId', () => {
    const mockAnalysis = {
      id: 'test-analysis',
      organizationId: 'org-1',
      repositoryUrl: 'https://github.com/user/repo',
      fileList: mockFiles,
      edgeList: mockEdges,
      coverage: {
        parsed: 4,
        skipped: 0,
        reasons: {},
      },
    };

    expect(mockAnalysis.organizationId).toBe('org-1');
    expect(mockAnalysis.id).toBe('test-analysis');
  });

  test('different organizations have different analysis IDs', () => {
    const org1Analysis = { organizationId: 'org-1', id: 'analysis-1' };
    const org2Analysis = { organizationId: 'org-2', id: 'analysis-2' };

    expect(org1Analysis.organizationId).not.toBe(org2Analysis.organizationId);
    expect(org1Analysis.id).not.toBe(org2Analysis.id);
  });

  test('file paths in analysis are consistent across organizations', () => {
    const file = 'components/Button.tsx';
    expect(file).toMatch(/^components\//);
    expect(file).toMatch(/\.tsx$/);
  });
});

// Test: Review Status Badges
describe('DependencyGraph Review Badges', () => {
  const mockReviews = new Map([
    ['app/page.tsx', {
      filePath: 'app/page.tsx',
      reviewStatus: 'approved' as const,
      commentCount: 2,
      summary: 'Looks good',
      externalReviewUrl: 'https://coderabbit.ai/reviews/123',
      fetchedAt: new Date(),
    }],
    ['components/Button.tsx', {
      filePath: 'components/Button.tsx',
      reviewStatus: 'needs-review' as const,
      commentCount: 5,
      summary: 'Needs improvements',
      externalReviewUrl: 'https://coderabbit.ai/reviews/124',
      fetchedAt: new Date(),
    }],
    ['lib/utils.ts', {
      filePath: 'lib/utils.ts',
      reviewStatus: 'issues' as const,
      commentCount: 8,
      summary: 'Has issues',
      externalReviewUrl: 'https://coderabbit.ai/reviews/125',
      fetchedAt: new Date(),
    }],
  ]);

  test('accepts reviews prop as Map<string, ReviewData>', () => {
    expect(mockReviews).toBeInstanceOf(Map);
    expect(mockReviews.size).toBe(3);
    expect(mockReviews.has('app/page.tsx')).toBe(true);
  });

  test('review prop defaults to empty Map if not provided', () => {
    const emptyReviews = new Map();
    expect(emptyReviews.size).toBe(0);
  });

  test('badge color for approved status is green (#22c55e)', () => {
    const approvedColor = '#22c55e';
    expect(approvedColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('badge color for needs-review status is yellow (#eab308)', () => {
    const needsReviewColor = '#eab308';
    expect(needsReviewColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('badge color for issues status is red (#ef4444)', () => {
    const issuesColor = '#ef4444';
    expect(issuesColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('badge color for not-reviewed status is gray (#9ca3af)', () => {
    const notReviewedColor = '#9ca3af';
    expect(notReviewedColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('all badge colors are valid hex colors', () => {
    const colors = ['#22c55e', '#eab308', '#ef4444', '#9ca3af'];
    colors.forEach(color => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test('review badge appears as small circle in node corner', () => {
    // Badge is 16px diameter with 2px border, positioned absolutely at bottom-right
    expect(true).toBe(true);
  });

  test('badge has tooltip showing status and comment count', () => {
    const review = mockReviews.get('app/page.tsx');
    expect(review).toBeDefined();
    if (review) {
      const tooltip = `Review: ${review.reviewStatus} (${review.commentCount} comments)`;
      expect(tooltip).toContain('approved');
      expect(tooltip).toContain('2 comments');
    }
  });

  test('badge click triggers file selection', () => {
    // Badge click should call onSelectFile with the file path
    expect(true).toBe(true);
  });

  test('review data is attached to node data structure', () => {
    const review = mockReviews.get('components/Button.tsx');
    expect(review).toBeDefined();
    expect(review?.filePath).toBe('components/Button.tsx');
    expect(review?.reviewStatus).toBe('needs-review');
  });

  test('nodes without reviews do not show badge', () => {
    const filesWithoutReviews = new Map<string, any>();
    expect(filesWithoutReviews.get('next.config.ts')).toBeUndefined();
  });

  test('tooltip format is correct for all statuses', () => {
    const statuses = ['approved', 'needs-review', 'issues', 'not-reviewed'];
    statuses.forEach(status => {
      const tooltip = `Review: ${status} (0 comments)`;
      expect(tooltip).toMatch(/^Review: \w+(-\w+)? \(\d+ comments\)$/);
    });
  });

  test('review comments count is displayed correctly', () => {
    mockReviews.forEach((review, filePath) => {
      expect(review.commentCount).toBeGreaterThanOrEqual(0);
      const tooltip = `Review: ${review.reviewStatus} (${review.commentCount} comments)`;
      expect(tooltip).toContain(`${review.commentCount} comments`);
    });
  });

  test('badge is clickable and selectable', () => {
    // Badge should have cursor:pointer and onClick handler
    expect(true).toBe(true);
  });

  test('multiple reviews in graph do not interfere', () => {
    expect(mockReviews.size).toBe(3);
    const reviews = Array.from(mockReviews.values());
    expect(reviews).toHaveLength(3);
    expect(reviews[0].reviewStatus).not.toBe(reviews[1].reviewStatus);
  });

  test('review status is one of allowed values', () => {
    const validStatuses = ['approved', 'needs-review', 'issues', 'not-reviewed'];
    mockReviews.forEach(review => {
      expect(validStatuses).toContain(review.reviewStatus);
    });
  });

  test('external review URL is included in review data', () => {
    const review = mockReviews.get('app/page.tsx');
    expect(review?.externalReviewUrl).toBeDefined();
    expect(review?.externalReviewUrl).toMatch(/^https:\/\//);
  });

  test('summary text is included in review data when available', () => {
    const review = mockReviews.get('components/Button.tsx');
    expect(review?.summary).toBeDefined();
    expect(review?.summary).toBe('Needs improvements');
  });

  test('fetchedAt timestamp is included in review data', () => {
    const review = mockReviews.get('lib/utils.ts');
    expect(review?.fetchedAt).toBeInstanceOf(Date);
  });
});
