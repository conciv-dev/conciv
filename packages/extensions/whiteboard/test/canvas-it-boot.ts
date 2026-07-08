import whiteboard from '../src/server.js'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, openCanvas} from './canvas-it-helpers.js'

export type CanvasSession = {api: ExtensionTestApi; cx: number; cy: number}

export const bootCanvas = async (): Promise<CanvasSession> => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  const {cx, cy} = await openCanvas(api.page)
  return {api, cx, cy}
}
