import {toolDefinition, type AnyTool} from '@tanstack/ai'

export type ChatTool = AnyTool

export const defineTool: typeof toolDefinition = (config) => toolDefinition(config)
