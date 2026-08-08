import type {Zoom} from '@excalidraw/excalidraw/types'
import {loadedExcalidraw} from './excalidraw-lazy.js'

export type Viewport = {scrollX: number; scrollY: number; zoom: Zoom; offsetLeft: number; offsetTop: number}

export const sceneToScreen = (viewport: Viewport, sceneX: number, sceneY: number): {x: number; y: number} =>
  loadedExcalidraw().sceneCoordsToViewportCoords({sceneX, sceneY}, viewport)

export const screenToScene = (viewport: Viewport, clientX: number, clientY: number): {x: number; y: number} =>
  loadedExcalidraw().viewportCoordsToSceneCoords({clientX, clientY}, viewport)
