import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Compiles only pure mobile transport/session modules for a real HTTP test; no Expo/Metro/native app. */
export async function loadMobileAdapter() {
  const directory = await mkdtemp(join(tmpdir(), 'ride-match-be002-adapter-'));
  try {
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await symlink(fileURLToPath(new URL('../node_modules/', import.meta.url)), join(directory, 'node_modules'), 'dir');
    for (const file of ['data/api/createHttpDataSource', 'data/api/httpClient', 'data/errors', 'data/createUnavailableDataSource', 'features/auth/createSessionController', 'bootstrap/withSessionRenewal']) {
      const source = await readFile(new URL(`../../mobile/src/${file}.ts`, import.meta.url), 'utf8');
      const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true } }).outputText
        .replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3');
      const destination = join(directory, `${file}.js`);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, output);
    }
    const adapter = await import(pathToFileURL(join(directory, 'data/api/createHttpDataSource.js')).href);
    const session = await import(pathToFileURL(join(directory, 'features/auth/createSessionController.js')).href);
    const renewal = await import(pathToFileURL(join(directory, 'bootstrap/withSessionRenewal.js')).href);
    return { ...adapter, ...session, ...renewal, dispose: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
