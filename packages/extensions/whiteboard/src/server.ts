import {defineExtension} from '@mandarax/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: [],
  systemPrompt: WHITEBOARD_PROMPT,
}).server((server) => ({context: {cwd: server.cwd}}))
