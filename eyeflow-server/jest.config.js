module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
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
  // Setup environment variables for tests
  setupFilesAfterEnv: ['<rootDir>/../test/setup.ts'],
  moduleNameMapper: {},
  globals: {
    'ts-jest': {
      tsconfig: {
        strict: true,
      },
    },
  },
};
