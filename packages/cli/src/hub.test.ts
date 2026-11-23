import {realpathSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {z} from 'zod'
import {makeRpcClient} from '@conciv/contract'
import {prepareHome, recordHubConnection, withHomeDb} from '@conciv/db'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../test/hub-test.js'

describe('the hub', () => {
  test('an outside agent lists the open tabs (none, then a tab with its project, branch and page), discovers and runs code with no tab on the engine registered in the home, is told to pass a tab for a tool that needs a session, then queues page actions on a tab and reads the result of the queue on its next call; a tasks client running two queueing calls at once gets a task per call holding only its own queue, and a task whose engine restarted ends failed naming the lost queue', async ({
    hub,
    tasksHub,
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
    const instructions = await makeRpcClient(engine.address.apiBase, {
      token: engine.address.token,
    }).sessions.instructions({sessionId})
    expect(z.array(z.unknown()).parse(queued.content)[0]).toEqual({type: 'text', text: instructions.text})
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
    const tasks = tasksHub(engine.home)
    const TaskSchema = z.object({resultType: z.literal('task'), taskId: z.string(), status: z.literal('working')})
    const CompletedSchema = z.object({
      status: z.literal('completed'),
      result: z.object({content: z.array(z.object({text: z.string()}))}),
    })
    const queueTask = async (selector: string) =>
      TaskSchema.parse(
        await tasks.request('tools/call', {
          name: 'execute_typescript',
          arguments: {
            tab: sessionId,
            typescriptCode: `return await external_page_queue_async({actions: [{tool: 'page_click', selector: '${selector}'}]})`,
          },
        }),
      )
    const pollTask = (taskId: string) => tasks.request('tasks/get', {taskId})
    const refuse = async (waited: Promise<{data: unknown}>) => {
      const refused = z.object({requestId: z.string()}).parse((await waited).data)
      await engine.rpc.call('experimental.page', 'result', {
        sessionId,
        connectionId,
        requestId: refused.requestId,
        outcome: {type: 'failure', code: 'closed', message: 'the shelf is closed'},
      })
    }
    const ownQueues = (completed: unknown) => {
      const texts = CompletedSchema.parse(completed).result.content.map((part) => part.text)
      const handed = texts.flatMap((text) => /"queueId":"(q_[^"]+)","actions":1/.exec(text)?.[1] ?? [])
      const noticed = texts.flatMap((text) => /^queue (q_\S+) lost: 0 played, 0 failed\n/.exec(text)?.[1] ?? [])
      return {handed, noticed}
    }

    const firstCommand = await engine.event('rpc.experimental.page.control', {data: {type: 'command', connectionId}})
    const [feed, prune] = await Promise.all([queueTask('#feed'), queueTask('#prune')])
    const firstFinished = await engine.event('rpc.experimental.page.queue.finished')
    const secondCommand = await engine.event('rpc.experimental.page.control', {data: {type: 'command', connectionId}})
    await refuse(firstCommand.arrived)
    await firstFinished.arrived
    const secondFinished = await engine.event('rpc.experimental.page.queue.finished')
    await refuse(secondCommand.arrived)
    await secondFinished.arrived
    const fed = ownQueues(await pollTask(feed.taskId))
    const pruned = ownQueues(await pollTask(prune.taskId))
    expect(fed.handed).toHaveLength(1)
    expect(pruned.handed).toHaveLength(1)
    expect(fed.noticed).toEqual(fed.handed)
    expect(pruned.noticed).toEqual(pruned.handed)
    expect(fed.handed).not.toEqual(pruned.handed)

    const stranded = await queueTask('#water')
    expect(await pollTask(stranded.taskId)).toMatchObject({taskId: stranded.taskId, status: 'working'})
    await engine.restart()
    expect(await attachment).toBe('closed')
    const lost = await pollTask(stranded.taskId)
    expect(lost).toEqual({
      _meta: {'io.modelcontextprotocol/serverInfo': {name: 'conciv-hub', version: expect.any(String)}},
      resultType: 'complete',
      taskId: stranded.taskId,
      createdAt: expect.any(String),
      ttlMs: 3_600_000,
      status: 'failed',
      lastUpdatedAt: expect.any(String),
      statusMessage: expect.stringMatching(
        /^queue q_\S+ was lost: the engine holding the tab no longer has it \(it restarted\), so its actions may have partly run$/,
      ),
    })
    expect(await pollTask(stranded.taskId)).toEqual(lost)
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
