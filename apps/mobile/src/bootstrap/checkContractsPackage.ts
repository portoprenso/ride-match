/**
 * Temporary smoke import for the shared contracts package.
 *
 * Importing `@ride-match/contracts` for its side effects proves that TypeScript and Metro
 * resolve the package's public `exports` entry (`dist/index.js`) without source aliases.
 * The package exports nothing yet, so this module adds no runtime behavior.
 *
 * Remove this file and its import in `app/_layout.tsx` once real code imports a contract.
 */
import '@ride-match/contracts';
