import {CONCIV_UI_SELECTOR} from '@conciv/protocol/page-types'
import {addRef, dehydrate, describe, grabApi, locate, reactBridge, rootFibers, showToast, type Refs} from '@conciv/page'
import type {Page, ReactTree} from '@conciv/plugin/experimental/page'
import {capturePlugins} from './capture-plugins.js'

export const pageMembers: Omit<Page, 'symbolicate'> = {
  toast: showToast,
  capture: {exclude: CONCIV_UI_SELECTOR, plugins: capturePlugins},
  pick: async () => {
    const grab = await grabApi.comment()
    if (!grab) return null
    return {source: grab.source, rect: grab.rect}
  },
}

export function makeReactTree(): ReactTree {
  const refs: Refs = {map: new Map(), n: 0}
  return {
    rootFibers,
    dehydrate,
    describe,
    locate: (element) => locate(element, (found) => addRef(found, refs)),
    frames: reactBridge.framesForElement,
  }
}
