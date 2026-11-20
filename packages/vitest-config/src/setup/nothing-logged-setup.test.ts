import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'
import {createVitest} from 'vitest/node'

const FIXTURE_ROOT = fileURLToPath(new URL('../../test/fixtures/nothing-logged', import.meta.url))

type Outcome = {state: string; message: string}

type FixtureRun = {tests: Map<string, Outcome>; files: Map<string, string>}

function joinMessages(errors: readonly {message: string}[]): string {
  return errors.map((error) => error.message).join('\n')
}

async function runFixture(): Promise<FixtureRun> {
  const vitest = await createVitest({root: FIXTURE_ROOT, watch: false, reporters: [], coverage: {enabled: false}})
  try {
    const {testModules} = await vitest.start()
    const tests = testModules.flatMap((testModule) =>
      [...testModule.children.allTests()].map((testCase): [string, Outcome] => {
        const result = testCase.result()
        return [
          `${testModule.relativeModuleId} > ${testCase.name}`,
          {state: result.state, message: joinMessages(result.errors ?? [])},
        ]
      }),
    )
    const files = testModules.map((testModule): [string, string] => [
      testModule.relativeModuleId,
      joinMessages(testModule.errors()),
    ])
    return {tests: new Map(tests), files: new Map(files)}
  } finally {
    await vitest.close()
  }
}

test('a new-layer test fails on a console line it did not declare; an old-layer test is out of scope', async () => {
  const {tests: outcomes, files} = await runFixture()

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
  expect(outcomes.get('src/teardown.test.ts > a fixture logs an error while it tears down')).toEqual({
    state: 'failed',
    message: expect.stringContaining('console.error: the session could not close'),
  })
  expect(files.get('src/teardown.test.ts')).toBe('')
  expect(outcomes.get('src/file-teardown.test.ts > a file fixture logs a warning after the last test')).toEqual({
    state: 'passed',
    message: '',
  })
  expect(files.get('src/file-teardown.test.ts')).toContain('console.warn: the server did not stop cleanly')
  expect(files.get('src/logs.test.ts')).toBe('')
})
