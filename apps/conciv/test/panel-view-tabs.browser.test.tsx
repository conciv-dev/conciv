import './helpers/utilities.css'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {page} from 'vitest/browser'
import type {JSX} from 'solid-js'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootedCore} from './helpers/booted-core.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, runTurn} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'
import {VIRTUALIZE_THRESHOLD} from '@conciv/ui-kit-chat'

const SUBSCRIBE_PATH = ['chat', 'subscribe']
const NOTES_BODY = 'the notes view body'
const REPLY_TEXT = 'the transcript that outlives a tab switch'
const LONG_REPLY_TEXT = 'the last turn of a virtualized transcript'
const SEEDED_EXCHANGES = Math.ceil((VIRTUALIZE_THRESHOLD + 1) / 2)

function NotesView(): JSX.Element {
  return <p>{NOTES_BODY}</p>
}

const notesExtension = defineExtension({
  name: 'panel-view-survival',
  views: [{id: 'notes', label: 'Notes', Component: NotesView}],
})

const coreBase = bootedCore('panel-view-tabs')
const harness = createShellHarness(coreBase)
const faults = trackedFaults()

afterEach(harness.dispose)

const reply = () => page.getByText(REPLY_TEXT)
const longReply = () => page.getByText(LONG_REPLY_TEXT)
const notes = () => page.getByText(NOTES_BODY)
const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
const chatTab = () => page.getByRole('tab', {name: 'Chat', exact: true})
const notesTab = () => page.getByRole('tab', {name: 'Notes', exact: true})
const panel = () => page.getByRole('tabpanel')

function elementById(node: Node, id: string): Element | null {
  const root = node.getRootNode()
  if (root instanceof ShadowRoot) return root.getElementById(id)
  if (root instanceof Document) return root.getElementById(id)
  return null
}

async function mountSeededPanel(): Promise<void> {
  const rpc = coreRpc(coreBase())
  const sessionId = await createSession(rpc)
  await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
  await runTurn(coreBase(), sessionId, 'seed the transcript')
  harness.mountShell(`/panel/${sessionId}?open=true`, [notesExtension])
}

function expectTabOwnsPanel(tab: Element, panelElement: Element): void {
  const controls = tab.getAttribute('aria-controls')
  expect(controls, 'the selected tab names the panel it controls').toBe(panelElement.id)
  expect(panelElement.getAttribute('aria-labelledby'), 'the panel names the tab that labels it').toBe(tab.id)
  expect(controls === null ? null : elementById(tab, controls), 'the idref resolves to that panel').toBe(panelElement)
}

test('the panel keeps its chat stream alive across a view tab round trip', async () => {
  await mountSeededPanel()

  await expect.element(reply(), {timeout: 8000}).toBeVisible()

  await notesTab().click()
  await expect.element(notes(), {timeout: 8000}).toBeVisible()

  const gate = await faults.install({kind: 'gate', path: SUBSCRIBE_PATH})
  await chatTab().click()

  await expect.element(reply(), {timeout: 8000}).toBeVisible()
  await expect.element(skeleton()).not.toBeInTheDocument()

  await coreControl.releaseFault(gate)
}, 30_000)

test('a virtualized transcript survives a view tab round trip', async () => {
  const rpc = coreRpc(coreBase())
  const sessionId = await createSession(rpc)
  for (let index = 0; index < SEEDED_EXCHANGES - 1; index += 1) {
    await coreControl.scriptTurn({toolCalls: [], text: `seeded answer ${index}`})
    await runTurn(coreBase(), sessionId, `seeded question ${index}`)
  }
  await coreControl.scriptTurn({toolCalls: [], text: LONG_REPLY_TEXT})
  await runTurn(coreBase(), sessionId, 'the last question')
  harness.mountShell(`/panel/${sessionId}?open=true`, [notesExtension])

  await expect.element(longReply(), {timeout: 8000}).toBeVisible()

  await notesTab().click()
  await expect.element(notes(), {timeout: 8000}).toBeVisible()

  await chatTab().click()
  await expect.element(longReply(), {timeout: 8000}).toBeVisible()
}, 60_000)

test('each view tab points at the panel that renders it', async () => {
  await mountSeededPanel()

  await expect.element(reply(), {timeout: 8000}).toBeVisible()
  await expect.element(panel(), {timeout: 8000}).toBeVisible()
  expectTabOwnsPanel(chatTab().element(), panel().element())

  await notesTab().click()
  await expect.element(notes(), {timeout: 8000}).toBeVisible()
  await expect.element(panel(), {timeout: 8000}).toBeVisible()
  expectTabOwnsPanel(notesTab().element(), panel().element())
}, 30_000)

