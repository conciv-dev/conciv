import {sceneCoordsToViewportCoords, viewportCoordsToSceneCoords} from '@excalidraw/excalidraw'
import type {Zoom} from '@excalidraw/excalidraw/types'

// The exact shape Excalidraw's coordinate converters expect as their second argument, so a Viewport
// passes straight through. Pins are stored in scene coordinates and projected to screen for render,
// so they track canvas pan/zoom. `zoom` is Excalidraw's branded Zoom object, carried verbatim.
export type Viewport = {scrollX: number; scrollY: number; zoom: Zoom; offsetLeft: number; offsetTop: number}

export const sceneToScreen = (viewport: Viewport, sceneX: number, sceneY: number): {x: number; y: number} =>
  sceneCoordsToViewportCoords({sceneX, sceneY}, viewport)

export const screenToScene = (viewport: Viewport, clientX: number, clientY: number): {x: number; y: number} =>
  viewportCoordsToSceneCoords({clientX, clientY}, viewport)
