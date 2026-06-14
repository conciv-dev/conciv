import {defineConfig} from 'tsdown'

// registry.ts is the package entry ("."); each runner adapter (vitest/jest/node-test/
// playwright .ts) is a subpath export. Each child.ts MUST stay its own output: the driver
// spawns it as a fresh process via new URL('./child.js', import.meta.url), so it cannot be
// bundled into its adapter. @aidx/protocol + zod stay external; the runner libs (vitest/
// jest/playwright/node:test) are the previewed app's deps, resolved at runtime — never bundled.
// vitest is fully implemented; jest/node-test/playwright are capability-only stubs (their
// adapters throw on create, their child.ts are pre-wired placeholders) pending implementation.
export default defineConfig({
  entry: [
    'src/registry.ts',
    'src/driver.ts',
    'src/child-protocol.ts',
    'src/vitest/vitest.ts',
    'src/vitest/child.ts',
    'src/jest/jest.ts',
    'src/jest/child.ts',
    'src/node-test/node-test.ts',
    'src/node-test/child.ts',
    'src/playwright/playwright.ts',
    'src/playwright/child.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
