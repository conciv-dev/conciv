import {createEffect} from 'solid-js'
import {AsyncDebouncer} from '@tanstack/pacer'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {WebStorage} from '@conciv/storage-history'
import type {ComposerDraft} from '../primitives/composer/composer-context.js'
import {writeComposerDraft} from './composer-draft-storage.js'

const DRAFT_WRITE_DELAY_MS = 300

export type ComposerDraftPersistenceOptions = {
  storage: () => WebStorage | undefined
  key: () => string
  draft: () => ComposerDraft
}

export function useComposerDraftPersistence(options: ComposerDraftPersistenceOptions): void {
  const writer = new AsyncDebouncer(
    (storage: WebStorage, key: string, draft: ComposerDraft) => writeComposerDraft(storage, key, draft),
    {wait: DRAFT_WRITE_DELAY_MS},
  )
  createEffect(() => {
    const storage = options.storage()
    if (!storage) return
    void writer.maybeExecute(storage, options.key(), options.draft())
  })
  makeEventListener(window, 'pagehide', () => void writer.flush())
}
