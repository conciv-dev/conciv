import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {bootedCore} from './helpers/booted-core.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, runTurn} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'

const ALPHA_REPLY = 'the alpha transcript that must survive a session switch'
const BETA_REPLY = 'the beta transcript that must survive a session switch'
const PANEL_SELECTOR = 'section[data-conciv-panel]'
const PANE_ROOT_CLASS = 'contents'

const coreBase = bootedCore('session-switch-suspense')
const harness = createShellHarness(coreBase)

afterEach(harness.dispose)

type PaneRootWatch = {reinserts: () => number; stop: () => void}

function isPaneRoot(node: Node): boolean {
  return node instanceof HTMLElement && node.classList.contains(PANE_ROOT_CLASS)
}

function watchPaneRootReinserts(): PaneRootWatch {
  const panel = document.querySelector(PANEL_SELECTOR)
  if (!panel) throw new Error('the chat panel is not mounted')
  const detached = new Set<Node>()
  const seen = {reinserts: 0}
  const collect = (records: MutationRecord[]): void => {
    for (const entry of records) {
      for (const node of entry.removedNodes) {
        if (isPaneRoot(node)) detached.add(node)
      }
      for (const node of entry.addedNodes) {
        if (detached.has(node)) seen.reinserts += 1
      }
    }
  }
  const observer = new MutationObserver(collect)
  observer.observe(panel, {childList: true})
  return {
    reinserts: () => {
      collect(observer.takeRecords())
      return seen.reinserts
    },
    stop: () => observer.disconnect(),
  }
}

async function seedSession(base: string, rpc: ReturnType<typeof coreRpc>, reply: string): Promise<string> {
  const sessionId = await createSession(rpc)
  await coreControl.scriptTurn({toolCalls: [], text: reply})
  await runTurn(base, sessionId, 'seed the transcript')
  return sessionId
}

test('switching sessions never re-suspends a live pane over the router pending fallback', async () => {
  const base = coreBase()
  const rpc = coreRpc(base)
  const alpha = await seedSession(base, rpc, ALPHA_REPLY)
  const beta = await seedSession(base, rpc, BETA_REPLY)

  harness.mountShell(`/panel/${alpha}?open=true`)
  await expect.element(page.getByText(ALPHA_REPLY), {timeout: 15_000}).toBeVisible()

  const watch = watchPaneRootReinserts()
  const switches = [
    {sessionId: beta, reply: BETA_REPLY},
    {sessionId: alpha, reply: ALPHA_REPLY},
    {sessionId: beta, reply: BETA_REPLY},
    {sessionId: alpha, reply: ALPHA_REPLY},
  ]
  for (const step of switches) {
    harness.navigateToSession(step.sessionId)
    await expect.element(page.getByText(step.reply), {timeout: 15_000}).toBeVisible()
  }
  const reinserts = watch.reinserts()
  watch.stop()

  expect(reinserts, 'a session switch must not detach and re-insert the same pane root').toBe(0)
}, 60_000)
