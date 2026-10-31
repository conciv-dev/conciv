import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {z} from 'zod'
import {render} from '@solidjs/testing-library'
import type {RouterClient} from '@orpc/server'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'
import type {ToolCatalogView, ToolViewCtx, ToolCardProps, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {HostApiProvider} from '@conciv/extension/host'
import {CardChromeProvider} from '@conciv/ui-kit-chat/tools'
import type {TestRunnerRouter} from '../src/server.js'
import {TestCard} from '../src/tool/card.js'

describe('fixture socket', () => {
  const FixtureAddressSchema = z.object({base: z.string(), wsUrl: z.string()})

  async function fixtureAddress(): Promise<z.infer<typeof FixtureAddressSchema>> {
    const payload: unknown = await fetch('/__test-runner-fixture').then((response) => response.json())
    return FixtureAddressSchema.parse(payload)
  }

  async function openFixtureSocket(): Promise<{client: RouterClient<TestRunnerRouter>; socket: WebSocket}> {
    const socket = new WebSocket((await fixtureAddress()).wsUrl)
    return {client: rpcOverWebsocket<RouterClient<TestRunnerRouter>>(socket, {path: ['ext', 'test-runner']}), socket}
  }

  describe('the test-runner vite fixture serves rpc over a real websocket upgrade', () => {
    it('answers a unary procedure over the socket with the same payload as the fetch mount', async () => {
      const {client, socket} = await openFixtureSocket()
      const overSocket = await client.status({})
      const overFetch: unknown = await fetch(`${(await fixtureAddress()).base}/rpc/ext/test-runner/status`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({json: {}}),
      }).then((response) => response.json())
      expect(overSocket.summary).toEqual({passed: 3, failed: 1, skipped: 0, durationMs: 4})
      expect(JSON.stringify(overFetch)).toContain('"passed":3')
      socket.close()
    })

    it('streams the fixture run events over the socket iterator', async () => {
      const {client, socket} = await openFixtureSocket()
      const abort = new AbortController()
      const stream = await client.stream({}, {signal: abort.signal})
      const seen: string[] = []
      for await (const event of stream) {
        seen.push(event.type)
        if (event.type === 'run-end') break
      }
      abort.abort()
      expect(seen).toContain('run-start')
      expect(seen).toContain('test')
      expect(seen.at(-1)).toBe('run-end')
      socket.close()
    })

    it('delivers each event as it happens instead of one batch at the end of the run', async () => {
      const {client, socket} = await openFixtureSocket()
      const abort = new AbortController()
      const stream = await client.stream({}, {signal: abort.signal})
      const opened = performance.now()
      const arrivals: {type: string; at: number}[] = []
      for await (const event of stream) {
        arrivals.push({type: event.type, at: performance.now() - opened})
        if (event.type === 'run-end') break
      }
      abort.abort()
      socket.close()
      const firstTest = arrivals.find((arrival) => arrival.type === 'test')
      const runEnd = arrivals.find((arrival) => arrival.type === 'run-end')
      if (!firstTest || !runEnd)
        throw new Error(`stream ended without a test and a run-end: ${JSON.stringify(arrivals)}`)
      expect(runEnd.at - firstTest.at).toBeGreaterThan(1_000)
    })
  })
})

