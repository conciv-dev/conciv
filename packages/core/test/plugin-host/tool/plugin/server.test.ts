import {describe, test} from 'vitest'
import {createEngine} from '../../../engine.js'

describe.concurrent('server tools', () => {
  test.for([
    {tool: 'server_config', input: {}},
    {tool: 'server_urls', input: {}},
    {tool: 'server_resolve', input: {spec: 'react'}},
    {tool: 'server_graph', input: {file: 'src/main.ts'}},
    {tool: 'server_transform', input: {url: '/src/main.ts'}},
    {tool: 'server_restart', input: {}},
  ])('with no dev server attached $tool answers that none is attached', async ({tool, input}, {expect}) => {
    const engine = await createEngine()

    const failure = await engine.session.tool(tool).failure(input)

    expect(JSON.parse(failure.message)).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({message: expect.stringContaining('no dev server is attached to conciv')}),
      }),
    )
  })

  test('with no dev server attached the server rpc answers with its declared unavailable error', async ({expect}) => {
    const engine = await createEngine()

    expect(await engine.rpc.failure('server', 'config')).toEqual({
      type: 'BUNDLER_UNAVAILABLE',
      message: 'no dev server is attached to conciv',
      data: {},
    })
  })

  test('the server rpc open sends the file to the editor, with the column only when a line is given', async ({
    expect,
  }) => {
    const engine = await createEngine()

    expect(await engine.rpc.call('server', 'open', {file: 'src/main.ts', line: 12, column: 4})).toEqual({
      ok: true,
      file: 'src/main.ts',
      line: 12,
    })
    expect(await engine.rpc.call('server', 'open', {file: 'README.md', column: 3})).toEqual({
      ok: true,
      file: 'README.md',
    })

    expect(await engine.opened()).toEqual([
      {file: 'src/main.ts', line: 12, column: 4},
      {file: 'README.md', line: 1},
    ])
  })
})
