import {realpathSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {z} from 'zod'
import {prepareHome, recordHubConnection, withHomeDb} from '@conciv/db'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../test/hub-test.js'

describe('the hub', () => {
  test('an outside agent lists the open tabs (none, then a tab with its project, branch and page), discovers and runs code with no tab on the engine registered in the home, is told to pass a tab for a tool that needs a session, then queues page actions on a tab and reads the result of the queue on its next call', async ({
    hub,
  }) => {
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-page', './test/fixtures/plugins/plant-shelf']},
      {git: true},
    )
    await writeFile(join(engine.root, 'package.json'), JSON.stringify({name: 'plant-shop'}))
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
    const listed = await agent.callTool('list_tabs', {})
    const listing = z
      .object({tabs: z.array(z.object({root: z.string()}).loose()), unreachable: z.array(z.unknown())})
      .parse(JSON.parse(z.tuple([z.object({text: z.string()})]).parse(listed.content)[0].text))
    expect(listing.tabs.map((row) => realpathSync(row.root))).toEqual([engine.root])
    expect(listing).toEqual({
      tabs: [
        {
          tab: sessionId,
          project: 'plant-shop',
          branch: 'main',
          root: expect.any(String),
          href: 'http://localhost:3000/shelf',
          pageTitle: 'Shelf',
          state: 'visible',
          sessionTitle: expect.any(String),
          lastActive: expect.any(String),
          running: false,
          harness: expect.any(String),
          browserTabs: [
            {
              id: 'tab_22222222-2222-4222-8222-222222222222',
              href: 'http://localhost:3000/shelf',
              pageTitle: 'Shelf',
              state: 'visible',
            },
          ],
        },
      ],
      unreachable: [],
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

  test('an engine without the page plugin lists no tabs and says a tab is not open; an engine whose page plugin answers outside the expected shape is named too old, and a session whose tabs cannot be read is listed with none', async ({
    hub,
  }) => {
    const bare = await createEngine({plugins: ['-conciv.page', './test/fixtures/plugins/plant-shelf']})
    withHomeDb(await prepareHome(bare.home), (db) => recordHubConnection(db, 'claude', Date.now()))
    const agent = await hub(bare.home)
    const tab = bare.session.id

    const none = await agent.callTool('list_tabs', {})
    expect(none.isError).toBeUndefined()
    expect(none.content).toEqual([{type: 'text', text: JSON.stringify({tabs: [], unreachable: []})}])

    const notOpen = await agent.callTool('execute_typescript', {tab, typescriptCode: "return 'fern'"})
    expect(notOpen.isError).toBe(true)
    expect(notOpen.content).toEqual([{type: 'text', text: `TAB_NOT_OPEN: tab ${tab} is not open; call list_tabs`}])

    const old = await createEngine({plugins: ['-conciv.page', './test/fixtures/plugins/old-page']}, {home: bare.home})
    const listed = await agent.callTool('list_tabs', {})
    const listing = z
      .object({tabs: z.array(z.unknown()), unreachable: z.array(z.object({root: z.string(), error: z.string()}))})
      .parse(JSON.parse(z.tuple([z.object({text: z.string()})]).parse(listed.content)[0].text))
    expect(listing.unreachable.map((entry) => realpathSync(entry.root))).toEqual([realpathSync(old.root)])
    const [tooOld] = listing.unreachable
    expect(listing).toEqual({
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
      {plugins: ['-conciv.page', './test/fixtures/plugins/broken-page']},
      {home: bare.home},
    )
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
