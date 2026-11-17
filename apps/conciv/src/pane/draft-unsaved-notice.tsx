import {createEffect, createMemo, onCleanup, type JSX} from 'solid-js'
import {useMutationState} from '@conciv/client'
import {useAppData} from '../app/context.js'
import {DraftSaveSchema} from '../data/app-data.js'
import {useNotices} from '../shell/notice-context.js'
import {sameContent, type DraftContent} from './draft-storage.js'

const DRAFT_UNSAVED_KEY = 'draft-unsaved'
const KEPT_HERE_MESSAGE =
  'conciv could not save your draft. It is kept in this browser, but the engine copy failed, so it is not on your other devices or in other browsers.'
const ENGINE_ONLY_MESSAGE = 'conciv could not save your draft. It is still in the composer, but a reload would lose it.'

export function DraftUnsavedNotice(props: {
  sessionId: string
  retry: () => void
  keptHere: (draft: DraftContent) => boolean
}): JSX.Element {
  const appData = useAppData()
  const notices = useNotices()
  const saves = useMutationState(() => ({
    filters: {
      mutationKey: appData.utils.drafts.set.mutationKey(),
      predicate: (mutation) => DraftSaveSchema.safeParse(mutation.state.variables).data?.sessionId === props.sessionId,
    },
    select: (mutation) => ({
      failed: mutation.state.status === 'error',
      taken: mutation.state.status === 'success' && mutation.state.data !== null,
      draft: DraftSaveSchema.parse(mutation.state.variables),
    }),
  }))
  const unsavedDraft = createMemo(() => {
    const failed = saves().findLast((save) => save.failed)
    if (!failed) return null
    const held = saves().findLast((save) => save.taken)
    return !held || !sameContent(failed.draft, held.draft) ? failed.draft : null
  })
  const unsaved = createMemo(() => unsavedDraft() !== null)
  const message = createMemo(() => {
    const draft = unsavedDraft()
    return draft && props.keptHere(draft) ? KEPT_HERE_MESSAGE : ENGINE_ONLY_MESSAGE
  })
  onCleanup(() => notices.remove(DRAFT_UNSAVED_KEY))
  createEffect(() => {
    if (!unsaved()) {
      notices.remove(DRAFT_UNSAVED_KEY)
      return
    }
    notices.notify(message(), {
      key: DRAFT_UNSAVED_KEY,
      tone: 'warn',
      persist: true,
      action: {label: 'Retry', run: () => props.retry()},
    })
  })
  return null
}
