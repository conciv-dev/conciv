import type {Theme} from '@unocss/preset-wind4'
import {leading} from '@unocss/preset-wind4/theme'

export const text = {
  'chat-micro': {fontSize: 'var(--chat-text-micro)', lineHeight: leading.none},
  'chat-xs': {fontSize: 'var(--chat-text-xs)', lineHeight: leading.snug},
  'chat-sm': {fontSize: 'var(--chat-text-sm)', lineHeight: leading.normal},
  'chat-md': {fontSize: 'var(--chat-text-md)', lineHeight: leading.normal},
  'chat-body': {fontSize: 'var(--chat-text-body)', lineHeight: leading.relaxed},
  'chat-lg': {fontSize: 'var(--chat-text-lg)', lineHeight: leading.normal},
} satisfies Theme['text']
