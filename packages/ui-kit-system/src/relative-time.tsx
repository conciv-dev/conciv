import type {JSX} from 'solid-js'
import {Format} from '@ark-ui/solid/format'

export function RelativeTime(props: {value: Date; class?: string}): JSX.Element {
  return (
    <span class={props.class}>
      <Format.RelativeTime value={props.value} numeric="auto" style="narrow" />
    </span>
  )
}
