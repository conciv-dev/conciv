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
    const sources = context.nodeMap
    if (!root || !(sources instanceof Map)) return
    const pinnedToOneLine = (box: Element): boolean => {
      const source = sources.get(box)
      return (
        box instanceof HTMLElement &&
        box.style.getPropertyValue('text-wrap-mode') === 'nowrap' &&
        source instanceof Element &&
        getComputedStyle(source).getPropertyValue('text-wrap-mode') !== 'nowrap'
      )
    }
    const carryOneLine = (box: Element, pinned: boolean): void => {
      for (const child of box.children) {
        if (pinned && child instanceof HTMLElement) child.style.setProperty('text-wrap-mode', 'nowrap')
        carryOneLine(child, pinned || pinnedToOneLine(child))
      }
    }
    carryOneLine(root, pinnedToOneLine(root))
  },
}

export const capturePlugins: SnapdomPlugin[] = [keepBodyMargins, keepOneLineText]
