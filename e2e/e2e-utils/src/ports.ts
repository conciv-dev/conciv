export const E2E_PORTS = {
  'vite-vanilla': 4311,
  'vite-react': 4312,
  'vite-solid': 4313,
  svelte: 4314,
  'solid-start': 4315,
  'tanstack-start': 4316,
  nextjs: 4317,
  astro: 4318,
} as const

export type E2EApp = keyof typeof E2E_PORTS
