/** @type {import('jest').Config} */
const base = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true, diagnostics: false }],
  },
  moduleNameMapper: { '^@fabnix/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.int.spec.ts'],
      globalSetup: '<rootDir>/test/setup/global-setup.ts',
      globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
      testTimeout: 90_000,
    },
  ],
};
