import type {ThemeTokens, ThemeTokenName} from '@conciv/ui-kit-system'

const merged: ThemeTokens = {}

export function applyThemeOverrides(root: ShadowRoot | Document, overrides: ThemeTokens): void {
  Object.assign(merged, overrides)
  const selector = root instanceof Document ? ':root' : ':host'
  const decls = (Object.keys(merged) as ThemeTokenName[]).map((name) => `  --${name}: ${merged[name]};`)
  const css = `${selector} {\n${decls.join('\n')}\n}`
  const doc = root instanceof Document ? root : root.ownerDocument!
  const host = root instanceof Document ? root.head : root
  const existing = host.querySelector('style[data-conciv-theme]')
  const style = existing ?? doc.createElement('style')
  if (!existing) {
    style.setAttribute('data-conciv-theme', '')
    host.appendChild(style)
  }
  style.textContent = css
}
