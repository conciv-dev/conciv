import type {ThemeTokens} from '@conciv/ui-kit-system'
import {setActiveChatTheme, type ChatTheme} from '@conciv/ui-kit-chat/theme/theme-descriptor'
import {registerFonts} from './shadow.js'

export function applyChatTheme(root: Element, theme: ChatTheme, doc: Document = document): void {
  root.classList.add(`chat-theme-${theme.id}`)
  registerFonts(theme.fonts, doc)
  setActiveChatTheme(theme)
}

export function makeThemeApplier(root: ShadowRoot | Document): (overrides: ThemeTokens) => void {
  const merged: ThemeTokens = {}
  return (overrides) => {
    Object.assign(merged, overrides)
    const selector = root instanceof Document ? ':root' : ':host'
    const decls = Object.entries(merged).map(([name, value]) => `  --${name}: ${value};`)
    const css = `${selector} {\n${decls.join('\n')}\n}`
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document)
    const host = root instanceof Document ? root.head : root
    const existing = host.querySelector('style[data-conciv-theme]')
    const style = existing ?? doc.createElement('style')
    if (!existing) {
      style.setAttribute('data-conciv-theme', '')
      host.appendChild(style)
    }
    style.textContent = css
  }
}
