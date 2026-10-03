import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Keep strict off for tests so we can write simpler assertions
          strict: false,
          esModuleInterop: true,
          allowJs: true,
          jsx: 'react-jsx',
          module: 'commonjs',
          moduleResolution: 'node',
          resolveJsonModule: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    // Map @/* path alias to the root of the project
    '^@/(.*)$': '<rootDir>/$1',
    // Mock CSS and other static assets
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(gif|ttf|eot|svg|png|jpg|jpeg)$': '<rootDir>/__mocks__/fileMock.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // Do not collect coverage from node_modules or dist
  coveragePathIgnorePatterns: ['node_modules', '.next'],
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
};

export default config;
