import {afterEach} from 'vitest'
import type {PaneMount} from './pane-harness.js'

export type KeptPane = (mount: PaneMount) => PaneMount

export function keptPane(): KeptPane {
  const active: {pane: PaneMount | null} = {pane: null}
  afterEach(() => {
    active.pane?.dispose()
    active.pane = null
  })
  return (mount) => {
    active.pane = mount
    return mount
  }
}
