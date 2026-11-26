import {describe} from 'vitest'
import {test} from '../utils/engine-test.js'
import {listerPlugin} from '@internal/engine-kit'

describe.concurrent('loading plugins', () => {
  test.for([
    {
      folder: './test/fixtures/plugins/greeter-promise',
      tool: 'greet_promise',
      greeting: 'Hello Ada, from the Promise entry',
    },
    {
      folder: './test/fixtures/plugins/greeter-effect',
      tool: 'greet_effect',
      greeting: 'Hello Ada, from the Effect entry',
    },
  ])(
    'a plugin folder at $folder loads and its tool $tool answers',
    async ({folder, tool, greeting}, {createEngine, expect}) => {
      const engine = await createEngine({plugins: [folder]})

      expect(await engine.session.tool(tool).call({name: 'Ada'})).toEqual({greeting})
    },
  )

  test('a plugin given with options reads them in its tool', async ({createEngine, expect}) => {
    const engine = await createEngine({
      plugins: [['./test/fixtures/plugins/echo-options', {greeting: 'Shalom', times: 2}]],
    })

    expect(await engine.session.tool('echo_options').call({})).toEqual({options: {greeting: 'Shalom', times: 2}})
  })

  test("a plugin dropped into the project's conciv/plugins folder loads with no plugins in the config", async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({}, {directory: './test/fixtures/projects/dropped-plugin'})

    expect(await engine.session.tool('greet_dropped').call({name: 'Ada'})).toEqual({
      greeting: 'Hello Ada, from conciv/plugins',
    })
  })

  test('a ./ plugin path resolves against the project folder, and a path to a file is skipped', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine(
      {plugins: ['./tools/greeter-local', './tools/greeter-file/server.ts']},
      {directory: './test/fixtures/projects/local-plugins'},
    )

    expect(await engine.session.tool('greet_local').call({name: 'Ada'})).toEqual({
      greeting: 'Hello Ada, from the project',
    })
    expect(await engine.session.tool('greet_file').failure({name: 'Ada'})).toEqual(
      expect.objectContaining({tool: 'greet_file'}),
    )
  })

  test('an organization policy that denies plugin.use keeps that plugin and its tool out and loads the rest', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({
      plugins: [listerPlugin, './test/fixtures/plugins/greeter-promise'],
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
    expect(await engine.session.tool('greet_promise').failure({name: 'Ada'})).toEqual(
      expect.objectContaining({tool: 'greet_promise'}),
    )
  })
})

describe.concurrent('a plugin that fails to load', () => {
  const lister = listerPlugin
  const active = {id: 'lister', state: {status: 'active'}}

  test.for([
    {
      name: 'bad-export',
      error: /^Plugin must export a default definition with an id and an effect or setup function\.$/,
    },
    {name: 'setup-throws', error: /setup exploded/},
    {name: 'does-not-strip', error: /^Plugin failed to load$/},
  ])('the plugin $name fails alone and the engine lists why', async ({name, error}, {createEngine, expect}) => {
    const engine = await createEngine({plugins: [lister, `./test/fixtures/plugins/${name}`]})

    expect(await engine.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining(active),
        expect.objectContaining({
          source: {type: 'local', path: expect.stringContaining(`/test/fixtures/plugins/${name}`)},
          state: expect.objectContaining({status: 'failed', error: expect.stringMatching(error)}),
        }),
      ]),
    })
  })

  test('a plugin folder with no entry is skipped and not listed', async ({createEngine, expect}) => {
    const engine = await createEngine({plugins: [lister, './test/fixtures/plugins/no-entry']})

    const listed = await engine.session.tool('list_plugins').call({})

    expect(listed).toEqual({plugins: expect.arrayContaining([expect.objectContaining(active)])})
    expect(listed).toEqual({
      plugins: expect.not.arrayContaining([
        expect.objectContaining({source: {type: 'local', path: expect.stringContaining('/no-entry')}}),
      ]),
    })
  })

  test('a second plugin with the same id is refused and the first keeps answering', async ({createEngine, expect}) => {
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

describe.concurrent('remove entries in the config', () => {
  const lister = listerPlugin
  const greeter = './test/fixtures/plugins/greeter-promise'
  const active = {id: 'lister', state: {status: 'active'}}

  test.for([
    {
      case: 'a remove entry naming a plugin id',
      plugins: [lister, greeter, '-greeter-promise'],
      tool: 'greet_promise',
      input: {name: 'Ada'},
    },
    {
      case: 'a remove entry ending in .* that names the built-ins',
      plugins: [lister, '-conciv.*'],
      tool: 'server_config',
      input: {},
    },
    {
      case: 'a remove entry of * ahead of a plugin listed after it',
      plugins: [greeter, '-*', lister],
      tool: 'greet_promise',
      input: {name: 'Ada'},
    },
    {
      case: 'a remove-every-plugin entry -* ahead of a plugin listed after it',
      plugins: [greeter, '-*', lister],
      tool: 'greet_promise',
      input: {name: 'Ada'},
    },
  ])(
    '$case drops the plugins it names and keeps the one listed after it',
    async ({plugins, tool, input}, {createEngine, expect}) => {
      const engine = await createEngine({plugins})

      expect(await engine.session.tool('list_plugins').call({})).toEqual({
        plugins: expect.arrayContaining([expect.objectContaining(active)]),
      })
      expect(await engine.session.tool(tool).failure(input)).toEqual({
        tool,
        message: expect.not.stringContaining('no dev server is attached'),
      })
    },
  )
})
