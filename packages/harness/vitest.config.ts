import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    env: {CLAUDE_CONFIG_DIR: realpathSync(mkdtempSync(join(tmpdir(), 'conciv-claude-config-')))},
  },
})
