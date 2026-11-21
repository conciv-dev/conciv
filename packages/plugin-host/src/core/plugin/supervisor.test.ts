import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('loading plugins', () => {
  test.each([
    ['./test/fixtures/plugins/greeter-promise', 'greet_promise', 'Hello Ada, from the Promise entry'],
    ['./test/fixtures/plugins/greeter-effect', 'greet_effect', 'Hello Ada, from the Effect entry'],
  ])('a plugin folder at %s loads and its tool %s answers', async (folder, tool, greeting) => {
    const engine = await createEngine({plugins: [folder]})

    expect(await engine.session.tool(tool).call({name: 'Ada'})).toEqual({greeting})
  })

  test('a plugin given with options reads them in its tool', async () => {
    const engine = await createEngine({
      plugins: [['./test/fixtures/plugins/echo-options', {greeting: 'Shalom', times: 2}]],
    })

    expect(await engine.session.tool('echo_options').call({})).toEqual({options: {greeting: 'Shalom', times: 2}})
  })
})
