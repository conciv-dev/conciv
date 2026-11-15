import {realpathSync} from 'node:fs'
import {join} from 'node:path'
import {defineConfig} from 'vitest/config'
import {ciTest, processTempDir} from '@conciv/vitest-config'

const fixtureHomes = realpathSync(processTempDir('conciv-harness-homes-'))

export default defineConfig({
  test: {
    ...ciTest(),
    env: {
      CLAUDE_CONFIG_DIR: join(fixtureHomes, 'claude'),
      CODEX_HOME: join(fixtureHomes, 'codex'),
      PI_CODING_AGENT_DIR: join(fixtureHomes, 'pi'),
      XDG_DATA_HOME: join(fixtureHomes, 'data'),
    },
  },
})
