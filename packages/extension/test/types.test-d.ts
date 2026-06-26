import type {Accessor, Setter} from 'solid-js'
import {defineExtension} from '../src/define-extension.js'

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
  const slot: () => string = extension.useSlot()
  const insert: (text: string) => void = extension.useContext((context) => context.insert)
  const selection: Accessor<string | null> = extension.useContext((context) => context.selection)
  const full = extension.useContext()
  const fullInsert: (text: string) => void = full.insert
  const fullSelection: Accessor<string | null> = full.selection
  return {slot: slot(), insert, selection, fullInsert, fullSelection}
}

const reversedOrder = defineExtension({name: 'reversed'})
  .server(() => ({context: {}}))
  .client(() => ({value: {count: 1}}))

function ReversedProbe() {
  const count: number = reversedOrder.useContext((context) => context.count)
  return count
}

export {ProbeComponent, ReversedProbe}
