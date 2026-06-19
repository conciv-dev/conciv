// Elevation tokens → shadow-pw / shadow-pw-lg / shadow-pw-hover. Shortcuts (bare box-shadow) rather
// than theme.boxShadow on purpose: presetMini's shadow-* composites the --un-ring scaffolding into the
// value (harmless empty rings, but a different computed string); a bare box-shadow is exactly the token.
import type {StaticShortcutMap} from 'unocss'

export const shadows = {
  'shadow-pw': '[box-shadow:var(--pw-shadow)]',
  'shadow-pw-lg': '[box-shadow:var(--pw-shadow-lg)]',
  'shadow-pw-hover': '[box-shadow:var(--pw-shadow-hover)]',
} satisfies StaticShortcutMap
