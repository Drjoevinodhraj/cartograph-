import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
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
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // Do not collect coverage from node_modules or dist
  coveragePathIgnorePatterns: ['node_modules', '.next'],
};

export default config;
