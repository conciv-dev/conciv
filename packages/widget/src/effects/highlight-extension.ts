import {defineExtension} from '@mandarax/extensions'
import {highlightEffect} from './highlight.js'

// The built-in highlight extension, bundled with the widget and applied through the same use() pipe as
// a discovered user extension (mount.tsx). It contributes only the effect.
export default defineExtension({id: 'highlight', effects: [highlightEffect]})
