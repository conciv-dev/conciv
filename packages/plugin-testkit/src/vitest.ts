import type {Plugin} from 'vite'

export function concivTest(): Plugin {
  return {
    name: 'conciv:test',
    async config(config, env) {
      if (env.mode !== 'test') return
      const {kitTestConfig} = await import('./test-projects.js')
      return kitTestConfig(config)
    },
  }
}
