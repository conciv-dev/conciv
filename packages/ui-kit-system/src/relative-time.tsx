import {splitProps, type JSX} from 'solid-js'
import {Format} from '@ark-ui/solid/format'

export function RelativeTime(props: {value: Date; class?: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['value'])
  return (
    <span {...rest}>
      <Format.RelativeTime value={local.value} numeric="auto" style="narrow" />
    </span>
  )
}
