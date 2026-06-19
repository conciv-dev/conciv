// The chat prose variant (markdown.tsx uses `prose-pw`). Prose colours live on the preset's colorScheme
// (see typography.ts), so prose-pw only pins the compact size + flush first/last margins. sr-only is a
// presetWind4 native now, so it's no longer defined here.
import type {StaticShortcutMap} from 'unocss'

export const shortcuts = {
  'prose-pw': 'prose max-w-none !text-[0.875rem] !leading-[1.45] [&>:first-child]:mt-0 [&>:last-child]:mb-0',
} satisfies StaticShortcutMap
