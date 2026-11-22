import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('vite-vanilla', {
  dir: import.meta.dirname,
  command: (port) => `./node_modules/.bin/vite --port ${port} --strictPort --force`,
  fakeClis: ['codex', 'gemini'],
})
