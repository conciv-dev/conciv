import {join} from 'node:path'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

function fixtureHarnessHomes(project: string): Record<string, string> {
  const fixtureHomes = join(import.meta.dirname, 'test-results', 'conciv-home', 'harness-homes', project)
  return {
    CLAUDE_CONFIG_DIR: join(fixtureHomes, 'claude'),
    CODEX_HOME: join(fixtureHomes, 'codex'),
    PI_CODING_AGENT_DIR: join(fixtureHomes, 'pi'),
    XDG_DATA_HOME: join(fixtureHomes, 'data'),
  }
}
const realHarnessTests = 'test/core-chat.it.test.ts'

export default defineConfig({
  test: {
    ...ciTest(),
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**', realHarnessTests],
          execArgv: ['--expose-gc'],
          env: fixtureHarnessHomes('node'),
        },
      },
      {
        extends: true,
        test: {name: 'node-real-harness', include: [realHarnessTests], execArgv: ['--expose-gc']},
      },
    ],
  },
})
