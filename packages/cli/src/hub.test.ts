import {describe, expect} from 'vitest'
import {z} from 'zod'
import {prepareHome, recordHubConnection, withHomeDb} from '@conciv/db'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../test/hub-test.js'

describe('the hub', () => {
  test('an outside agent lists the open tabs, discovers and runs code with no tab on the engine registered in the home, is told to pass a tab for a tool that needs a session, then queues page actions on a tab and reads the result of the queue on its next call', async ({
    hub,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})
    withHomeDb(await prepareHome(engine.home), (db) => recordHubConnection(db, 'claude', Date.now()))
    const agent = await hub(engine.home)

    const tabs = await agent.callTool('list_tabs', {})
    expect(tabs.isError).toBeUndefined()
    expect(tabs.content).toEqual([{type: 'text', text: JSON.stringify({tabs: [], unreachable: []})}])

    const discovered = await agent.callTool('discover_tools', {toolNames: ['shelf_label']})
    expect(discovered.isError).toBeUndefined()
    expect(discovered.content).toEqual([
      {type: 'text', text: expect.stringContaining('Print a label for a plant on the shelf')},
    ])

    const executed = await agent.callTool('execute_typescript', {typescriptCode: "return 'fern'"})
    expect(executed.isError).toBeUndefined()
    expect(executed.content).toEqual([{type: 'text', text: JSON.stringify({result: 'fern', logs: []})}])

    const sessionBound = await agent.callTool('execute_typescript', {
      typescriptCode: "return await external_shelf_label({plant: 'fern'})",
    })
    expect(sessionBound.isError).toBe(true)
    expect(sessionBound.content).toEqual([
      {type: 'text', text: expect.stringContaining('"code":"NO_SESSION"')},
      {type: 'text', text: 'pass tab to execute_typescript; list_tabs lists the open tabs'},
    ])

    const sessionId = engine.session.id
    const connectionId = 'shelf'
    const attached = await engine.event('rpc.experimental.page.control', {data: {type: 'attached', connectionId}})
    const attachment = engine.rpc
      .call('experimental.page', 'attach', {sessionId, connectionId, version: 1})
      .catch(() => 'closed')
    await attached.arrived
    await engine.rpc.call('experimental.page', 'state', {
      sessionId,
      connectionId,
      state: {
        id: 'tab_22222222-2222-4222-8222-222222222222',
        url: 'http://localhost:3000/shelf',
        title: 'Shelf',
        focused: true,
        visible: true,
      },
    })
    const command = await engine.event('rpc.experimental.page.control', {data: {type: 'command', connectionId}})
    const played = await engine.event('rpc.experimental.page.queue.finished')
    const queued = await agent.callTool('execute_typescript', {
      tab: sessionId,
      typescriptCode: "return await external_page_queue_async({actions: [{tool: 'page_click', selector: '#water'}]})",
    })
    const queuedText = z
      .array(z.object({text: z.string()}))
      .parse(queued.content)
      .map((part) => part.text)
      .join('\n')
    const queueId = /"queueId":"(q_[^"]+)","actions":1/.exec(queuedText)?.[1]
    expect(queueId).toBeDefined()
    const {requestId} = z.object({requestId: z.string()}).parse((await command.arrived).data)
    await engine.rpc.call('experimental.page', 'result', {
      sessionId,
      connectionId,
      requestId,
      outcome: {type: 'success', result: {value: null, files: []}},
    })
    await played.arrived

    const after = await agent.callTool('execute_typescript', {tab: sessionId, typescriptCode: "return 'watered'"})
    expect(after.content).toEqual([
      {type: 'text', text: expect.stringMatching(new RegExp(`^queue ${queueId} lost: 0 played, 0 failed\n`))},
      {type: 'text', text: JSON.stringify({result: 'watered', logs: []})},
    ])
    await engine.restart()
    expect(await attachment).toBe('closed')
  })
})
