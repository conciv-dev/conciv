import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe("the agent runs the project's tests", () => {
  test('a run reports each test, a pattern narrows it and the status reads the last result', async () => {
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/plant-shop'},
    )

    expect(await engine.session.tool('test_runner_run').call({})).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [
        {
          file: expect.stringContaining('discount.test.js'),
          name: 'the spring discount takes 10 off',
          message: 'expected 11 to be 2 // Object.is equality',
        },
      ],
    })
    expect(await engine.session.tool('test_runner_run').call({pattern: 'cart'})).toMatchObject({
      summary: {passed: 1, failed: 0, skipped: 0},
      failures: [],
      tests: [{name: 'a fern in the cart costs 12', state: 'pass'}],
    })
    expect(await engine.session.tool('test_runner_status').call({})).toMatchObject({
      summary: {passed: 1, failed: 0, skipped: 0},
      tests: [{name: 'a fern in the cart costs 12', state: 'pass'}],
    })
  })
})
