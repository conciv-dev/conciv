import type {JSX} from 'solid-js'
import {Format} from '@ark-ui/solid/format'

// Ark's Intl.RelativeTimeFormat wrapper (locale-aware, cached). numeric:'auto' renders "now"/"yesterday"
// rather than "in 0 seconds"; it formats against the live clock, so a just-created item never reads as
// the future — replacing a hand-rolled formatter that did.
export function RelativeTime(props: {value: Date; class?: string}): JSX.Element {
  return (
    <span class={props.class}>
      <Format.RelativeTime value={props.value} numeric="auto" style="narrow" />
    </span>
  )
}
