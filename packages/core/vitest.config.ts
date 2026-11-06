import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

const fixtureClaudeConfig = {CLAUDE_CONFIG_DIR: realpathSync(mkdtempSync(join(tmpdir(), 'conciv-claude-config-')))}
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
          env: fixtureClaudeConfig,
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
          env: fixtureClaudeConfig,
        },
      },
    ],
  },
})
