import {observable, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {createElement, useSyncExternalStore, type ReactNode} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {createRoot} from 'react-dom/client'
import {Excalidraw, THEME, convertToExcalidrawElements, exportToBlob} from '@excalidraw/excalidraw'
import type {AppState, ExcalidrawImperativeAPI, ExcalidrawProps} from '@excalidraw/excalidraw/types'
import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {Deferred, Effect, Exit, Ref, Scope} from 'effect'
import {useWhiteboardDb} from './db.js'
import type {Viewport} from './coords.js'
import {
  makeCanvasPending,
  makeSceneVersions,
  elementsToRows,
  rowsToScene,
  type CanvasPort,
  type SceneElement,
} from './island-model.js'

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const PENDING_REMOVE_RETRY_MS = 100

const CANVAS = 'fixed inset-0 pointer-events-auto'

const reportMountError = (error: unknown): void =>
  void Effect.runFork(
    Effect.logError('the excalidraw canvas failed to mount', error).pipe(
      Effect.annotateLogs({plugin: 'whiteboard', surface: 'canvas'}),
    ),
  )

const mountFailedFallback = createElement('div', {'data-whiteboard-error': ''}, 'canvas failed')

type Theme = 'light' | 'dark'

const keptSidebar = (state: AppState): AppState['openSidebar'] =>
  state.defaultSidebarDockedPreference ? state.openSidebar : null

export function Island(props: {
  mount: HTMLElement
  room: string
  theme: Theme
  visible: boolean
  onViewport: (viewport: Viewport) => void
}): JSX.Element {
  const db = useWhiteboardDb()
  let container: HTMLDivElement | undefined
  const islandScope = Effect.runSync(Scope.make())
  const scene = Effect.runSync(makeSceneVersions())
  const attached = Ref.makeUnsafe<ExcalidrawImperativeAPI | undefined>(undefined)

  const applyRemote = (): void => {
    const instance = Ref.getUnsafe(attached)
    const rows = [...db.canvasElements.state.values()]
    if (!instance || !Effect.runSync(scene.acceptRemote(rows, instance.getSceneElementsIncludingDeleted()))) return
    instance.updateScene({elements: rowsToScene(rows), captureUpdate: CAPTURE_NEVER})
  }

  const writeLocal = (next: readonly SceneElement[]): void =>
    elementsToRows(db.room, Effect.runSync(scene.takeLocal(next))).forEach((row) => db.canvasElements.utils.write(row))

  const initialScene = () => {
    const rows = [...db.canvasElements.state.values()]
    Effect.runSync(scene.seed(rows))
    return {elements: rowsToScene(rows)}
  }

  const skipOnPointer = (skipped: Deferred.Deferred<void>) => {
    const skip = (): void => void Effect.runSync(Deferred.succeed(skipped, undefined))
    return Effect.acquireRelease(
      Effect.sync(() => container?.addEventListener('pointerdown', skip, {once: true})),
      () => Effect.sync(() => container?.removeEventListener('pointerdown', skip)),
    )
  }

  const canvas: CanvasPort = {
    toElements: (skeletons) => convertToExcalidrawElements(skeletons, {regenerateIds: false}),
    liveElements: () => Ref.getUnsafe(attached)?.getSceneElements(),
    render: (elements) =>
      exportToBlob({elements, files: Ref.getUnsafe(attached)?.getFiles() ?? {}, appState: {exportBackground: true}}),
    skipOnPointer,
  }

  const sceneSubscription = db.canvasElements.subscribeChanges(applyRemote, {includeInitialState: true})
  const pending = Effect.runSync(
    makeCanvasPending(db, canvas, {removeRetryMs: PENDING_REMOVE_RETRY_MS}).pipe(Scope.provide(islandScope)),
  )
  const pendingSubscription = db.canvasPending.subscribeChanges(
    () => Effect.runFork(pending.see([...db.canvasPending.state.values()])),
    {includeInitialState: true},
  )

  onCleanup(() => {
    sceneSubscription.unsubscribe()
    pendingSubscription.unsubscribe()
    Effect.runFork(Scope.close(islandScope, Exit.void))
  })

  const themes = observable(() => props.theme)
  const subscribeTheme = (onChange: () => void): (() => void) => {
    const subscription = themes.subscribe(() => onChange())
    return () => subscription.unsubscribe()
  }
  const readTheme = (): Theme => untrack(() => props.theme)
  const ThemedExcalidraw = (canvasProps: ExcalidrawProps): ReactNode => {
    const theme = useSyncExternalStore(subscribeTheme, readTheme)
    return createElement(Excalidraw, {...canvasProps, theme: theme === 'dark' ? THEME.DARK : THEME.LIGHT})
  }

  const closeLayersOnCanvasPointer = (): void => {
    const api = Ref.getUnsafe(attached)
    const state = api?.getAppState()
    if (!api || !state) return
    const openSidebar = keptSidebar(state)
    if (state.openMenu === null && openSidebar === state.openSidebar) return
    api.updateScene({appState: {openMenu: null, openSidebar}, captureUpdate: CAPTURE_NEVER})
  }

  const renderExcalidraw = (): void => {
    if (!container || !container.isConnected) {
      return reportMountError(new Error('the canvas container never attached to the document'))
    }
    const root = createRoot(container)
    Effect.runSync(
      Scope.addFinalizer(
        islandScope,
        Effect.sync(() => root.unmount()),
      ),
    )
    root.render(
      createElement(
        ErrorBoundary,
        {fallback: mountFailedFallback, onError: reportMountError},
        createElement(ThemedExcalidraw, {
          initialData: initialScene,
          zenModeEnabled: true,
          viewModeEnabled: false,
          isCollaborating: true,
          excalidrawAPI: (instance: ExcalidrawImperativeAPI) => {
            Effect.runSync(Ref.set(attached, instance))
            const pushViewport = (): void => {
              const state = instance.getAppState()
              props.onViewport({
                scrollX: state.scrollX,
                scrollY: state.scrollY,
                zoom: state.zoom,
                offsetLeft: state.offsetLeft,
                offsetTop: state.offsetTop,
              })
            }
            pushViewport()
            const unsubscribeScroll = instance.onScrollChange(pushViewport)
            Effect.runSync(Scope.addFinalizer(islandScope, Effect.sync(unsubscribeScroll)))
          },
          onChange: (elements: readonly OrderedExcalidrawElement[]) => writeLocal(elements),
          onPointerDown: closeLayersOnCanvasPointer,
        }),
      ),
    )
  }

  onMount(renderExcalidraw)

  return (
    <Portal mount={props.mount}>
      <div
        ref={(element) => (container = element)}
        inert={!props.visible}
        class={props.visible ? CANVAS : `${CANVAS} invisible content-visibility-hidden`}
      />
    </Portal>
  )
}
