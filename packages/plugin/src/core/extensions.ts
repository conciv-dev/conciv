// The virtual module that discovers consumer extension files (mandarax/extensions/*) and feeds each
// default export to the widget's window.__MANDARAX__.use(). import.meta.glob is a vite macro, so the
// source must be returned to vite's load() hook (it expands the glob + wires HMR).
export const EXTENSIONS_VIRTUAL_ID = 'virtual:mandarax-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID

export function extensionsModuleSource(): string {
  return `
const mods = import.meta.glob('/mandarax/extensions/*.{ts,tsx,js,jsx}', { eager: true })
const apply = (ext) => {
  if (!ext) return
  const g = (window.__MANDARAX__ ??= {})
  if (g.use) g.use(ext)
  else (g.queue ??= []).push(ext)
}
for (const key of Object.keys(mods)) apply(mods[key].default)
if (import.meta.hot) import.meta.hot.accept()
`
}
