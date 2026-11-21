import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('server tools', () => {
  test.each([
    ['server_config', {}],
    ['server_urls', {}],
    ['server_resolve', {spec: 'react'}],
    ['server_graph', {file: 'src/main.ts'}],
    ['server_transform', {url: '/src/main.ts'}],
    ['server_restart', {}],
  ])('with no dev server attached %s answers that none is attached', async (tool, input) => {
    const engine = await createEngine()

    const failure = await engine.session.tool(tool).failure(input)

    expect(JSON.parse(failure.message)).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({message: expect.stringContaining('no dev server is attached to conciv')}),
      }),
    )
  })

  test('with no dev server attached the server rpc answers with its declared unavailable error', async () => {
    const engine = await createEngine()

    expect(await engine.rpc.failure('server', 'config')).toEqual({
      type: 'BUNDLER_UNAVAILABLE',
      message: 'no dev server is attached to conciv',
      data: {},
    })
  })

  test('the server rpc open sends the file to the editor, with the column only when a line is given', async () => {
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

    expect(await engine.opened()).toEqual([{file: 'src/main.ts', line: 12, column: 4}, {file: 'README.md'}])
  })
})
