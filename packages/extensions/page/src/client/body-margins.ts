import type {SnapdomPlugin} from '@zumer/snapdom'

const keepBodyMargins: SnapdomPlugin = {
  name: 'keep-body-margins',
  afterClone: (context) => {
    const root = context.clone
    const body = root?.querySelector(':scope > body')
    if (!(root instanceof HTMLElement) || !(body instanceof HTMLElement)) return
    body.style.removeProperty('margin-top')
    body.style.removeProperty('margin-bottom')
    root.style.display = 'flow-root'
  },
}

const keepOneLineText: SnapdomPlugin = {
  name: 'keep-one-line-text',
  afterClone: (context) => {
    const root = context.clone
    if (!(root instanceof HTMLElement)) return
    for (const box of root.querySelectorAll('*')) {
      if (!(box instanceof HTMLElement) || box.style.getPropertyValue('text-wrap-mode') !== 'nowrap') continue
      for (const inner of box.querySelectorAll('*')) {
        if (inner instanceof HTMLElement) inner.style.setProperty('text-wrap-mode', 'nowrap')
      }
    }
  },
}

export const capturePlugins: SnapdomPlugin[] = [keepBodyMargins, keepOneLineText]
