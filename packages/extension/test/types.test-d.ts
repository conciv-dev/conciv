import type {Accessor, Setter} from 'solid-js'
import {defineExtension} from '../src/define-extension.js'
import {getHostApi} from '../src/hooks.js'

const extension = defineExtension({name: 'canvas'})
  .client(() => {
    const value = {
      selection: (() => null) as Accessor<string | null>,
      setSelection: (() => undefined) as Setter<string | null>,
    }
    return {value}
  })
  .server(() => ({context: {}}))

function ProbeComponent() {
  const host = getHostApi()
  const slot: string = host.useSlot()
  const insert: (text: string) => void = host.useComposerInsert()
  const selection: Accessor<string | null> = extension.useContext((context) => context.selection)
  const full = extension.useContext()
  const fullSelection: Accessor<string | null> = full.selection
  return {slot, insert, selection, fullSelection}
}

const reversedOrder = defineExtension({name: 'reversed'})
  .server(() => ({context: {}}))
  .client(() => ({value: {count: 1}}))

function ReversedProbe() {
  const count: number = reversedOrder.useContext((context) => context.count)
  return count
}

export {ProbeComponent, ReversedProbe}
