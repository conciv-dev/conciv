import {createEffect, onCleanup, onMount} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {createDebouncer} from '@tanstack/solid-pacer'
import type {RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import type {ComposerStateApi} from './composer-state.js'
import {applyRestoredDraft, focusedInside, stageRestoredDraft} from './draft-restore.js'
import {clearPaneSnapshot, readPaneSnapshot, writePaneSnapshot} from '../lib/ui-snapshot.js'

const WRITE_WAIT_MS = 400
const SNAPSHOT_WAIT_MS = 150
const INPUT_EVENTS = ['input', 'select', 'keyup', 'click', 'focus', 'blur']

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
  focused: () => boolean
  noteSent: () => Promise<void>
  settleSent: () => void
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
  const restored = {done: false}

  const restore = () => {
    const composer = deps.composer()
    if (!composer || restored.done || !row.isSuccess) return
    restored.done = true
    stageRestoredDraft(row.data, composer.setText, deps.stageTexts)
    const snapshot = readPaneSnapshot(deps.sessionId())
    requestAnimationFrame(() =>
      applyRestoredDraft(row.data, snapshot, {input: deps.input(), viewport: deps.viewport()}),
    )
  }

  createEffect(() => {
    if (!row.isSuccess) return
    restore()
  })
  createEffect(() => {
    const stored = row.data
    if (!stored || !restored.done || focused()) return
    const composer = deps.composer()
    if (composer && composer.text() !== stored.text) composer.setText(stored.text)
  })

  onMount(() => {
    const schedule = () => {
      persistDraft.maybeExecute()
      persistSnapshot.maybeExecute()
    }
    const target = deps.input()
    const viewport = deps.viewport()
    if (target) for (const event of INPUT_EVENTS) target.addEventListener(event, schedule)
    if (viewport) viewport.addEventListener('scroll', () => persistSnapshot.maybeExecute())
    const onPageHide = () => persistSnapshot.flush()
    window.addEventListener('pagehide', onPageHide)
    onCleanup(() => {
      if (target) for (const event of INPUT_EVENTS) target.removeEventListener(event, schedule)
      window.removeEventListener('pagehide', onPageHide)
    })
  })

  return {
    restore,
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
