import type {Theme} from '@unocss/preset-wind4'

// Color tokens → named utilities (text-pw-*, bg-pw-*, border-pw-*, stroke-pw-*). Values are the
// runtime --pw-* custom properties (a color-mix/oklch cascade off --pw-hue, defined in tokens.css);
// this maps names to them. The -NN / -line / mix entries are computed surfaces used across the cards.
export const colors = {
  'pw-accent': 'var(--pw-accent)',
  'pw-accent-hi': 'var(--pw-accent-hi)',
  'pw-accent-link': 'var(--pw-accent-link)',
  'pw-accent-08': 'var(--pw-accent-08)',
  'pw-accent-20': 'var(--pw-accent-20)',
  'pw-accent-line': 'var(--pw-accent-line)',

  'pw-panel': 'var(--pw-panel)',
  'pw-panel-sunk': 'var(--pw-panel-sunk)',
  'pw-glass': 'var(--pw-glass)',
  'pw-fill': 'var(--pw-fill)',
  'pw-fill-soft': 'var(--pw-fill-soft)',
  'pw-fill-strong': 'var(--pw-fill-strong)',
  'pw-sunken': 'var(--pw-sunken)',

  'pw-text': 'var(--pw-text)',
  'pw-text-hi': 'var(--pw-text-hi)',
  'pw-text-2': 'var(--pw-text-2)',
  'pw-text-3': 'var(--pw-text-3)',
  'pw-on-accent': 'var(--pw-on-accent)',

  'pw-agent': 'var(--pw-agent)',
  'pw-danger': 'var(--pw-danger)',
  'pw-danger-line': 'var(--pw-danger-line)',
  'pw-success': 'var(--pw-success)',
  'pw-warn': 'var(--pw-warn)',
  'pw-dim': 'var(--pw-dim)',

  'pw-line': 'var(--pw-line)',
  'pw-line-2': 'var(--pw-line-2)',
  'pw-line-soft': 'var(--pw-line-soft)',

  // Computed mixes used inline by a few cards (kept here so code never writes color-mix()).
  'pw-read': 'color-mix(in oklch, var(--pw-accent) 30%, var(--pw-agent))', // file-read card rail
  'pw-danger-10': 'color-mix(in oklch, var(--pw-danger) 10%, transparent)',
  'pw-danger-14': 'color-mix(in oklch, var(--pw-danger) 14%, transparent)',
  'pw-danger-18': 'color-mix(in oklch, var(--pw-danger) 18%, transparent)',
  'pw-success-18': 'color-mix(in oklch, var(--pw-success) 18%, transparent)',
  'pw-warn-20': 'color-mix(in oklch, var(--pw-warn) 20%, transparent)',
  'pw-panel-60': 'color-mix(in srgb, var(--pw-panel) 60%, transparent)', // session-switching overlay
} satisfies Theme['colors']
