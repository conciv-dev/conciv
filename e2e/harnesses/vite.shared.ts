import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@conciv/e2e-utils/dev-endpoint'
import {defineConfig} from 'vite'
import type {HarnessApp} from '@conciv/e2e-utils/config'

export function harnessConfig(harness: HarnessApp) {
  return defineConfig({
    cacheDir: `node_modules/.vite/${harness}`,
    plugins: [
      react(),
      conciv({harness, stateRoot: `.conciv-${harness}`, devEndpointDir: e2eDevEndpointDir(import.meta.dirname)}),
    ],
  })
}
