import {defineConfig} from '@playwright/test'

export default defineConfig({
  testDir: 'test',
  testMatch: 'init.e2e.spec.ts',
  timeout: 30_000,
  reporter: process.env.GITHUB_ACTIONS ? [['line'], ['json', {outputFile: 'test-results.json'}]] : [['line']],
})
