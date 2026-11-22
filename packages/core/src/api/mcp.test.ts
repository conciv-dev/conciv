import {describe, expect} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../../test/engine-test.js'

describe('agent tools', () => {
  test('a capability answers, an oversized answer is truncated, a photo comes back as an image, and a direct tool is called by name', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shelf']})

    expect(await engine.session.tool('shelf_count').call({shelf: 'poetry'})).toEqual({shelf: 'poetry', count: 3})

    const dumped = await engine.session.tool('shelf_dump').failure({})
    expect(dumped.message).toContain('the serialized result is')
    expect(dumped.message).toContain('the cap is 50000')

    expect(await engine.session.tool('shelf_photo').call({})).toContainEqual(
      expect.objectContaining({
        type: 'image',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        mimeType: 'image/png',
      }),
    )

    expect(await engine.session.tool('shelf_reset').call({})).toEqual({reset: true})
  })

  test('the outside agent reads the tool description and catalog, discovers a capability, and a call with no tab fails with its declared code', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shelf'], hubAccess: 'open'})
    const outside = engine.outside()

    const described = await outside.describe()
    expect(described.execute).toMatch(
      /^Run TypeScript in a secure sandbox wired to this project\. Every capability is an async external_\* function; call discover_tools first for their typed signatures\./,
    )
    expect(described.execute).toContain('shelf_count')
    expect(described.execute).not.toContain('shelf_reset')
    expect(described.discover).toMatch(
      /^Return the full TypeScript signature, description and declared errors of named sandbox capabilities\./,
    )

    const discovered = await outside.discover(['shelf_count'])
    expect(discovered.isError).toBeUndefined()
    expect(discovered.content).toContainEqual(
      expect.objectContaining({type: 'text', text: expect.stringContaining('Count the books on a shelf')}),
    )

    const refused = await outside.call('shelf_count', {shelf: 'poetry'})
    expect(refused.isError).toBe(true)
    expect(refused.content).toContainEqual(
      expect.objectContaining({type: 'text', text: expect.stringContaining('"code":"NO_TAB"')}),
    )
    expect(refused.content).toContainEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('NO_TAB: pass tab to execute_typescript; list_tabs lists the open tabs'),
      }),
    )
  })

  test('a malformed session header is refused', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shelf']})

    const refused = await fetch(`${engine.address.apiBase}/api/mcp`, {
      method: 'POST',
      headers: {'conciv-session-id': 'bad', 'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
    })
    expect(refused.status).toBe(400)
    expect(await refused.json()).toEqual({message: 'invalid session id (must be ours)'})
  })
})
