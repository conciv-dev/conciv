import type {Theme} from '@unocss/preset-wind4'

// Custom keyframes with no faithful wind4 built-in (px-precise; wind4's set is %/scale-based): the FAB halo + the typing-dot bounce.
export const animation = {
  keyframes: {
    'pw-fab-ring': '{0%{opacity:0.7;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.5)}}',
    'pw-dot': '{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-6px);opacity:1}}',
    // Ark Collapsible — per the Ark docs: Ark sets --height/--collapsed-height on the content and waits
    // for animationend before hiding. Height + fade, driven by data-state (animation, never transition).
    'pw-expand-height': '{from{height:var(--collapsed-height,0);opacity:0}to{height:var(--height);opacity:1}}',
    'pw-collapse-height': '{from{height:var(--height);opacity:1}to{height:var(--collapsed-height,0);opacity:0}}',
    // The "Thinking…" label's text-clip gradient sweep (background-position shift; pairs with bg-size 200%).
    'pw-think-shimmer': '{to{background-position:-200% 0}}',
  },
} satisfies Theme['animation']
