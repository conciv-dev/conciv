import {fileURLToPath} from 'node:url'
import {presetConciv} from '@conciv/uno-preset'
import {defineConfig, presetIcons} from 'unocss'

function local(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
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
      'bg-glass': 'bg-white/65 dark:bg-[#050505]/50 backdrop-blur-[7px]',
      'bg-glass:80': 'bg-white dark:bg-[#050505]/80 backdrop-blur-[7px]',
      'badge-color-orange':
        'bg-orange-400/20 dark:bg-orange-400/10 text-orange-700 dark:text-orange-300 border-orange-600/10 dark:border-orange-300/10',
      'badge-color-red':
        'bg-red-400/20 dark:bg-red-400/10 text-red-700 dark:text-red-300 border-red-600/10 dark:border-red-300/10',
      'badge-color-amber':
        'bg-amber-400/20 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 border-amber-600/10 dark:border-amber-300/10',
      'badge-color-green':
        'bg-green-400/20 dark:bg-green-400/10 text-green-700 dark:text-green-300 border-green-600/10 dark:border-green-300/10',
      'btn-icon-compact':
        'w-6 h-6 rounded flex items-center justify-center op-75 hover:op-100 hover:bg-active transition focus-base disabled:pointer-events-none disabled:op-30!',
    },
  ],
})
