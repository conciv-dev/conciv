import type {Theme} from '@unocss/preset-wind4'

// Font tokens → font-pw (system sans) / font-pw-mono utilities.
export const font = {
  pw: 'var(--pw-font)',
  'pw-mono': 'var(--pw-mono)',
} satisfies Theme['font']
