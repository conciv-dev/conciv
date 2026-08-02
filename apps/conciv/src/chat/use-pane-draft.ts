import {createEffect, onMount} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {useQuery} from '@tanstack/solid-query'
import {createDebouncer} from '@tanstack/solid-pacer'
import type {RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import type {ComposerStateApi} from './composer-state.js'
import {applyRestoredDraft, focusedInside, stageRestoredDraft} from './draft-restore.js'
import {clearPaneSnapshot, readPaneSnapshot, writePaneSnapshot} from '../lib/ui-snapshot.js'

const WRITE_WAIT_MS = 400
const SNAPSHOT_WAIT_MS = 150
const INPUT_EVENTS = ['input', 'select', 'keyup', 'click', 'focus', 'blur'] as const

export type PaneDraftDeps = {
  rpc: RpcClient
  utils: QueryUtils
  sessionId: () => string
  composer: () => ComposerStateApi | null
  grabTexts: () => string[]
  stageTexts: (texts: string[]) => void
  input: () => HTMLTextAreaElement | undefined
  viewport: () => HTMLElement | undefined
}

export type PaneDraft = {
  restore: () => void
  persist: () => void
  focused: () => boolean
  noteSent: () => Promise<void>
  settleSent: () => void
}

type RestoreState = {composerReady: boolean; restoredSession: string | null}

type RestoreEvent = {kind: 'composerReady'} | {kind: 'restored'; sessionId: string}

function nextRestoreState(state: RestoreState, event: RestoreEvent): RestoreState {
  if (event.kind === 'composerReady') return {...state, composerReady: true}
  return {...state, restoredSession: event.sessionId}
}

function awaitsRestore(state: RestoreState, sessionId: string): boolean {
  return state.composerReady && state.restoredSession !== sessionId
}

export function usePaneDraft(deps: PaneDraftDeps): PaneDraft {
  const focused = (): boolean => focusedInside(deps.input())

  const writeDraft = () => {
    const text = deps.composer()?.text() ?? ''
    const input = deps.input()
    void deps.rpc.drafts
      .set({
        sessionId: deps.sessionId(),
        text,
        selectionStart: input?.selectionStart ?? text.length,
        selectionEnd: input?.selectionEnd ?? text.length,
        grabs: deps.grabTexts(),
      })
      .catch(() => {})
  }
  const persistDraft = createDebouncer(writeDraft, {wait: WRITE_WAIT_MS})
  const persistSnapshot = createDebouncer(
    () => {
      const input = deps.input()
      writePaneSnapshot(deps.sessionId(), {
        selectionStart: input?.selectionStart ?? 0,
        selectionEnd: input?.selectionEnd ?? 0,
        focused: focused(),
        scrollTop: deps.viewport()?.scrollTop ?? null,
      })
    },
    {wait: SNAPSHOT_WAIT_MS},
  )

  const row = useQuery(() => deps.utils.drafts.get.queryOptions({input: {sessionId: deps.sessionId()}}))
  const [restoreState, setRestoreState] = createStore<RestoreState>({composerReady: false, restoredSession: null})
  const send = (event: RestoreEvent): void => setRestoreState(reconcile(nextRestoreState(restoreState, event)))

  createEffect(() => {
    const sessionId = deps.sessionId()
    if (!row.isSuccess || !awaitsRestore(restoreState, sessionId)) return
    const composer = deps.composer()
    if (!composer) return
    send({kind: 'restored', sessionId})
    stageRestoredDraft(row.data, composer.setText, deps.stageTexts)
    const snapshot = readPaneSnapshot(sessionId)
    requestAnimationFrame(() =>
      applyRestoredDraft(row.data, snapshot, {input: deps.input(), viewport: deps.viewport()}),
    )
  })

  onMount(() => {
    const schedule = () => {
      persistDraft.maybeExecute()
      persistSnapshot.maybeExecute()
    }
    const target = deps.input()
    const viewport = deps.viewport()
    if (target) for (const event of INPUT_EVENTS) makeEventListener(target, event, schedule)
    if (viewport) makeEventListener(viewport, 'scroll', () => persistSnapshot.maybeExecute())
    makeEventListener(window, 'pagehide', () => persistSnapshot.flush())
  })

  return {
    restore: () => send({kind: 'composerReady'}),
    persist: () => persistDraft.maybeExecute(),
    focused,
    noteSent: async () => {
      await deps.rpc.drafts
        .set({sessionId: deps.sessionId(), text: '', selectionStart: 0, selectionEnd: 0, grabs: []})
        .catch(() => {})
      persistDraft.cancel()
    },
    settleSent: () => {
      clearPaneSnapshot(deps.sessionId())
      void row.refetch()
    },
  }
}
