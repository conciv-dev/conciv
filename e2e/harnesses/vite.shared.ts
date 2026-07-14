import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {defineConfig} from 'vite'

type Harness = 'claude' | 'codex' | 'gemini-cli' | 'opencode' | 'pi'

export function harnessConfig(harness: Harness) {
  return defineConfig({plugins: [react(), conciv({harness, stateRoot: `.conciv-${harness}`})]})
}
