import {createEffect, createMemo, onCleanup, untrack} from 'solid-js'
import {createStore} from 'solid-js/store'
import type {MascotConfig} from '../core/config.js'
import {createMascot, type MascotPartProps} from '../core/mascot.js'
import {robotSkin} from '../core/skin.js'
import type {MascotContextValue, MascotPartName} from './mascot-context.js'
import type {MascotProps} from './mascot-props.js'

export type MascotSlots = {head: boolean; eyes: boolean; antenna: boolean; effects: number}

export type MascotHost = {context: MascotContextValue; slots: MascotSlots; rootProps: MascotPartProps}

export function createMascotHost(props: MascotProps): MascotHost {
  const config = createMemo<MascotConfig>(() => ({
    state: props.state ?? 'rest',
    working: props.working ?? false,
    follow: props.follow ?? true,
    activity: props.activity,
  }))
  const service = createMascot(
    untrack(config),
    untrack(() => props.skin ?? robotSkin),
  )
  const connect = service.connect()
  const [slots, setSlots] = createStore<MascotSlots>({head: false, eyes: false, antenna: false, effects: 0})
  createEffect(() => service.update(config()))
  onCleanup(() => service.destroy())

  const partReaders: Record<MascotPartName, () => MascotPartProps> = {
    head: connect.getHeadProps,
    eyes: connect.getEyesProps,
    antenna: connect.getAntennaProps,
  }

  const claimPart = (part: MascotPartName) => {
    setSlots(part, true)
    onCleanup(() => setSlots(part, false))
  }

  const claimEffect = () => {
    setSlots('effects', (count) => count + 1)
    onCleanup(() => setSlots('effects', (count) => count - 1))
  }

  const context: MascotContextValue = {
    service,
    partProps: (part) => partReaders[part](),
    effectHostProps: connect.getEffectHostProps,
    claimPart,
    claimEffect,
    curve: () => props.curve,
  }

  return {context, slots, rootProps: connect.getRootProps()}
}
