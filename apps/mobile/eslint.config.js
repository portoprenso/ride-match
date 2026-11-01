// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Import specifiers that reach src/data/mock: one naming `data/mock`, and, inside src/data, a
// relative one ending at a `mock` folder.
const SIMULATOR_PATH = '(^|/)data/mock(/|$)';
const RELATIVE_SIMULATOR_PATH = '^(\\.\\.?/)+mock(/|$)';

function restrictSimulatorImports(regexes) {
  const message = 'Only src/bootstrap and src/data/mock may import the simulator; use useDataSource().';
  return ['error', { patterns: regexes.map((regex) => ({ regex, message })) }];
}

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*'],
  },
  {
    // eslint-config-expo registers the @typescript-eslint plugin only for these files.
    files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The data-source boundary (docs/ARCHITECTURE.md): routes, features, UI and the data layer
    // reach data through `useDataSource()`, never the simulator's state, clock, scenarios or
    // fixtures. Only the composition root and the simulator itself import it; tests are
    // outside `app/` and `src/`. tests/importBoundary.test.ts checks this rule.
    files: ['app/**', 'src/**'],
    ignores: ['src/bootstrap/**', 'src/data/mock/**'],
    rules: { 'no-restricted-imports': restrictSimulatorImports([SIMULATOR_PATH]) },
  },
  {
    // Inside src/data a relative path reaches the simulator without naming `data/`. This block
    // repeats the pattern above, because a later block replaces the rule's options.
    files: ['src/data/**'],
    ignores: ['src/data/mock/**'],
    rules: { 'no-restricted-imports': restrictSimulatorImports([SIMULATOR_PATH, RELATIVE_SIMULATOR_PATH]) },
  },
]);
