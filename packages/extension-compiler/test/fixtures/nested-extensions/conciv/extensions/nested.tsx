import {defineExtension} from '@conciv/extension'
import {nestedTool} from './lib/nested-tool.tsx'

export default defineExtension({hosts: ['web', 'ios'], name: 'nested', tools: [nestedTool]})
