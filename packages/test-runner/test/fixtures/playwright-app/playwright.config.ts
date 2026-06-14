import {defineConfig} from '@playwright/test'

// No webServer / no browser projects: the fixture tests are pure assertions that never request
// the `page` fixture, so playwright runs them without launching a browser.
export default defineConfig({testDir: '.', testMatch: '**/*.spec.ts'})
