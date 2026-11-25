import type {Plugin} from 'vite'

export function concivKitTest(): Plugin {
  return {
    name: 'conciv:kit-test',
    async config(config, env) {
      if (env.mode !== 'test') return
      const {kitTestConfig} = await import('./test-projects.js')
      return kitTestConfig(config)
    },
  }
}
