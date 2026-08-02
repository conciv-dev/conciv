import {createEffect, createSignal, type Accessor} from 'solid-js'
import type {RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import type {Grab} from '@conciv/grab'
import type {PaneContextValue} from '../app/pane-context.js'
import type {ComposerStateApi} from './composer-state.js'
import {resolveGrabSource} from './grab-source-resolve.js'
import {usePaneDraft, type PaneDraft} from './use-pane-draft.js'

export type ComposerBridgeDeps = {
  rpc: RpcClient
  utils: QueryUtils
  sessionId: () => string
  pane: PaneContextValue
}

export type ComposerBridge = {
  composer: Accessor<ComposerStateApi | null>
  draft: PaneDraft
  onComposerReady: (api: ComposerStateApi) => void
  inputRef: (element: HTMLTextAreaElement) => void
  viewportRef: (element: HTMLElement) => void
  focusInput: () => void
  insert: (text: string) => void
  attach: (file: File) => void
  stageGrab: (grab: Grab) => void
}

export function useComposerBridge(deps: ComposerBridgeDeps): ComposerBridge {
  const [composer, setComposer] = createSignal<ComposerStateApi | null>(null)
  let inputElement: HTMLTextAreaElement | undefined
  let viewportElement: HTMLElement | undefined

  const draft = usePaneDraft({
    rpc: deps.rpc,
    utils: deps.utils,
    sessionId: deps.sessionId,
    composer,
    grabTexts: () => deps.pane.grabStore.grabs().map((grab) => grab.text),
    stageTexts: deps.pane.grabStore.stageTexts,
    input: () => inputElement,
    viewport: () => viewportElement,
  })

  const focusInput = (): void => {
    requestAnimationFrame(() => inputElement?.focus())
  }

  createEffect(() => {
    const api = composer()
    if (!api) return
    draft.restore()
    for (const file of deps.pane.attachments.drain()) void api.addAttachment(file)
  })

  const groundGrab = async (grab: Grab): Promise<void> => {
    const grounded = await resolveGrabSource(grab, (input) => deps.rpc.page.symbolicate(input))
    if (!grounded) return
    deps.pane.grabStore.replace(grab, grounded)
    draft.persist()
  }

  const attach = (file: File): void => {
    const api = composer()
    if (!api) {
      deps.pane.attachments.enqueue(file)
      return
    }
    void api.addAttachment(file)
    focusInput()
  }

  return {
    composer,
    draft,
    onComposerReady: (api) => setComposer(() => api),
    inputRef: (element) => {
      inputElement = element
    },
    viewportRef: (element) => {
      viewportElement = element
    },
    focusInput,
    insert: (text) => {
      composer()?.append(text)
      focusInput()
    },
    attach,
    stageGrab: (grab) => {
      deps.pane.grabStore.stage(grab)
      focusInput()
      void groundGrab(grab)
    },
  }
}
