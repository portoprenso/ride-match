/**
 * @jest-environment node
 */
import { ESLint } from 'eslint';

import config from '../eslint.config.js';

// The mobile `test` script runs in apps/mobile, which the paths below are relative to.
const APP_ROOT = process.cwd();

// Lints a controlled source text as if it lived at `filePath`; nothing is written to disk.
// ESLint gets the config object rather than loading the config file itself, because Jest
// cannot run the dynamic import ESLint uses to load one.
async function boundaryViolations(filePath: string, code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: APP_ROOT, overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((message) => message.ruleId === 'no-restricted-imports').map((message) => message.message);
}

const simulatorImport = (specifier: string) => `import { seed } from '${specifier}';\nexport const value = seed;\n`;

describe('simulator import boundary', () => {
  it.each([
    ['a feature', 'src/features/map/NearbyList.tsx', '../../data/mock/scenarios/activeNeighborhood'],
    ['a route', 'app/dev/scenarios.tsx', '../../src/data/mock/state'],
    ['a UI component', 'src/ui/Example.tsx', '../data/mock'],
    ['the data layer', 'src/data/createDataSource.ts', './mock/clock'],
    ['a nested data module', 'src/data/sync/synchronizeEvents.ts', '../mock/events'],
    ['a data module naming data/mock', 'src/data/queries.ts', '../data/mock/state'],
  ])('fails lint when %s imports the simulator', async (_label, filePath, specifier) => {
    await expect(boundaryViolations(filePath, simulatorImport(specifier))).resolves.toEqual([
      expect.stringContaining('Only src/bootstrap and src/data/mock may import the simulator; use useDataSource().'),
    ]);
  }, 30_000);

  it.each([
    ['the composition root', 'src/bootstrap/composeAppDataSource.ts', '../data/mock/createMockDataSource'],
    ['the simulator itself', 'src/data/mock/operations/rides.ts', '../state'],
    ['a feature using the boundary', 'src/features/map/NearbyList.tsx', '../../data/DataSourceProvider'],
  ])('allows %s', async (_label, filePath, specifier) => {
    await expect(boundaryViolations(filePath, simulatorImport(specifier))).resolves.toEqual([]);
  }, 30_000);
});
