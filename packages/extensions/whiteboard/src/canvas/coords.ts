import {sceneCoordsToViewportCoords, viewportCoordsToSceneCoords} from '@excalidraw/excalidraw'
import type {Zoom} from '@excalidraw/excalidraw/types'

export type Viewport = {scrollX: number; scrollY: number; zoom: Zoom; offsetLeft: number; offsetTop: number}

export const sceneToScreen = (viewport: Viewport, sceneX: number, sceneY: number): {x: number; y: number} =>
  sceneCoordsToViewportCoords({sceneX, sceneY}, viewport)

export const screenToScene = (viewport: Viewport, clientX: number, clientY: number): {x: number; y: number} =>
  viewportCoordsToSceneCoords({clientX, clientY}, viewport)
