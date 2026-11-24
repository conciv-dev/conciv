import {realpathSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {z} from 'zod'
import {prepareHome, recordHubConnection, withHomeDb} from '@conciv/db'
import {test} from '../test/cli.js'

describe('the hub', () => {
  test('on the engine registered in the home, with no tab, an outside agent discovers and runs code and is told to pass a tab for a tool that needs a session; an engine without the page plugin lists no tabs and says a tab is not open, an engine whose page plugin answers outside the expected shape is named too old, and a session whose tabs cannot be read is listed with none, under the name in its package.json and its git branch', async ({
    createEngine,
    hub,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})
    withHomeDb(await prepareHome(engine.home), (db) => recordHubConnection(db, 'claude', Date.now()))
    const agent = await hub(engine.home)
    const tab = engine.session.id

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

    const none = await agent.callTool('list_tabs', {})
    expect(none.isError).toBeUndefined()
    expect(none.content).toEqual([{type: 'text', text: JSON.stringify({tabs: [], unreachable: []})}])

    const notOpen = await agent.callTool('execute_typescript', {tab, typescriptCode: "return 'fern'"})
    expect(notOpen.isError).toBe(true)
    expect(notOpen.content).toEqual([{type: 'text', text: `TAB_NOT_OPEN: tab ${tab} is not open; call list_tabs`}])

    const old = await createEngine({plugins: ['./test/fixtures/plugins/old-page']}, {home: engine.home})
    const oldListed = await agent.callTool('list_tabs', {})
    const oldListing = z
      .object({tabs: z.array(z.unknown()), unreachable: z.array(z.object({root: z.string(), error: z.string()}))})
      .parse(JSON.parse(z.tuple([z.object({text: z.string()})]).parse(oldListed.content)[0].text))
    expect(oldListing.unreachable.map((entry) => realpathSync(entry.root))).toEqual([realpathSync(old.root)])
    const [tooOld] = oldListing.unreachable
    expect(oldListing).toEqual({
      tabs: [],
      unreachable: [{root: tooOld?.root, error: 'engine too old; upgrade its @conciv packages'}],
    })

    const unknown = await agent.callTool('execute_typescript', {tab, typescriptCode: "return 'fern'"})
    expect(unknown.isError).toBe(true)
    expect(unknown.content).toEqual([
      {
        type: 'text',
        text: `cannot tell whether tab ${tab} is open: no engine that answered has it, and ${tooOld?.root} (engine too old; upgrade its @conciv packages); nothing ran`,
      },
    ])

    const broken = await createEngine(
      {plugins: ['./test/fixtures/plugins/broken-page']},
      {home: engine.home, git: true},
    )
    await writeFile(join(broken.root, 'package.json'), JSON.stringify({name: 'plant-shop'}))
    await broken.rpc.call('experimental.page', 'attach', {sessionId: broken.session.id})
    const withBroken = await agent.callTool('list_tabs', {})
    const brokenListing = z
      .object({tabs: z.array(z.object({root: z.string()}).loose()), unreachable: z.array(z.unknown())})
      .parse(JSON.parse(z.tuple([z.object({text: z.string()})]).parse(withBroken.content)[0].text))
    expect(brokenListing.tabs.map((row) => realpathSync(row.root))).toEqual([realpathSync(broken.root)])
    expect(brokenListing).toEqual({
      tabs: [
        {
          tab: broken.session.id,
          project: 'plant-shop',
          branch: 'main',
          root: expect.any(String),
          sessionTitle: expect.any(String),
          lastActive: expect.any(String),
          running: false,
          harness: expect.any(String),
          browserTabs: [],
        },
      ],
      unreachable: [{root: tooOld?.root, error: 'engine too old; upgrade its @conciv packages'}],
    })
  })
})
