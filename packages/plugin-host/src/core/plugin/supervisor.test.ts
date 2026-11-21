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

  test("a plugin dropped into the project's conciv/plugins folder loads with no plugins in the config", async () => {
    const engine = await createEngine({}, {directory: './test/fixtures/projects/dropped-plugin'})

    expect(await engine.session.tool('greet_dropped').call({name: 'Ada'})).toEqual({
      greeting: 'Hello Ada, from conciv/plugins',
    })
  })

  test('an organization policy that denies plugin.use keeps that plugin out and loads the rest', async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/lister', './test/fixtures/plugins/greeter-promise'],
      policies: [{action: 'plugin.use', resource: '*/greeter-promise', effect: 'deny'}],
    })

    const listed = await engine.session.tool('list_plugins').call({})

    expect(listed).toEqual({
      plugins: expect.arrayContaining([expect.objectContaining({id: 'lister', state: {status: 'active'}})]),
    })
    expect(listed).toEqual({
      plugins: expect.not.arrayContaining([
        expect.objectContaining({source: {type: 'local', path: expect.stringContaining('/greeter-promise')}}),
      ]),
    })
  })
})

describe('a plugin that fails to load', () => {
  const lister = './test/fixtures/plugins/lister'
  const active = expect.objectContaining({id: 'lister', state: {status: 'active'}})

  test.each([
    ['bad-export', 'Plugin must export a default definition with an id and an effect or setup function.'],
    ['setup-throws', expect.stringContaining('setup exploded')],
    ['does-not-strip', 'Plugin failed to load'],
  ])('the plugin %s fails alone and the engine lists why', async (name, error) => {
    const engine = await createEngine({plugins: [lister, `./test/fixtures/plugins/${name}`]})

    expect(await engine.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([
        active,
        expect.objectContaining({
          source: {type: 'local', path: expect.stringContaining(`/test/fixtures/plugins/${name}`)},
          state: expect.objectContaining({status: 'failed', error}),
        }),
      ]),
    })
  })

  test('a plugin folder with no entry is skipped and not listed', async () => {
    const engine = await createEngine({plugins: [lister, './test/fixtures/plugins/no-entry']})

    const listed = await engine.session.tool('list_plugins').call({})

    expect(listed).toEqual({plugins: expect.arrayContaining([active])})
    expect(listed).toEqual({
      plugins: expect.not.arrayContaining([
        expect.objectContaining({source: {type: 'local', path: expect.stringContaining('/no-entry')}}),
      ]),
    })
  })

  test('a second plugin with the same id is refused and the first keeps answering', async () => {
    const engine = await createEngine({plugins: [lister, './test/fixtures/plugins/lister-twin']})

    expect(await engine.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({
          id: 'lister',
          source: {type: 'local', path: expect.stringContaining('/lister-twin')},
          state: {status: 'failed', error: 'Duplicate plugin ID: lister'},
        }),
        expect.objectContaining({
          id: 'lister',
          source: {type: 'local', path: expect.stringMatching(/\/lister$/)},
          state: {status: 'active'},
        }),
      ]),
    })
  })
})
