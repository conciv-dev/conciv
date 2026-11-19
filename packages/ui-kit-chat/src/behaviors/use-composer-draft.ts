import {createEffect, onCleanup} from 'solid-js'
import {AsyncDebouncer} from '@tanstack/pacer'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {WebStorage} from '@conciv/storage-history'
import type {ComposerDraft} from '../primitives/composer/composer-context.js'
import {writeComposerDraft} from './composer-draft-storage.js'

const DRAFT_WRITE_DELAY_MS = 300

export type ComposerDraftWriter = (key: string, draft: ComposerDraft) => void

export type ComposerDraftPersistenceOptions = {
  storage: () => WebStorage | undefined
  writer?: () => ComposerDraftWriter | undefined
  key: () => string
  draft: () => ComposerDraft
}

type DraftDebouncer = AsyncDebouncer<typeof writeComposerDraft>

function isCleared(draft: ComposerDraft): boolean {
  return draft.draft === '' && draft.attachments.length === 0 && draft.quote === null && draft.items.length === 0
}

function wasTyped(previous: ComposerDraft | undefined): boolean {
  return previous !== undefined && !isCleared(previous)
}

function writeToDocument(
  write: ComposerDraftWriter,
  key: string,
  draft: ComposerDraft,
  previous: ComposerDraft | undefined,
): ComposerDraft {
  if (!isCleared(draft) || wasTyped(previous)) write(key, draft)
  return draft
}

function writeToStorage(
  debouncer: DraftDebouncer,
  storage: WebStorage,
  key: string,
  draft: ComposerDraft,
  previous: ComposerDraft | undefined,
): ComposerDraft {
  if (!isCleared(draft)) {
    void debouncer.maybeExecute(storage, key, draft)
    return draft
  }
  debouncer.cancel()
  if (wasTyped(previous)) void writeComposerDraft(storage, key, draft)
  return draft
}

export function useComposerDraftPersistence(options: ComposerDraftPersistenceOptions): void {
  const debouncer = new AsyncDebouncer(writeComposerDraft, {wait: DRAFT_WRITE_DELAY_MS})
  createEffect<ComposerDraft | undefined>((previous) => {
    const draft = options.draft()
    const documentWriter = options.writer?.()
    if (documentWriter) return writeToDocument(documentWriter, options.key(), draft, previous)
    const storage = options.storage()
    if (!storage) return previous
    return writeToStorage(debouncer, storage, options.key(), draft, previous)
  })
  makeEventListener(window, 'pagehide', () => void debouncer.flush())
  onCleanup(() => void debouncer.flush())
}
