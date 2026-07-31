import '@conciv/ui-kit-system/tokens.css'
import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import axe from 'axe-core'
import type {LiveSession} from '@conciv/contract'
import {ConnectDialog} from '../src/composer/connect/connect-dialog.js'
import type {ConnectStep} from '../src/composer/connect/connect-steps.js'
import {ATTACHED_MESSAGE, type Conflict} from '../src/chat/conflict.js'
import {TerminalConflictDialog} from '../src/chat/terminal-conflict-dialog.js'
import {liveSession} from './helpers/live-session.js'

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const ADOPTED = {
  concivSessionId: 'conciv_9',
  harnessSessionId: 'sess-1',
  title: 'the older one',
  reloadCommand: '/reload-plugins --force',
}

function hostFor(view: () => ReturnType<typeof ConnectDialog>): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(view, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
}

function showPicker(step: ConnectStep, candidates: LiveSession[] | undefined, failure: string | null = null): void {
  hostFor(() => (
    <ConnectDialog
      step={step}
      harnessName="Claude"
      candidates={candidates}
      arrived={0}
      loading={false}
      refreshing={false}
      failure={failure}
      stale={false}
      checkedAt={Date.now() - 4_000}
      connectingId={null}
      dialledIn={false}
      contactLost={false}
      unreachable={false}
      onPick={() => {}}
      onClose={() => {}}
      onRetry={() => {}}
      onRefresh={() => {}}
      onLaunch={() => {}}
      onBack={() => {}}
      onDone={() => {}}
      onKeepWaiting={() => {}}
      onHandBack={() => {}}
    />
  ))
}

function showConflict(conflict: Conflict): void {
  hostFor(() => (
    <TerminalConflictDialog conflict={conflict} onCancel={() => {}} onTakeOver={() => {}} onSendAnyway={() => {}} />
  ))
}

function readable(violations: axe.Result[]): string {
  return violations
    .map((violation) => {
      const where = violation.nodes.map((node) => `    ${node.html}`).join('\n')
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${where}`
    })
    .join('\n')
}

async function auditOf(role: 'dialog' | 'alertdialog'): Promise<string> {
  const surface = page.getByRole(role)
  await expect.element(surface).toBeVisible()
  const report = await axe.run(surface.element(), {resultTypes: ['violations']})
  return readable(report.violations)
}

test('the picker with sessions to choose from has no accessibility violations', async () => {
  showPicker({kind: 'picking', error: null, retryId: null}, [liveSession(), liveSession({sessionId: 'sess-2'})])

  expect(await auditOf('dialog')).toBe('')
})

test('the picker that could not reach the server has no accessibility violations', async () => {
  showPicker({kind: 'picking', error: null, retryId: null}, undefined, 'the server hung up')

  expect(await auditOf('dialog')).toBe('')
})

test('the empty picker has no accessibility violations', async () => {
  showPicker({kind: 'picking', error: null, retryId: null}, [])

  expect(await auditOf('dialog')).toBe('')
})

test('the reload card has no accessibility violations', async () => {
  showPicker({kind: 'reload', adopted: ADOPTED}, [liveSession({ready: false})])

  expect(await auditOf('dialog')).toBe('')
})

test('the terminal conflict question has no accessibility violations', async () => {
  showConflict({kind: 'attached', message: ATTACHED_MESSAGE})

  expect(await auditOf('alertdialog')).toBe('')
})
