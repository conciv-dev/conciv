import type {Theme} from '@unocss/preset-wind4'

// Motion tokens → ease-pw (quart, micro-interactions) / ease-pw-expo (entrances) utilities.
export const ease = {
  pw: 'var(--pw-ease)',
  'pw-expo': 'var(--pw-ease-expo)',
} satisfies Theme['ease']
