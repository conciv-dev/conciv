import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'
import {createVitest} from 'vitest/node'

const FIXTURE_ROOT = fileURLToPath(new URL('../../test/fixtures/nothing-logged', import.meta.url))

type Outcome = {state: string; message: string}

async function runFixture(): Promise<Map<string, Outcome>> {
  const vitest = await createVitest({root: FIXTURE_ROOT, watch: false, reporters: [], coverage: {enabled: false}})
  try {
    const {testModules} = await vitest.start()
    const outcomes = testModules.flatMap((testModule) =>
      [...testModule.children.allTests()].map((testCase): [string, Outcome] => {
        const result = testCase.result()
        const message = (result.errors ?? []).map((error) => error.message).join('\n')
        return [`${testModule.relativeModuleId} > ${testCase.name}`, {state: result.state, message}]
      }),
    )
    return new Map(outcomes)
  } finally {
    await vitest.close()
  }
}

test('a new-layer test fails on a console line it did not declare; an old-layer test is out of scope', async () => {
  const outcomes = await runFixture()

  expect(outcomes.get('src/logs.test.ts > logs an error it did not declare')).toEqual({
    state: 'failed',
    message: expect.stringContaining('console.error: the draft could not be saved'),
  })
  expect(outcomes.get('src/logs.test.ts > logs an error it did not declare')?.message).toContain('expectLog(pattern)')
  expect(outcomes.get('src/logs.test.ts > logs an error it declared')).toEqual({state: 'passed', message: ''})
  expect(outcomes.get('src/logs.test.ts > logs a warning it did not declare')).toEqual({
    state: 'failed',
    message: expect.stringContaining('console.warn: the socket closed early'),
  })
  expect(outcomes.get('src/logs.test.ts > logs nothing')).toEqual({state: 'passed', message: ''})
  expect(outcomes.get('test/logs.test.ts > an old-layer test logs an error')).toEqual({state: 'passed', message: ''})
})
