import {Component, createElement, type ReactNode} from 'react'
import {createRoot} from 'react-dom/client'
import {Excalidraw, THEME} from '@excalidraw/excalidraw'
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types'
import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {IslandHandle, IslandOpts} from './island-types.js'

type SceneData = Parameters<ExcalidrawImperativeAPI['updateScene']>[0]

// The ONE class in the codebase: React error boundaries must be classes (no functional equivalent).
// It catches a bad Excalidraw render so a single broken element can't crash the host widget.
class IslandBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  override state = {failed: false}
  static getDerivedStateFromError(): {failed: boolean} {
    return {failed: true}
  }
  override render(): ReactNode {
    if (this.state.failed) return createElement('div', {'data-whiteboard-error': ''}, 'canvas failed')
    return this.props.children
  }
}

// The entire React<->TS boundary: render <Excalidraw>, capture its imperative API, and return a plain
// handle. NO feature logic lives here. JSX is avoided (the package compiles JSX as Solid) so every
// element is createElement.
export function mountIsland(opts: IslandOpts): IslandHandle {
  const root = createRoot(opts.container)
  let api: ExcalidrawImperativeAPI | null = null
  // excalidrawAPI fires before initialData finishes applying, so a scene seeded then is clobbered a frame
  // later; buffer scene writes in `pending` until one frame past mount (`ready`), then flush post-initialData.
  let ready = false
  let pending: SceneData | null = null
  root.render(
    createElement(
      IslandBoundary,
      null,
      createElement(Excalidraw, {
        initialData: {elements: opts.initialElements, appState: {viewBackgroundColor: 'transparent'}},
        zenModeEnabled: true,
        viewModeEnabled: false,
        theme: opts.theme === 'dark' ? THEME.DARK : THEME.LIGHT,
        isCollaborating: true,
        excalidrawAPI: (instance: ExcalidrawImperativeAPI) => {
          api = instance
          requestAnimationFrame(() => {
            ready = true
            if (!pending) return
            instance.updateScene(pending)
            pending = null
          })
        },
        onChange: (elements: readonly OrderedExcalidrawElement[]) => opts.onUserChange(elements),
        onPointerUpdate: (payload: {pointer: {x: number; y: number}}) => opts.onPointer(payload.pointer),
      }),
    ),
  )
  return {
    updateScene: (data: SceneData) => (ready && api ? api.updateScene(data) : void (pending = data)),
    getSceneElements: () => api?.getSceneElements() ?? [],
    updateCollaborators: (m) => api?.updateScene({collaborators: m}),
    destroy: () => root.unmount(),
  }
}
