import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {defineConfig} from 'vite'
import type {HarnessApp} from '@conciv/e2e-utils/ports'

export function harnessConfig(harness: HarnessApp) {
  return defineConfig({plugins: [react(), conciv({harness, stateRoot: `.conciv-${harness}`})]})
}
