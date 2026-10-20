import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

// Frontend unit tests.
//
// Kept separate from `vite.config.ts` so the production build never pulls the
// test runner or the jsdom environment into its dependency graph.
export default defineConfig({
  // hot: false disables solid-refresh, which crashes under vitest because it
  // resolves its runtime through a bare ile:/// URL.
  plugins: [solid({ hot: false })],
  test: {
    // `node` by default: most of the suite is pure math/formatting. The
    // markdown/XSS tests opt into jsdom with a per-file docblock.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
})
