import type {Skin} from './skin-contract.js'

const SANS =
  "'Source Sans 3', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const DISPLAY = "'Archivo', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

export const concivSkin: Skin = {
  name: 'conciv',
  label: 'Conciv',
  description: 'The default look: cool neutral panels, a blue accent on light and a warm clay accent on dark.',
  pairs: {
    'chat-panel': {light: '#f6f7f9', dark: '#17161a'},
    'chat-glass': {light: 'rgba(246, 247, 249, 0.97)', dark: 'rgba(23, 22, 26, 0.97)'},
    'chat-sunken': {light: 'rgba(15, 18, 24, 0.05)', dark: 'rgba(0, 0, 0, 0.35)'},
    'chat-ground': {light: '#ffffff', dark: '#0a0a0b'},
    'chat-backdrop': {light: 'oklch(0 0 0 / 0.55)', dark: 'oklch(0 0 0 / 0.55)'},
    'chat-text': {light: '#1d2127', dark: '#d8d2ce'},
    'chat-text-hi': {light: '#0b0d10', dark: '#f0ebe8'},
    'chat-text-2': {light: '#565b63', dark: '#a29c9c'},
    'chat-text-3': {light: '#6b717a', dark: '#7d787d'},
    'chat-fill': {light: 'rgba(15, 18, 24, 0.04)', dark: 'rgba(255, 255, 255, 0.05)'},
    'chat-fill-soft': {light: 'rgba(15, 18, 24, 0.03)', dark: 'rgba(255, 255, 255, 0.03)'},
    'chat-fill-strong': {light: 'rgba(15, 18, 24, 0.08)', dark: 'rgba(255, 255, 255, 0.1)'},
    'chat-line': {light: 'rgba(15, 18, 24, 0.12)', dark: '#272428'},
    'chat-line-soft': {light: 'rgba(15, 18, 24, 0.06)', dark: '#232025'},
    'chat-line-2': {light: 'rgba(15, 18, 24, 0.18)', dark: '#322e33'},
    'chat-accent': {light: '#2563eb', dark: '#c9857f'},
    'chat-on-accent': {light: '#ffffff', dark: '#14100f'},
    'chat-danger': {light: '#dc2626', dark: '#d98070'},
    'chat-success': {light: '#16a34a', dark: '#6fbf8b'},
    'chat-warn': {light: '#a16207', dark: '#c9a86a'},
    'chat-dim': {light: '#6b717a', dark: '#8d8887'},
    'chat-shadow-sm': {light: '0 2px 10px rgba(15, 18, 24, 0.14)', dark: '0 2px 10px rgba(0, 0, 0, 0.5)'},
    'chat-shadow-lg': {light: '0 16px 44px rgba(15, 18, 24, 0.18)', dark: '0 16px 44px rgba(0, 0, 0, 0.6)'},
  },
  scalars: {
    'chat-font': SANS,
    'chat-font-display': DISPLAY,
    'chat-mono': MONO,
    'chat-radius-sm': '4px',
    'chat-radius-md': '4px',
    'chat-radius-lg': '11px',
    'chat-radius-chip': '3px',
    'chat-radius-pill': '999px',
    'chat-radius-surface-sm': '4px',
    'chat-radius-surface-md': '8px',
    'chat-radius-surface-lg': '12px',
    'chat-ease': 'cubic-bezier(0.22, 1, 0.36, 1)',
    'chat-ease-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
    'chat-space': '0.25rem',
  },
}
