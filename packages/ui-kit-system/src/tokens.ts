export const TOKENS = {
  'chat-accent': {value: 'light-dark(#2563eb, #c9857f)', description: 'brand accent', overridable: true},
  'chat-accent-hi': {value: 'light-dark(#1d4ed8, #dda49e)', description: 'accent hover'},
  'chat-accent-link': {
    value: 'light-dark(var(--chat-accent), var(--chat-accent-hi))',
    description: 'accent links',
  },
  'chat-accent-08': {value: 'color-mix(in oklch, var(--chat-accent) 10%, transparent)', description: 'accent tint 8%'},
  'chat-accent-20': {value: 'color-mix(in oklch, var(--chat-accent) 22%, transparent)', description: 'accent tint 20%'},
  'chat-accent-line': {value: 'color-mix(in oklch, var(--chat-accent) 42%, transparent)', description: 'accent border'},
  'chat-backdrop': {value: 'oklch(0 0 0 / 0.55)', description: 'dialog backdrop scrim, dark in both schemes'},
  'chat-panel': {value: 'light-dark(#f6f7f9, #17161a)', description: 'opaque panel'},
  'chat-panel-sunk': {value: 'var(--chat-panel)', description: 'deepest field bg'},
  'chat-glass': {value: 'light-dark(rgba(246, 247, 249, 0.97), rgba(23, 22, 26, 0.97))', description: 'panel surface'},
  'chat-fill': {value: 'light-dark(rgba(15, 18, 24, 0.04), rgba(255, 255, 255, 0.05))', description: 'elevated fill'},
  'chat-fill-soft': {value: 'light-dark(rgba(15, 18, 24, 0.03), rgba(255, 255, 255, 0.03))', description: 'soft fill'},
  'chat-fill-strong': {
    value: 'light-dark(rgba(15, 18, 24, 0.08), rgba(255, 255, 255, 0.1))',
    description: 'strong fill',
  },
  'chat-sunken': {
    value: 'light-dark(rgba(15, 18, 24, 0.05), rgba(0, 0, 0, 0.35))',
    description: 'code / pre blocks',
  },
  'chat-text': {value: 'light-dark(#1d2127, #d8d2ce)', description: 'primary body text'},
  'chat-text-hi': {value: 'light-dark(#0b0d10, #f0ebe8)', description: 'emphasis ink'},
  'chat-text-2': {value: 'light-dark(#565b63, #a29c9c)', description: 'secondary / muted'},
  'chat-text-3': {value: 'light-dark(#6b717a, #7d787d)', description: 'faint / metadata'},
  'chat-on-accent': {value: 'light-dark(#ffffff, #14100f)', description: 'text on an accent fill'},
  'chat-agent': {
    value: 'light-dark(color-mix(in oklch, oklch(0.79 0.13 188), var(--chat-text-hi) 45%), oklch(0.79 0.13 188))',
    description: 'fixed agent hue (teal), darkened toward the ink anchor on light',
  },
  'chat-danger': {value: 'light-dark(#dc2626, #d98070)', description: 'error text'},
  'chat-danger-line': {
    value: 'color-mix(in oklch, var(--chat-danger) 42%, transparent)',
    description: 'error border',
  },
  'chat-success': {value: 'light-dark(#16a34a, #6fbf8b)', description: 'success'},
  'chat-warn': {value: 'light-dark(#ca8a04, #c9a86a)', description: 'warning gold'},
  'chat-dim': {value: 'light-dark(var(--chat-text-3), #8d8887)', description: 'thinking shimmer base'},
  'chat-line': {value: 'light-dark(rgba(15, 18, 24, 0.12), #272428)', description: 'line'},
  'chat-line-2': {value: 'light-dark(rgba(15, 18, 24, 0.18), #322e33)', description: 'line strong'},
  'chat-line-soft': {value: 'light-dark(rgba(15, 18, 24, 0.06), #232025)', description: 'line soft'},
  'chat-radius-surface-sm': {value: '4px', description: 'floating surface radius sm'},
  'chat-radius-surface-md': {value: '8px', description: 'floating surface radius md'},
  'chat-radius-surface-lg': {value: '12px', description: 'floating surface radius lg'},
  'chat-radius-pill': {value: '999px', description: 'radius pill'},
  'chat-shadow': {value: 'var(--chat-shadow-sm)', description: 'elevation'},
  'chat-shadow-sm': {
    value: '0 2px 10px light-dark(rgba(15, 18, 24, 0.14), rgba(0, 0, 0, 0.5))',
    description: 'tight elevation for small controls',
  },
  'chat-shadow-lg': {
    value: '0 16px 44px light-dark(rgba(15, 18, 24, 0.18), rgba(0, 0, 0, 0.6))',
    description: 'elevation lg',
  },
  'chat-shadow-hover': {value: 'var(--chat-shadow-lg)', description: 'elevation hover'},
  'chat-ease': {value: 'cubic-bezier(0.22, 1, 0.36, 1)', description: 'ease-out-quart'},
  'chat-ease-expo': {value: 'cubic-bezier(0.16, 1, 0.3, 1)', description: 'ease-out-expo'},
  'chat-font': {
    value:
      "'Source Sans 3', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    description: 'sans font stack',
  },
  'chat-mono': {
    value: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    description: 'mono font stack',
  },
} as const

export type ThemeTokenName = keyof typeof TOKENS
export type ThemeTokens = Partial<Record<ThemeTokenName, string>>

const SCHEME_RULES = ['.light {\n  color-scheme: light;\n}', '.dark {\n  color-scheme: dark;\n}'].join('\n\n')

export function renderTokensCss(tokens: Record<string, {value: string}>): string {
  const lines = Object.entries(tokens).map(([name, def]) => `  --${name}: ${def.value};`)
  const root = `:host,\n:root {\n  color-scheme: light dark;\n${lines.join('\n')}\n}`
  return `${root}\n\n${SCHEME_RULES}\n`
}
