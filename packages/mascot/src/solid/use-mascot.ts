import {createEffect, createMemo, onCleanup, untrack} from 'solid-js'
import {createStore} from 'solid-js/store'
import {followChannels, type MascotConfig, type MascotFollow} from '../core/config.js'
import {createMascot, type MascotPartProps} from '../core/mascot.js'
import {robotSkin} from '../core/skin.js'
import {partAlreadyProvided} from '../core/slot-contract.js'
import type {FollowSource, MascotContextValue, MascotPartName} from './mascot-context.js'
import type {MascotProps} from './mascot-props.js'

export type MascotSlots = {head: boolean; eyes: boolean; antenna: boolean; effects: number}

export type MascotHost = {context: MascotContextValue; slots: MascotSlots; rootProps: MascotPartProps}

export function createMascotHost(props: MascotProps): MascotHost {
  const [slots, setSlots] = createStore<MascotSlots>({head: false, eyes: false, antenna: false, effects: 0})
  const sources: Record<MascotPartName, FollowSource | undefined> = {
    head: undefined,
    eyes: undefined,
    antenna: undefined,
  }

  const followOf = (part: MascotPartName): boolean | undefined => (slots[part] ? sources[part]?.follow : undefined)

  const follow = (): MascotFollow => {
    const base = followChannels(props.follow ?? true)
    return {eyes: followOf('eyes') ?? base.eyes, antenna: followOf('antenna') ?? base.antenna}
  }

  const config = createMemo<MascotConfig>(() => ({
    state: props.state ?? 'rest',
    working: props.working ?? false,
    follow: follow(),
    activity: props.activity,
  }))

  const service = createMascot(
    untrack(config),
    untrack(() => props.initialSkin ?? robotSkin),
  )
  const connect = service.connect()
  createEffect(() => service.update(config()))
  onCleanup(() => service.destroy())

  const partReaders: Record<MascotPartName, () => MascotPartProps> = {
    head: connect.getHeadProps,
    eyes: connect.getEyesProps,
    antenna: connect.getAntennaProps,
  }

  const claimPart = (part: MascotPartName, source?: FollowSource) => {
    if (untrack(() => slots[part])) throw partAlreadyProvided(part)
    sources[part] = source
    setSlots(part, true)
    onCleanup(() => {
      if (sources[part] === source) sources[part] = undefined
      setSlots(part, false)
    })
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
