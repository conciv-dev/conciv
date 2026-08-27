export type DerivedTokenDefinition = {value: string; description: string}

export const DERIVED_TOKENS: Record<string, DerivedTokenDefinition> = {
  'chat-accent-hi': {
    value:
      'light-dark(color-mix(in oklch, var(--chat-accent), #000000 14%), color-mix(in oklch, var(--chat-accent), #ffffff 14%))',
    description: 'accent hover, mixed toward black on light and toward white on dark',
  },
  'chat-accent-link': {value: 'light-dark(var(--chat-accent), var(--chat-accent-hi))', description: 'accent links'},
  'chat-accent-08': {value: 'color-mix(in oklch, var(--chat-accent) 10%, transparent)', description: 'accent tint 8%'},
  'chat-accent-20': {value: 'color-mix(in oklch, var(--chat-accent) 22%, transparent)', description: 'accent tint 20%'},
  'chat-accent-line': {value: 'color-mix(in oklch, var(--chat-accent) 42%, transparent)', description: 'accent border'},
  'chat-panel-sunk': {value: 'var(--chat-panel)', description: 'deepest field bg'},
  'chat-agent': {
    value: 'light-dark(color-mix(in oklch, oklch(0.79 0.13 188), var(--chat-text-hi) 45%), oklch(0.79 0.13 188))',
    description: 'fixed agent hue (teal), darkened toward the ink anchor on light',
  },
  'chat-danger-line': {value: 'color-mix(in oklch, var(--chat-danger) 42%, transparent)', description: 'error border'},
  'chat-shadow': {value: 'var(--chat-shadow-sm)', description: 'elevation'},
  'chat-shadow-hover': {value: 'var(--chat-shadow-lg)', description: 'elevation hover'},
}
