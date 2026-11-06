import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

const fixtureHomes = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-harness-homes-')))
const fixtureHarnessHomes = {
  CLAUDE_CONFIG_DIR: join(fixtureHomes, 'claude'),
  CODEX_HOME: join(fixtureHomes, 'codex'),
  PI_CODING_AGENT_DIR: join(fixtureHomes, 'pi'),
  XDG_DATA_HOME: join(fixtureHomes, 'data'),
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
          include: ['test/**/*.test.ts'],
          exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**', realHarnessTests],
          execArgv: ['--expose-gc'],
          env: fixtureHarnessHomes,
        },
      },
      {
        extends: true,
        test: {name: 'node-real-harness', include: [realHarnessTests], execArgv: ['--expose-gc']},
      },
      {
        extends: true,
        test: {
          name: 'node-quickjs-worker',
          include: ['test/core-api.it.test.ts'],
          execArgv: ['--expose-gc', '--no-addons'],
          env: fixtureHarnessHomes,
        },
      },
    ],
  },
})
