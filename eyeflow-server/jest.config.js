module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/test/api.integration.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        strict: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  roots: [
    '<rootDir>',
    '<rootDir>/../test',
  ],
  moduleNameMapper: {},
  maxWorkers: '50%',
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: false,
};


