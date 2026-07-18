export const E2E_PORTS = {
  'vite-vanilla': 4311,
  'vite-react': 4312,
  'vite-solid': 4313,
  svelte: 4314,
  'solid-start': 4315,
  'tanstack-start': 4316,
  nextjs: 4317,
  astro: 4318,
  'vite-react-component': 4319,
  'nextjs-component': 4320,
  'vite-preact-component': 4321,
} as const

export type E2EApp = keyof typeof E2E_PORTS

export const HARNESS_E2E_PORTS = {
  claude: 5271,
  codex: 5272,
  'gemini-cli': 5273,
  opencode: 5274,
  pi: 5275,
} as const

export type HarnessApp = keyof typeof HARNESS_E2E_PORTS
