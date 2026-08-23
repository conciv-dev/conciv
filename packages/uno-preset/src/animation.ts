import type {Theme} from '@unocss/preset-wind4'

export const animation = {
  keyframes: {
    'chat-fab-ring': '{0%{opacity:0.7;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.5)}}',
    'chat-dot': '{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-6px);opacity:1}}',
    'chat-run-pulse': '{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.35;transform:scale(0.6)}}',

    'chat-collapse-open': '{from{grid-template-rows:0fr}to{grid-template-rows:1fr}}',
    'chat-collapse-close': '{from{grid-template-rows:1fr}to{grid-template-rows:0fr}}',

    'chat-think-shimmer': '{to{background-position:-200% 0}}',

    'chat-presence-in': '{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}',
    'chat-presence-out': '{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0.96)}}',

    'chat-slide-in-right': '{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}',
    'chat-slide-in-left': '{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}',

    'chat-word-in':
      '{from{opacity:0;transform:translateY(4px);filter:blur(1.5px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}',
    'chat-word-out':
      '{from{opacity:1;transform:translateY(0);filter:blur(0);visibility:visible}to{opacity:0;transform:translateY(-4px);filter:blur(1.5px);visibility:hidden}}',

    'chat-fade-in-up': '{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    'chat-zoom-in': '{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}',
  },
} satisfies Theme['animation']
