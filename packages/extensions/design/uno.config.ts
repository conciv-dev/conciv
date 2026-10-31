import {fileURLToPath} from 'node:url'
import {presetConciv} from '@conciv/uno-preset'
import {defineConfig, presetIcons} from 'unocss'

function local(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

const GLASS_LIGHT_RATIO = 1.3

function glass(match: string[]): string | undefined {
  const opacity = Number(match[1] ?? '50')
  if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100) return undefined
  const light = Math.min(Math.round(opacity * GLASS_LIGHT_RATIO), 100)
  return `bg-white/${light} dark:bg-[#050505]/${opacity} backdrop-blur-[7px]`
}

function badge(match: string[]): string {
  const color = match[1] ?? 'gray'
  return `bg-${color}-400/20 dark:bg-${color}-400/10 text-${color}-700 dark:text-${color}-300 border-${color}-600/10 dark:border-${color}-300/10`
}

export default defineConfig({
  content: {filesystem: [local('src/xray/**/*.{ts,tsx,html}'), local('../../ui-kit-system/src/**/*.{ts,tsx}')]},
  presets: [
    presetConciv(),
    presetIcons({
      scale: 1.2,
      collections: {ph: () => import('@iconify-json/ph/icons.json').then((icons) => icons.default)},
    }),
  ],
  theme: {
    colors: {
      primary: {
        50: '#f5f6ff',
        100: '#e9edff',
        200: '#d3dafe',
        300: '#b5c2fe',
        400: '#90a3fe',
        DEFAULT: '#6b84fd',
        500: '#6b84fd',
        600: '#5e74df',
        700: '#4d5fb6',
        800: '#3c4a8e',
        900: '#2d376a',
        950: '#1c2242',
      },
    },
  },
  shortcuts: [
    {
      'color-base': 'text-neutral-800 dark:text-neutral-200',
      'bg-base': 'bg-white dark:bg-[#111]',
      'bg-active': 'bg-[#8881]',
      'bg-secondary': 'bg-[#eee] dark:bg-[#222]',
      'border-base': 'border-[#8882]',
      'color-active': 'text-primary-600 dark:text-primary-300',
      'border-active': 'border-primary-600/25 dark:border-primary-400/25',
      'color-meta': 'text-neutral-500 dark:text-neutral-400',
      'op-fade': 'op-65 dark:op-55',
      'bg-code': 'bg-gray-500/5',
      'bg-tooltip': 'bg-white/75 dark:bg-[#111]/75 backdrop-blur-[8px]',
      'bg-dots': 'bg-white dark:bg-black',
      badge: 'text-[11px] leading-[1.6em] px-1.5 rounded whitespace-nowrap',
      'focus-base': 'outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      'btn-action':
        'border border-base rounded flex gap-2 items-center px-2 py-1 op-75 hover:op-100 hover:bg-active transition focus-base active:scale-97 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:op-30!',
      'btn-action-sm': 'btn-action text-sm',
      'btn-action-active': 'color-active border-active! bg-active op-100!',
      'btn-primary':
        'px-3 py-1.5 rounded flex gap-2 items-center bg-primary-500 hover:bg-primary-600 text-white transition disabled:op-50 disabled:pointer-events-none focus-base active:scale-97 motion-reduce:active:scale-100',
      'btn-icon-compact':
        'w-6 h-6 rounded flex items-center justify-center op-75 hover:op-100 hover:bg-active transition focus-base disabled:pointer-events-none disabled:op-30!',
    },
    [/^bg-glass(?::(\d+))?$/, glass, {layer: 'shortcuts'}],
    [/^badge-color-(\w+)$/, badge],
  ],
})
