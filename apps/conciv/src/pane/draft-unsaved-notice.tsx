import {createEffect, createMemo, onCleanup, type JSX} from 'solid-js'
import {useMutationState} from '@conciv/client'
import {DraftRowSchema} from '@conciv/contract'
import {useAppData} from '../app/context.js'
import {useNotices} from '../shell/notice-context.js'

const DRAFT_UNSAVED_KEY = 'draft-unsaved'
const DRAFT_UNSAVED_MESSAGE =
  'conciv could not save your draft. It is still in the composer, but a reload would lose it.'

const DraftSaveSchema = DraftRowSchema.omit({updatedAt: true})

export function DraftUnsavedNotice(props: {sessionId: string}): JSX.Element {
  const appData = useAppData()
  const notices = useNotices()
  const saves = useMutationState(() => ({
    filters: {
      mutationKey: appData.utils.drafts.set.mutationKey(),
      predicate: (mutation) => DraftSaveSchema.safeParse(mutation.state.variables).data?.sessionId === props.sessionId,
    },
    select: (mutation) => ({status: mutation.state.status, draft: DraftSaveSchema.parse(mutation.state.variables)}),
  }))
  const unsaved = createMemo(() => saves().some((save) => save.status === 'error'))
  const retry = (): void => {
    const latest = saves().at(-1)
    if (latest) void appData.saveDraft(latest.draft)
  }
  onCleanup(() => notices.remove(DRAFT_UNSAVED_KEY))
  createEffect(() => {
    if (!unsaved()) {
      notices.remove(DRAFT_UNSAVED_KEY)
      return
    }
    notices.notify(DRAFT_UNSAVED_MESSAGE, {
      key: DRAFT_UNSAVED_KEY,
      tone: 'warn',
      persist: true,
      action: {label: 'Retry', run: retry},
    })
  })
  return null
}
