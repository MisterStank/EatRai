// Flat config for ESLint 9 + Expo.
const expoConfig = require('eslint-config-expo/flat');

const NODE = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};
const JEST = {
  describe: 'readonly',
  test: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  jest: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
};

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'coverage/*', 'public/near/*', 'public/th/*'],
  },
  {
    // build tooling — plain Node CommonJS, not the app bundle
    files: ['scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: NODE },
  },
  {
    files: ['scripts/**/*.test.js'],
    languageOptions: { globals: JEST },
  },
];