describe('a crashing extension', () => {
  const CALM_CARD_BODY = 'the calm card body'
  const CALM_SURFACE_BODY = 'the calm surface body'
  const CALM_SLOT_BODY = 'the calm slot body'
  const RECOVERED_BODY = 'the recovered tab body'
  const AFTER_TOOLS_TEXT = 'the thread kept going after the tools'
  const CARD_FAILED = 'This card failed to render'
  const TOOL_SHAPE = {description: 'a fixture tool', inputSchema: z.object({}), outputSchema: z.object({})}
  const tabCrash = {armed: true}

  const crashReports = (name: string): number =>
    vi.mocked(console.error).mock.calls.filter((call) => call[0] === `[conciv] extension "${name}" crashed`).length

  function boom(): JSX.Element {
    throw new Error('fixture crash')
  }

  function CrashingTab(): JSX.Element {
    if (tabCrash.armed) boom()
    return <p>{RECOVERED_BODY}</p>
  }

  const crashingTab = defineExtension({
    name: 'crash-tab',
    views: [{id: 'crashing', label: 'Crashing', Component: CrashingTab}],
  })
  const crashingIcon = defineExtension({
    name: 'crash-icon',
    views: [{id: 'iconic', label: 'Iconic', icon: boom, Component: NotesView}],
  })
  const crashingSurface = defineExtension({name: 'crash-surface', Surface: boom})
  const calmSurface = defineExtension({name: 'calm-surface', Surface: () => <p>{CALM_SURFACE_BODY}</p>})
  const crashingSlot = defineExtension({name: 'crash-slot', Component: boom})
  const calmSlot = defineExtension({name: 'calm-slot', Component: () => <p>{CALM_SLOT_BODY}</p>})
  const crashingCard = defineExtension({
    name: 'crash-card',
    tools: [
      defineTool({name: 'crash_card', display: 'standalone', ...TOOL_SHAPE}).render({
        render: boom,
        hasEmbeddedBody: () => true,
      }),
      defineTool({name: 'calm_card', display: 'standalone', ...TOOL_SHAPE}).render({
        render: () => <p>{CALM_CARD_BODY}</p>,
        hasEmbeddedBody: () => true,
      }),
      defineTool({name: 'crash_predicate', ...TOOL_SHAPE}).render({
        render: () => <p>{CALM_CARD_BODY}</p>,
        hasEmbeddedBody: () => {
          throw new Error('fixture crash')
        },
      }),
    ],
  })

  async function mountAfterTurn(
    toolCalls: {name: string; input: Record<string, unknown>}[],
    extensions: Parameters<typeof harness.mountShell>[1],
  ): Promise<void> {
    const sessionId = await createSession(coreRpc(coreBase()))
    await coreControl.scriptTurn({toolCalls, text: AFTER_TOOLS_TEXT})
    await runTurn(coreBase(), sessionId, 'run the fixture tools')
    harness.mountShell(`/panel/${sessionId}?open=true`, extensions)
  }

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const retry = () => page.getByRole('button', {name: 'Retry'})

  afterEach(() => {
    tabCrash.armed = true
    vi.restoreAllMocks()
  })

  test('a throwing tab shows its fallback, Retry re-mounts it, and chat stays usable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountAfterTurn([], [crashingTab])
    const crashed = () => page.getByText('The crash-tab extension crashed')

    await expect.element(page.getByRole('tab', {name: 'Crashing', exact: true}), {timeout: 8000}).toBeVisible()
    await page.getByRole('tab', {name: 'Crashing', exact: true}).click()

    await expect.element(crashed(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByText('Details are in the browser console.')).toBeVisible()
    await page.screenshot({path: '__screenshots__/extension-boundary/tab-fallback.png'})
    expect(crashReports('crash-tab')).toBe(1)

    await retry().click()
    await expect.element(crashed()).toBeVisible()
    expect(crashReports('crash-tab')).toBe(2)

    tabCrash.armed = false
    await retry().click()
    await expect.element(page.getByText(RECOVERED_BODY)).toBeVisible()
    await expect.element(crashed()).not.toBeInTheDocument()

    await chatTab().click()
    await expect.element(page.getByText(AFTER_TOOLS_TEXT), {timeout: 8000}).toBeVisible()
    await expect.element(editor()).toBeVisible()
  }, 30_000)

  test('a throwing view icon leaves the status bar with its tab label', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountAfterTurn([], [crashingIcon])

    await expect.element(page.getByRole('tab', {name: 'Iconic', exact: true}), {timeout: 8000}).toBeVisible()
    await expect.element(editor()).toBeVisible()
    expect(crashReports('crash-icon')).toBe(1)
  }, 30_000)

  test('a throwing tool card leaves the thread and the other cards intact', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountAfterTurn(
      [
        {name: 'crash_card', input: {}},
        {name: 'calm_card', input: {}},
      ],
      [crashingCard],
    )

    await expect.element(page.getByText(CARD_FAILED), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByText('crash-card')).toBeVisible()
    await expect.element(page.getByText(CALM_CARD_BODY)).toBeVisible()
    await expect.element(page.getByText(AFTER_TOOLS_TEXT)).toBeVisible()
    await expect.element(editor()).toBeVisible()
    await page.screenshot({path: '__screenshots__/extension-boundary/card-fallback.png'})
    expect(crashReports('crash-card')).toBe(1)
  }, 30_000)

  test('a throwing card body predicate leaves the thread up', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountAfterTurn([{name: 'crash_predicate', input: {}}], [crashingCard])

    await expect.element(page.getByText(AFTER_TOOLS_TEXT), {timeout: 8000}).toBeVisible()
    await expect.element(editor()).toBeVisible()
    expect(crashReports('crash-card')).toBeGreaterThan(0)
  }, 30_000)

  test('a throwing Surface leaves the widget up and the other surfaces alive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountAfterTurn([], [crashingSurface, calmSurface])

    await expect.element(page.getByText(CALM_SURFACE_BODY), {timeout: 8000}).toBeVisible()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    expect(crashReports('crash-surface')).toBe(1)
  }, 30_000)

  test('a throwing slot leaves the composer up and reports the crash once per slot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountAfterTurn([], [crashingSlot, calmSlot])

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByText(CALM_SLOT_BODY).first(), {timeout: 8000}).toBeVisible()
    expect(crashReports('crash-slot')).toBeGreaterThan(0)
  }, 30_000)
})
