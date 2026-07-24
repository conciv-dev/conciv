import type {StaticShortcutMap} from 'unocss'

export const shortcuts = {
  'prose-pw': 'prose max-w-none !text-[0.875rem] !leading-[1.45] [&>:first-child]:mt-0 [&>:last-child]:mb-0',
  'pad-safe':
    'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
} satisfies StaticShortcutMap
