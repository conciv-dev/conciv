import {onMount, type JSX} from 'solid-js'
import {useComposer, useComposerContext, type ComposerDraft} from '@conciv/ui-kit-chat'

export type ComposerStateApi = {
  append: (text: string) => void
  text: () => string
  setText: (value: string) => void
  addAttachment: (file: File) => Promise<void>
  snapshotDraft: () => ComposerDraft
  restoreDraft: (draft: ComposerDraft) => void
  clearDraft: () => void
}

export function ComposerStateBridge(props: {onReady: (api: ComposerStateApi) => void}): JSX.Element {
  const composer = useComposer()
  const context = useComposerContext()
  const api: ComposerStateApi = {
    append: (text) => composer.setText(composer.text() ? `${composer.text()}\n${text}` : text),
    text: composer.text,
    setText: composer.setText,
    addAttachment: context.addAttachment,
    snapshotDraft: context.snapshotDraft,
    restoreDraft: context.restoreDraft,
    clearDraft: context.clearDraft,
  }
  onMount(() => props.onReady(api))
  return <></>
}
