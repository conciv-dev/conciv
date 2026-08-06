import {defineExtension} from '@conciv/extension'
import {nestedTool} from './lib/nested-tool.tsx'

export default defineExtension({name: 'nested', tools: [nestedTool]})
