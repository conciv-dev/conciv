import {defineConfig} from '@playwright/test'

export default defineConfig({
  testDir: './test/proof',
  workers: 1,
  timeout: 300_000,
  expect: {timeout: 15_000},
  reporter: [['line']],
})
