import {defineConfig} from '@playwright/test'

console.log('playwright fixture config loaded')

export default defineConfig({testDir: '.', testMatch: '**/*.spec.ts'})
