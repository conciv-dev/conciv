import {use} from 'react'

const held: {release?: Promise<void>} = {}

function heldRelease(): Promise<void> {
  held.release ??= fetch('/api/hydration-hold').then(() => undefined)
  return held.release
}

export default function HydrationHold({holding}: {holding: boolean}) {
  if (holding && typeof document !== 'undefined') use(heldRelease())
  return null
}
