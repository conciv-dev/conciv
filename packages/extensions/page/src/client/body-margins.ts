import type {SnapdomPlugin} from '@zumer/snapdom'

export const keepBodyMargins: SnapdomPlugin = {
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
