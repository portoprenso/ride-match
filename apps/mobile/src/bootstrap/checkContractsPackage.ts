/**
 * Temporary smoke import for the shared contracts package.
 *
 * Importing `@ride-match/contracts` for its side effects proves that TypeScript and Metro
 * resolve the package's public `exports` entry (`dist/index.js`) without source aliases.
 * Loading the package also loads Zod and builds its schemas, which proves the bundle
 * resolves the package's own dependency; nothing is registered or rendered.
 *
 * Remove this file and its import in `app/_layout.tsx` once real code imports a contract.
 */
import '@ride-match/contracts';
