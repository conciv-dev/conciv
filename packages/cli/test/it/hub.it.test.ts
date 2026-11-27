import {describe, expect} from 'vitest'
import {z} from 'zod'
import {makeRpcClient} from '@conciv/client'
import {prepareHome, recordHubConnection, withHomeDb} from '@conciv/home'
import {test} from '../utils/hub-test.js'

describe('the hub', () => {
  test('an outside agent lists the open tabs, discovers and runs a tool with no tab, then starts work on a tab and hears it finished on its next reply, once, and a task-capable agent gets a working task that completes once the work is done', async ({
    createEngine,
    hub,
    taskHub,
  }) => {
    const BROWSER_TAB = 'tab_00000000-0000-4000-8000-000000000001'
    const SHELF_URL = 'http://localhost:5173/shelf'
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})
    withHomeDb(await prepareHome(engine.home), (db) => recordHubConnection(db, 'claude', Date.now()))
    const widget = makeRpcClient(engine.address.apiBase, {token: engine.address.token})
    const {sessionId} = await widget.sessions.create({})
    const changes = (await widget.tabs.changes())[Symbol.asyncIterator]()
    await changes.next()
    const widgetGone = new AbortController()
    const open = widget.tabs.open(
      {
        sessionId,
        connectionId: 'widget-1',
        tab: {id: BROWSER_TAB, url: SHELF_URL, title: 'Plant shelf', focused: true, visible: true},
      },
      {signal: widgetGone.signal},
    )
    await changes.next()
    const agent = await hub(engine.home)

    const tabs = await agent.callTool('list_tabs', {})
    expect(tabs.isError).toBeUndefined()
    expect(tabs.content).toEqual([{type: 'text', text: expect.any(String)}])
    const [listed] = tabs.content
    expect(JSON.parse(listed?.type === 'text' ? listed.text : '')).toMatchObject({
      tabs: [
        {
          tab: sessionId,
          href: SHELF_URL,
          pageTitle: 'Plant shelf',
          state: 'visible',
          browserTabs: [{id: BROWSER_TAB, href: SHELF_URL, pageTitle: 'Plant shelf', state: 'visible'}],
        },
      ],
      unreachable: [],
    })

    const discovered = await agent.callTool('discover_tools', {toolNames: ['shelf_label']})
    expect(discovered.isError).toBeUndefined()
    expect(discovered.content).toEqual([
      {type: 'text', text: expect.stringContaining('Print a label for a plant on the shelf')},
    ])

    const executed = await agent.callTool('execute_typescript', {typescriptCode: "return 'fern'"})
    expect(executed.isError).toBeUndefined()
    expect(executed.content).toEqual([{type: 'text', text: JSON.stringify({result: 'fern', logs: []})}])

    const watering = await agent.callTool('execute_typescript', {
      typescriptCode: "return await external_shelf_water({plant: 'fern'})",
      tab: sessionId,
    })
    expect(watering.isError).toBeUndefined()
    expect(watering.content).toContainEqual({
      type: 'text',
      text: JSON.stringify({result: {plant: 'fern', watering: true}, logs: []}),
    })

    await expect(engine.rpc.call('plant-shelf', 'watered', {plant: 'fern'})).resolves.toEqual({plant: 'fern', told: 1})
    const told = await agent.callTool('discover_tools', {toolNames: ['shelf_label'], tab: sessionId})
    expect(told.content).toEqual([
      {type: 'text', text: 'fern is watered'},
      {type: 'text', text: expect.stringContaining('Print a label for a plant on the shelf')},
    ])
    const again = await agent.callTool('discover_tools', {toolNames: ['shelf_label'], tab: sessionId})
    expect(again.content).toEqual([
      {type: 'text', text: expect.stringContaining('Print a label for a plant on the shelf')},
    ])

    const taskAgent = taskHub(engine.home)
    const started = await taskAgent.request('tools/call', {
      name: 'execute_typescript',
      arguments: {typescriptCode: "return await external_shelf_water({plant: 'ivy'})", tab: sessionId},
    })
    expect(started).toMatchObject({resultType: 'task', status: 'working', content: []})
    const {taskId} = z.object({taskId: z.string().startsWith('tsk_')}).parse(started)
    await expect(taskAgent.request('tasks/get', {taskId})).resolves.toMatchObject({taskId, status: 'working'})
    await expect(engine.rpc.call('plant-shelf', 'watered', {plant: 'ivy'})).resolves.toEqual({plant: 'ivy', told: 1})
    await expect(taskAgent.request('tasks/get', {taskId})).resolves.toMatchObject({
      taskId,
      status: 'completed',
      result: {
        content: expect.arrayContaining([
          {type: 'text', text: JSON.stringify({result: {plant: 'ivy', watering: true}, logs: []})},
          {type: 'text', text: 'ivy is watered'},
        ]),
      },
    })

    widgetGone.abort()
    await expect(open).rejects.toThrow()
  })
})
