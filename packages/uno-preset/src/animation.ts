import type {Theme} from '@unocss/preset-wind4'

export const animation = {
  keyframes: {
    'pw-fab-ring': '{0%{opacity:0.7;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.5)}}',
    'pw-dot': '{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-6px);opacity:1}}',

    'pw-expand-height': '{from{height:var(--collapsed-height,0);opacity:0}to{height:var(--height);opacity:1}}',
    'pw-collapse-height': '{from{height:var(--height);opacity:1}to{height:var(--collapsed-height,0);opacity:0}}',

    'pw-think-shimmer': '{to{background-position:-200% 0}}',

    'pw-presence-in': '{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}',
    'pw-presence-out': '{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0.96)}}',

    'pw-slide-in-right': '{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}',
    'pw-slide-in-left': '{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}',

    'pw-fade-in-up': '{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    'pw-zoom-in': '{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}',

    'pw-loader-sweep-a': '{to{--pw-loader-angle-a:360deg}}',
    'pw-loader-sweep-b': '{to{--pw-loader-angle-b:360deg}}',
    'pw-loader-sweep-c': '{to{--pw-loader-angle-c:-180deg}}',
    'pw-loader-sweep-d': '{to{--pw-loader-angle-d:630deg}}',
    'pw-loader-breathe': '{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}',
    'pw-loader-spin': '{to{transform:rotate(360deg)}}',
    'pw-loader-spin-reverse': '{to{transform:rotate(-360deg)}}',
    'pw-loader-label-pulse': '{0%,100%{opacity:0.9}50%{opacity:0.7}}',
    'pw-loader-description-pulse': '{0%,100%{opacity:0.6}50%{opacity:0.4}}',
  },
} satisfies Theme['animation']
