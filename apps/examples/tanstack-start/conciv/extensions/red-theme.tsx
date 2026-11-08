import {defineExtension} from '@conciv/extension'

const redTheme = defineExtension({
  name: 'red-theme',
  theme: {'pw-accent': 'oklch(0.7 0.19 32)', 'pw-hue': '30'},
})
export default redTheme
