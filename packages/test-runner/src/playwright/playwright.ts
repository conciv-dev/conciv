import type {RunArgs} from '@aidx/protocol/runner-types'
import {defineChildRunner} from '../driver.js'

// The playwright adapter: spawns playwright/child.ts, which runs the app's `playwright test
// --reporter=json` and maps the report to TestEvents. No watch, no failed-only memory on a
// fresh child; name filter maps to playwright's -g.
export const playwright = defineChildRunner({
  id: 'playwright',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  childUrl: new URL('./child.js', import.meta.url),
  buildRunArgs: (args: RunArgs, cwd: string) => {
    const patternArgs = (args.patterns ?? []).flatMap((p) => ['--pattern', p])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    return ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs]
  },
  buildListArgs: (_failedOnly: boolean, cwd: string) => ['--mode', 'list', '--cwd', cwd],
})
