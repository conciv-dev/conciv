import presetTypography from '@unocss/preset-typography'

// `prose` themed to the chat's compact base (markdown.tsx applies the prose-pw shortcut). Block margins
// are pinned compact (prose's document-scale defaults are too tall for bubbles); Shiki paints code
// blocks, so prose's inline-code backticks are suppressed and the inline-code chip kept.
export const typography = presetTypography({
  // Prose colours set as the scheme (so bare `prose` reads right) instead of var-overrides on prose-pw:
  // body/headings/bold/code inherit the chat surface; links/quotes/borders/pre-bg use --pw-* tokens.
  colorScheme: {
    body: 'inherit',
    headings: 'inherit',
    bold: 'inherit',
    code: 'inherit',
    bullets: 'currentColor',
    counters: 'currentColor',
    links: 'var(--pw-accent-link)',
    quotes: 'var(--pw-text-2)',
    'quote-borders': 'var(--pw-line-2)',
    hr: 'var(--pw-line)',
    'pre-bg': 'var(--pw-sunken)',
  },
  cssExtend: {
    p: {margin: '0 0 0.5rem'},
    'ul,ol': {margin: '0 0 0.5rem', 'padding-left': '1.25rem'},
    li: {margin: '0.125rem 0', 'padding-left': '0'},
    'h1,h2,h3,h4,h5,h6': {
      margin: '0.75rem 0 0.375rem',
      'font-weight': '600',
      'letter-spacing': '-0.01em',
      'line-height': '1.3',
    },
    h1: {'font-size': '1.15em'},
    h2: {'font-size': '1.07em'},
    h3: {'font-size': '1em'},
    blockquote: {
      margin: '0 0 0.5rem',
      'padding-left': '0.625rem',
      'border-left': '2px solid var(--pw-line-2)',
      color: 'var(--pw-text-2)',
      'font-style': 'normal',
      'font-weight': '400',
    },
    pre: {
      margin: '0.5rem 0',
      padding: '0.625rem 0.75rem',
      'border-radius': '0.5625rem',
      'font-size': '0.75rem',
      'line-height': '1.5',
    },
    'code::before': {content: 'none'},
    'code::after': {content: 'none'},
    code: {
      'background-color': 'var(--pw-fill-strong)',
      padding: '1px 5px',
      'border-radius': '5px',
      'font-weight': '400',
    },
    'pre code': {'background-color': 'transparent', padding: '0', 'font-size': 'inherit'},
  },
})
