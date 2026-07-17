import type {JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'

export function RecorderNotice(props: {text: string}): JSX.Element {
  return <div class="text-[0.8125rem] text-pw-text-2 font-pw">{props.text}</div>
}

export function RecorderErrorNotice(props: {retry: () => void; text?: string}): JSX.Element {
  return (
    <div class="flex flex-col gap-2 items-start">
      <RecorderNotice text={props.text ?? 'Could not load the recording.'} />
      <Button variant="outline" size="sm" onClick={() => props.retry()}>
        Retry
      </Button>
    </div>
  )
}
