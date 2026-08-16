import {useMemo, useRef, useState, useSyncExternalStore} from 'react'
import {activityChannels, followChannels, type FollowChannels} from '../core/config.js'
import {createMascot, type MascotConnect, type MascotPartProps} from '../core/mascot.js'
import {robotSkin} from '../core/skin.js'
import type {ClaimToken, MascotClaims, MascotContextValue, MascotPartName, PartClaim} from './mascot-context.js'
import type {MascotProps} from './mascot-props.js'
import {useIsomorphicLayoutEffect} from './use-layout-effect.js'

export type MascotHost = {context: MascotContextValue; claims: MascotClaims; rootProps: MascotPartProps}

type ClaimStore = {
  subscribe: (listener: () => void) => () => void
  claims: () => MascotClaims
  claimPart: (part: MascotPartName, token: ClaimToken, follow: boolean | undefined) => () => void
  claimEffect: (token: ClaimToken) => () => void
}

const PART_COMPONENTS: Record<MascotPartName, string> = {
  head: '<Mascot.Head>',
  eyes: '<Mascot.Eyes>',
  antenna: '<Mascot.Antenna>',
}

const alreadyProvided = (part: MascotPartName): Error =>
  new Error(`mascot part '${part}' is already provided; render exactly one ${PART_COMPONENTS[part]}`)

const NO_CLAIMS: MascotClaims = {
  parts: {head: undefined, eyes: undefined, antenna: undefined},
  effects: new Set(),
}

function createClaimStore(): ClaimStore {
  const listeners = new Set<() => void>()
  let claims = NO_CLAIMS

  const publish = (next: MascotClaims) => {
    claims = next
    listeners.forEach((listener) => listener())
  }

  const withPart = (part: MascotPartName, claim: PartClaim | undefined) =>
    publish({parts: {...claims.parts, [part]: claim}, effects: claims.effects})

  const withEffects = (effects: ReadonlySet<ClaimToken>) => publish({parts: claims.parts, effects})

  const releasePart = (part: MascotPartName, token: ClaimToken) => {
    if (claims.parts[part]?.token !== token) return
    withPart(part, undefined)
  }

  const claimPart = (part: MascotPartName, token: ClaimToken, follow: boolean | undefined) => {
    const current = claims.parts[part]
    if (current !== undefined && current.token !== token) throw alreadyProvided(part)
    withPart(part, {token, follow})
    return () => releasePart(part, token)
  }

  const releaseEffect = (token: ClaimToken) => {
    if (!claims.effects.has(token)) return
    const remaining = new Set(claims.effects)
    remaining.delete(token)
    withEffects(remaining)
  }

  const claimEffect = (token: ClaimToken) => {
    withEffects(new Set(claims.effects).add(token))
    return () => releaseEffect(token)
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {subscribe, claims: () => claims, claimPart, claimEffect}
}

const partReadersOf = (connect: MascotConnect): Record<MascotPartName, () => MascotPartProps> => ({
  head: connect.getHeadProps,
  eyes: connect.getEyesProps,
  antenna: connect.getAntennaProps,
})

const followOf = (claims: MascotClaims, part: MascotPartName): boolean | undefined => claims.parts[part]?.follow

function resolveFollow(claims: MascotClaims, follow: MascotProps['follow']): FollowChannels {
  const base = followChannels(follow ?? true)
  return {eyes: followOf(claims, 'eyes') ?? base.eyes, antenna: followOf(claims, 'antenna') ?? base.antenna}
}

export function useMascotHost(props: MascotProps): MascotHost {
  const [store] = useState(createClaimStore)
  const curve = useRef(props.curve)
  curve.current = props.curve
  const claims = useSyncExternalStore(store.subscribe, store.claims, store.claims)
  const state = props.state ?? 'rest'
  const working = props.working ?? false
  const {eyes, antenna} = resolveFollow(claims, props.follow)
  const {bob, throb, blink} = activityChannels(props.activity)
  const [service] = useState(() =>
    createMascot(
      {state, working, follow: {eyes, antenna}, activity: {bob, throb, blink}},
      props.initialSkin ?? robotSkin,
    ),
  )
  const connect = service.connect()

  useIsomorphicLayoutEffect(() => {
    service.update({state, working, follow: {eyes, antenna}, activity: {bob, throb, blink}})
  }, [service, state, working, eyes, antenna, bob, throb, blink])

  const context = useMemo<MascotContextValue>(
    () => ({
      service,
      partProps: (part) => partReadersOf(connect)[part](),
      effectHostProps: connect.getEffectHostProps,
      claimPart: store.claimPart,
      claimEffect: store.claimEffect,
      claimOf: (part) => store.claims().parts[part],
      effectCount: () => store.claims().effects.size,
      curve: () => curve.current,
    }),
    [service, connect, store, curve],
  )

  return {context, claims, rootProps: connect.getRootProps()}
}
