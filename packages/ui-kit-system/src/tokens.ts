export const TOKENS = {
  'chat-hue': {
    value: '328',
    description: 'react-grab brand magenta hue; every neutral is tinted toward it',
    overridable: true,
  },
  'chat-accent': {value: '#ff40e0', description: 'brand accent (exact react-grab hex)', overridable: true},
  'chat-accent-hi': {value: 'color-mix(in oklch, var(--chat-accent), white 14%)', description: 'accent hover'},
  'chat-accent-link': {value: 'color-mix(in oklch, var(--chat-accent), white 34%)', description: 'accent links'},
  'chat-accent-08': {value: 'color-mix(in oklch, var(--chat-accent) 10%, transparent)', description: 'accent tint 8%'},
  'chat-accent-20': {value: 'color-mix(in oklch, var(--chat-accent) 22%, transparent)', description: 'accent tint 20%'},
  'chat-accent-line': {value: 'color-mix(in oklch, var(--chat-accent) 42%, transparent)', description: 'accent border'},
  'chat-backdrop': {value: 'oklch(0 0 0 / 0.55)', description: 'dialog backdrop scrim'},
  'chat-panel': {value: 'oklch(0 0 0)', description: 'opaque true-black panel'},
  'chat-panel-sunk': {value: 'oklch(0 0 0)', description: 'deepest field bg'},
  'chat-glass': {value: 'oklch(0 0 0 / 0.97)', description: 'chat panel surface'},
  'chat-fill': {value: 'oklch(1 0 0 / 0.035)', description: 'input / elevated fill'},
  'chat-fill-soft': {value: 'oklch(1 0 0 / 0.03)', description: 'soft fill'},
  'chat-fill-strong': {value: 'oklch(1 0 0 / 0.08)', description: 'strong fill'},
  'chat-sunken': {value: 'oklch(0 0 0 / 0.5)', description: 'code / pre blocks'},
  'chat-text': {value: 'oklch(0.93 0.006 var(--chat-hue))', description: 'primary body text'},
  'chat-text-hi': {value: 'oklch(0.98 0.008 var(--chat-hue))', description: 'emphasis / near-white'},
  'chat-text-2': {value: 'oklch(0.74 0.012 var(--chat-hue))', description: 'secondary / muted'},
  'chat-text-3': {value: 'oklch(0.64 0.012 var(--chat-hue))', description: 'faint / metadata'},
  'chat-on-accent': {value: 'oklch(0.22 0.03 var(--chat-hue))', description: 'text on a magenta fill'},
  'chat-agent': {value: 'oklch(0.79 0.13 188)', description: 'fixed agent hue (teal)'},
  'chat-danger': {value: 'oklch(0.72 0.15 25)', description: 'error text on dark'},
  'chat-danger-line': {
    value: 'color-mix(in oklch, var(--chat-danger) 42%, transparent)',
    description: 'error border',
  },
  'chat-success': {value: 'oklch(0.82 0.16 162)', description: 'success'},
  'chat-warn': {value: 'oklch(0.81 0.12 95)', description: 'skipped-test gold'},
  'chat-dim': {value: 'oklch(0.5 0.02 var(--chat-hue))', description: 'thinking shimmer base'},
  'chat-line': {value: 'oklch(1 0 0 / 0.1)', description: 'line'},
  'chat-line-2': {value: 'oklch(1 0 0 / 0.18)', description: 'line strong'},
  'chat-line-soft': {value: 'oklch(1 0 0 / 0.06)', description: 'line soft'},
  'chat-radius-surface-sm': {value: '8px', description: 'floating surface radius sm'},
  'chat-radius-surface-md': {value: '12px', description: 'floating surface radius md'},
  'chat-radius-surface-lg': {value: '18px', description: 'floating surface radius lg'},
  'chat-radius-pill': {value: '999px', description: 'radius pill'},
  'chat-shadow': {value: '0 8px 28px oklch(0.12 0.02 var(--chat-hue) / 0.45)', description: 'elevation'},
  'chat-shadow-sm': {
    value: '0 2px 10px oklch(0.12 0.02 var(--chat-hue) / 0.5)',
    description: 'tight elevation for small controls',
  },
  'chat-shadow-lg': {value: '0 16px 44px oklch(0.1 0.03 var(--chat-hue) / 0.55)', description: 'elevation lg'},
  'chat-shadow-hover': {value: '0 14px 34px oklch(0.1 0.03 var(--chat-hue) / 0.6)', description: 'elevation hover'},
  'chat-ease': {value: 'cubic-bezier(0.22, 1, 0.36, 1)', description: 'ease-out-quart'},
  'chat-ease-expo': {value: 'cubic-bezier(0.16, 1, 0.3, 1)', description: 'ease-out-expo'},
  'chat-font': {
    value:
      "'Wix Madefor Text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
    description: 'sans font stack',
  },
  'chat-mono': {value: "'Roboto Mono', ui-monospace, monospace", description: 'mono font stack'},
} as const

export type ThemeTokenName = keyof typeof TOKENS
export type ThemeTokens = Partial<Record<ThemeTokenName, string>>

export function renderTokensCss(tokens: Record<string, {value: string}>): string {
  const lines = Object.entries(tokens).map(([name, def]) => `  --${name}: ${def.value};`)
  return `:host,\n:root {\n${lines.join('\n')}\n}\n`
}
