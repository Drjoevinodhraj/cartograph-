import '@testing-library/jest-dom';

// Only run DOM-specific setup if in browser environment
if (typeof window !== 'undefined') {
  // Mock localStorage with actual implementation
  const localStorageMock: Record<string, string> = {};

  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, value: string) => {
        localStorageMock[key] = value;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        Object.keys(localStorageMock).forEach((key) => {
          delete localStorageMock[key];
        });
      },
    },
  });

  // Mock matchMedia for dark mode detection
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Mock ResizeObserver (required by React Flow)
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
