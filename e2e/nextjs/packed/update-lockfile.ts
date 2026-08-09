import {copyFileSync} from 'node:fs'
import {join} from 'node:path'
import {FIXTURE_LOCK_PATH, setupFixture, teardownFixture} from './harness.js'

async function main(): Promise<void> {
  const fixture = await setupFixture({fresh: true})
  copyFileSync(join(fixture.root, 'pnpm-lock.yaml'), FIXTURE_LOCK_PATH)
  teardownFixture(fixture)
  console.log(`wrote ${FIXTURE_LOCK_PATH}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