describe('test card', () => {
  const FILE = '/proj/app/math.test.ts'
  const STACK = 'at add (app/math.ts:12:9)\nat app/math.test.ts:4:3'
  const FAILURE = {file: FILE, name: 'adds', message: 'expected 2 to be 3', stack: STACK, line: 4}
  const RESULT = {
    summary: {passed: 1, failed: 1, skipped: 0, durationMs: 5},
    failures: [FAILURE],
    tests: [
      {id: 'r-subtracts', file: FILE, name: 'subtracts', state: 'pass', durationMs: 1},
      {id: 'r-adds', file: FILE, name: 'adds', state: 'fail', durationMs: 1, error: FAILURE},
    ],
  }

  const TOOL_META: ToolViewMeta = {
    summary: 'drive the live test runner',
    icon: 'script',
    label: {running: 'Running the tests', done: 'Ran the tests'},
    mutating: false,
    mirrors: false,
  }

  const catalog: ToolCatalogView = {
    loaded: () => true,
    meta: (name) => (name === 'test_runner' ? TOOL_META : undefined),
  }

  function makeCtx(sent: string[]): ToolViewCtx {
    return {
      apiBase: '',
      harnessId: 'claude',
      sendMessage: (text) => sent.push(text),
      addResult: () => {},
      catalog,
    }
  }

  function mountCard(
    over: Partial<ToolCardProps>,
    ctx: ToolViewCtx,
    onOpenEditor?: (file: string) => void,
    embedded = false,
  ): void {
    const part = {
      type: 'tool-call',
      id: 't1',
      name: 'test_runner',
      arguments: '{"action":"run"}',
      state: 'input-complete',
    } as const
    if (embedded) {
      render(() => (
        <HostApiProvider openEditor={(file) => onOpenEditor?.(file)}>
          <CardChromeProvider value="embedded">
            <TestCard part={part} result={undefined} ctx={ctx} addResult={() => {}} {...over} />
          </CardChromeProvider>
        </HostApiProvider>
      ))
      return
    }
    render(() => (
      <HostApiProvider openEditor={(file) => onOpenEditor?.(file)}>
        <TestCard part={part} result={undefined} ctx={ctx} addResult={() => {}} {...over} />
      </HostApiProvider>
    ))
  }

  function completedRun(): Partial<ToolCardProps> {
    return {result: {type: 'tool-result', toolCallId: 't1', content: JSON.stringify(RESULT), state: 'complete'}}
  }

  const TIMED_RESULT = {
    summary: {passed: 2, failed: 0, skipped: 0, durationMs: 999},
    failures: [],
    tests: [
      {id: 'timed-1', file: FILE, name: 'runs quickly', state: 'pass', durationMs: 42},
      {id: 'timed-2', file: FILE, name: 'runs slowly', state: 'pass', durationMs: 777},
    ],
  }

  function timedRun(): Partial<ToolCardProps> {
    return {result: {type: 'tool-result', toolCallId: 't1', content: JSON.stringify(TIMED_RESULT), state: 'complete'}}
  }

  describe('TestCard (real browser)', () => {
    it('titles the card from the catalog label and lists every test row', async () => {
      mountCard(completedRun(), makeCtx([]))

      await expect.element(page.getByText('Ran the tests')).toBeVisible()
      await expect.element(page.getByText('1 passed', {exact: true})).toBeVisible()
      await expect.element(page.getByText('1 failed', {exact: true})).toBeVisible()
      await expect.element(page.getByText('subtracts')).toBeVisible()
    })

    it('announces the run summary in a live region', async () => {
      mountCard(completedRun(), makeCtx([]))

      await expect.element(page.getByRole('status')).toMatchTextContent('1 passed, 1 failed')
    })

    it('expands a failure into its message, stack and the open/fix actions', async () => {
      const sent: string[] = []
      mountCard(completedRun(), makeCtx(sent))

      await page.getByRole('button', {name: /adds/}).click()
      await expect.element(page.getByText('app/math.test.ts:4', {exact: true})).toBeVisible()
      await expect.element(page.getByText('expected 2 to be 3', {exact: true})).toBeVisible()

      await expect.element(page.getByRole('button', {name: /Open app\/math\.test\.ts:4/})).toBeVisible()
      await page.getByRole('button', {name: 'Fix this'}).click()
      expect(sent[0]).toContain('adds')
    })

    it('collapses a file section to hide its test rows', async () => {
      mountCard(completedRun(), makeCtx([]))

      await expect.element(page.getByText('subtracts')).toBeVisible()
      await page.getByRole('button', {name: /app\/math\.test\.ts/}).click()
      await expect.element(page.getByText('subtracts')).not.toBeVisible()
    })

    it('opens a real stream and builds the tree live when result is null', async () => {
      mountCard({result: undefined}, makeCtx([]))

      await expect.element(page.getByText('works')).toBeVisible()
      await expect.element(page.getByText('broken')).toBeVisible()
      await expect.element(page.getByText('3 passed', {exact: true})).toBeVisible()
      await expect.element(page.getByText('1 failed', {exact: true})).toBeVisible()
      await expect.element(page.getByRole('status')).toMatchTextContent('Test run finished: 3 passed, 1 failed')
    })

    it('shows finished rows and a ticking count while the run is still in flight', async () => {
      mountCard({result: undefined}, makeCtx([]))

      await expect.element(page.getByText('works')).toBeVisible()
      await expect.element(page.getByText('broken')).toBeVisible()
      await expect.element(page.getByRole('status')).toMatchTextContent('Test run in progress: 3 passed, 1 failed')
    })

    it('keeps two streamed tests that share a title as separate live rows', async () => {
      mountCard({result: undefined}, makeCtx([]))

      await expect.element(page.getByRole('status')).toMatchTextContent('Test run in progress: 3 passed, 1 failed')
      expect(page.getByText('shares a title').elements()).toHaveLength(2)
    })

    it('shows each test row its own duration', async () => {
      mountCard(timedRun(), makeCtx([]))

      await expect.element(page.getByText('runs quickly')).toBeVisible()
      await expect.element(page.getByText('42ms', {exact: true})).toBeVisible()
      await expect.element(page.getByText('runs slowly')).toBeVisible()
      await expect.element(page.getByText('777ms', {exact: true})).toBeVisible()
    })

    it('renders the input chips when shown as a standalone card', async () => {
      mountCard(completedRun(), makeCtx([]))

      await expect.element(page.getByText('action')).toBeVisible()
    })

    it('drops the raw input-chip row when embedded in the trace, keeping the record rows', async () => {
      mountCard(completedRun(), makeCtx([]), undefined, true)

      await expect.element(page.getByText('subtracts')).toBeVisible()
      await expect.element(page.getByText('1 passed', {exact: true})).toBeVisible()
      expect(page.getByText('action').elements()).toHaveLength(0)
    })
  })
})
