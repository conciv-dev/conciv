import {describe, expect} from 'vitest'
import {prepareHome, recordHubConnection, withHomeDb} from '@conciv/db'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../utils/hub-test.js'

describe('the hub', () => {
  test('an outside agent lists the open tabs, then discovers and runs a tool with no tab on the engine registered in the home', async ({
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
  })
})
