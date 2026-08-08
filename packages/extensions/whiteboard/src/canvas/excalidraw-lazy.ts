export type ExcalidrawModule = typeof import('@excalidraw/excalidraw')

let loadedModule: ExcalidrawModule | undefined

export async function loadExcalidraw(): Promise<ExcalidrawModule> {
  loadedModule ??= await import('@excalidraw/excalidraw')
  return loadedModule
}

export function loadedExcalidraw(): ExcalidrawModule {
  if (!loadedModule) throw new Error('[whiteboard] excalidraw module accessed before it finished loading')
  return loadedModule
}
