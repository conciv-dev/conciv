import {toEscapedSelector, type Rule} from 'unocss'

export const DENSITY_CLASS = 'chat-density'

const SPACING_FALLBACK = '0.25rem'

export const densityRules: Rule[] = [
  [
    new RegExp(`^${DENSITY_CLASS}$`),
    (_match, {rawSelector}) =>
      `${toEscapedSelector(rawSelector)} {\n  --spacing: var(--chat-space, ${SPACING_FALLBACK});\n}`,
  ],
]
