// Single source of truth for conciv design tokens; renderTokensCss() projects this to tokens.css.
export const TOKENS = {
  'pw-hue': {
    value: '328',
    description: 'react-grab brand magenta hue; every neutral is tinted toward it',
    overridable: true,
  },
  'pw-accent': {value: '#ff40e0', description: 'brand accent (exact react-grab hex)', overridable: true},
  'pw-accent-hi': {value: 'color-mix(in oklch, var(--pw-accent), white 14%)', description: 'accent hover'},
  'pw-accent-link': {value: 'color-mix(in oklch, var(--pw-accent), white 34%)', description: 'accent links'},
  'pw-accent-08': {value: 'color-mix(in oklch, var(--pw-accent) 10%, transparent)', description: 'accent tint 8%'},
  'pw-accent-20': {value: 'color-mix(in oklch, var(--pw-accent) 22%, transparent)', description: 'accent tint 20%'},
  'pw-accent-line': {value: 'color-mix(in oklch, var(--pw-accent) 42%, transparent)', description: 'accent border'},
  'pw-panel': {value: 'oklch(0.2 0.012 var(--pw-hue))', description: 'opaque dark panel'},
  'pw-panel-sunk': {value: 'oklch(0.16 0.012 var(--pw-hue))', description: 'deepest field bg'},
  'pw-glass': {value: 'oklch(0.21 0.014 var(--pw-hue) / 0.97)', description: 'chat panel surface'},
  'pw-fill': {value: 'oklch(1 0 0 / 0.05)', description: 'input / elevated fill'},
  'pw-fill-soft': {value: 'oklch(1 0 0 / 0.04)', description: 'soft fill'},
  'pw-fill-strong': {value: 'oklch(1 0 0 / 0.1)', description: 'strong fill'},
  'pw-sunken': {value: 'oklch(0.12 0.01 var(--pw-hue) / 0.5)', description: 'code / pre blocks'},
  'pw-text': {value: 'oklch(0.93 0.006 var(--pw-hue))', description: 'primary body text'},
  'pw-text-hi': {value: 'oklch(0.98 0.008 var(--pw-hue))', description: 'emphasis / near-white'},
  'pw-text-2': {value: 'oklch(0.74 0.012 var(--pw-hue))', description: 'secondary / muted'},
  'pw-text-3': {value: 'oklch(0.64 0.012 var(--pw-hue))', description: 'faint / metadata'},
  'pw-on-accent': {value: 'oklch(0.22 0.03 var(--pw-hue))', description: 'text on a magenta fill'},
  'pw-agent': {value: 'oklch(0.79 0.13 188)', description: 'fixed agent hue (teal)'},
  'pw-danger': {value: 'oklch(0.72 0.15 25)', description: 'error text on dark'},
  'pw-danger-line': {value: 'oklch(0.72 0.15 25 / 0.42)', description: 'error border'},
  'pw-success': {value: 'oklch(0.82 0.16 162)', description: 'success'},
  'pw-warn': {value: 'oklch(0.81 0.12 95)', description: 'skipped-test gold'},
  'pw-dim': {value: 'oklch(0.5 0.02 var(--pw-hue))', description: 'thinking shimmer base'},
  'pw-line': {value: 'oklch(1 0 0 / 0.1)', description: 'line'},
  'pw-line-2': {value: 'oklch(1 0 0 / 0.18)', description: 'line strong'},
  'pw-line-soft': {value: 'oklch(1 0 0 / 0.06)', description: 'line soft'},
  'pw-r-sm': {value: '8px', description: 'radius sm'},
  'pw-r-md': {value: '12px', description: 'radius md'},
  'pw-r-lg': {value: '18px', description: 'radius lg'},
  'pw-r-pill': {value: '999px', description: 'radius pill'},
  'pw-shadow': {value: '0 8px 28px oklch(0.12 0.02 var(--pw-hue) / 0.45)', description: 'elevation'},
  'pw-shadow-lg': {value: '0 16px 44px oklch(0.1 0.03 var(--pw-hue) / 0.55)', description: 'elevation lg'},
  'pw-shadow-hover': {value: '0 14px 34px oklch(0.1 0.03 var(--pw-hue) / 0.6)', description: 'elevation hover'},
  'pw-ease': {value: 'cubic-bezier(0.22, 1, 0.36, 1)', description: 'ease-out-quart'},
  'pw-ease-expo': {value: 'cubic-bezier(0.16, 1, 0.3, 1)', description: 'ease-out-expo'},
  'pw-font': {value: 'system-ui, -apple-system, sans-serif', description: 'sans font stack'},
  'pw-mono': {value: 'ui-monospace, monospace', description: 'mono font stack'},
} as const

export type ThemeTokenName = keyof typeof TOKENS
export type ThemeTokens = Partial<Record<ThemeTokenName, string>>

export function renderTokensCss(tokens: Record<string, {value: string}>): string {
  const lines = Object.entries(tokens).map(([name, def]) => `  --${name}: ${def.value};`)
  return `:host,\n:root {\n${lines.join('\n')}\n}\n`
}
