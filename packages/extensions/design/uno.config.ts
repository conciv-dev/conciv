import {fileURLToPath} from 'node:url'
import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

function local(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

export default defineConfig({
  content: {filesystem: [local('src/xray/**/*.{ts,tsx,html}'), local('../../ui-kit-system/src/**/*.{ts,tsx}')]},
  presets: [presetConciv()],
})
