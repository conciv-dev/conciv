export type ComposerFocusBus = {
  register: (element: HTMLElement) => void
  unregister: (element: HTMLElement) => void
  focusNow: () => void
  requestFocus: () => void
  cancelRequest: () => void
  flush: () => void
}

function focusTarget(element: HTMLElement): void {
  requestAnimationFrame(() => element.focus())
}

export function makeComposerFocusBus(): ComposerFocusBus {
  let target: HTMLElement | null = null
  let pending = false
  const flush = () => {
    if (!pending) return
    if (!target) return
    pending = false
    focusTarget(target)
  }
  return {
    register: (element) => {
      target = element
    },
    unregister: (element) => {
      if (target === element) target = null
    },
    focusNow: () => {
      if (target) focusTarget(target)
    },
    requestFocus: () => {
      pending = true
    },
    cancelRequest: () => {
      pending = false
    },
    flush,
  }
}
