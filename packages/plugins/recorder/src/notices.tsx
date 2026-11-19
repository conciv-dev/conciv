import type {JSX} from 'solid-js'
import {usePlugin} from '@conciv/plugin/experimental'

export function RecorderNotice(props: {text: string}): JSX.Element {
  return <div class="text-chat-md text-chat-text-2 font-chat">{props.text}</div>
}

export function RecorderErrorNotice(props: {retry: () => void; text?: string}): JSX.Element {
  const ctx = usePlugin()
  return (
    <div role="alert" class="flex flex-col gap-2 items-start">
      <RecorderNotice text={props.text ?? 'Could not load the recording.'} />
      <ctx.ui.Button variant="neutral" size="small" onClick={() => props.retry()}>
        Retry
      </ctx.ui.Button>
    </div>
  )
}
