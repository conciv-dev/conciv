import {defineConfig, devices} from '@playwright/test'

const harnesses = [
  {name: 'claude', port: 5271, config: 'vite.claude.config.ts'},
  {name: 'codex', port: 5272, config: 'vite.codex.config.ts'},
  {name: 'gemini-cli', port: 5273, config: 'vite.gemini.config.ts'},
  {name: 'opencode', port: 5274, config: 'vite.opencode.config.ts'},
  {name: 'pi', port: 5275, config: 'vite.pi.config.ts'},
] as const

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  webServer: harnesses.map(({name, port, config}) => ({
    command: `rm -rf .conciv-${name} && pnpm exec vite --config ${config} --port ${port} --strictPort --force`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe' as const,
    timeout: 120_000,
    env: {CONCIV_E2E: '1'},
  })),
  projects: harnesses.map(({name, port}) => ({
    name,
    use: {...devices['Desktop Chrome'], baseURL: `http://localhost:${port}`},
  })),
})
