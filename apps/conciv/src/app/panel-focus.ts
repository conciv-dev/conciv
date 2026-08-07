import {createContext, createSignal, useContext, type Accessor} from 'solid-js'
import type {ComposerInputHandle} from '../pane/composer-input-adapter.js'

export type PanelComposerFocus = {
  handle: Accessor<ComposerInputHandle | undefined>
  register: (next: ComposerInputHandle) => void
  release: (previous: ComposerInputHandle) => void
}

export function makePanelComposerFocus(): PanelComposerFocus {
  const [handle, setHandle] = createSignal<ComposerInputHandle>()
  return {
    handle,
    register: (next) => setHandle(() => next),
    release: (previous) => setHandle((current) => (current === previous ? undefined : current)),
  }
}

export const PanelComposerFocusContext = createContext<PanelComposerFocus>()

export function usePanelComposerFocus(): PanelComposerFocus | undefined {
  return useContext(PanelComposerFocusContext)
}
