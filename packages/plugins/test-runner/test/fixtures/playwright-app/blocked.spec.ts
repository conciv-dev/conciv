import {renameSync, writeFileSync} from 'node:fs'
import {test} from '@playwright/test'

const startedFile = process.env['CONCIV_FIXTURE_BLOCKED_FILE']

test('blocks until the run is stopped', async () => {
  if (startedFile === undefined) return
  test.setTimeout(0)
  writeFileSync(`${startedFile}.partial`, String(process.ppid))
  renameSync(`${startedFile}.partial`, startedFile)
  await new Promise(() => {})
})
