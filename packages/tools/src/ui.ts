import {toolDefinition} from '@tanstack/ai'
import {UiAnswerSchema, UiInputSchema} from '@conciv/protocol/ui-types'

export const concivUiToolDef = toolDefinition({
  name: 'conciv_ui',
  description:
    'Ask the user a question with real interactive UI (choices/confirm/diff/form/questions) rendered in the chat thread. Blocks until they answer: the result carries their answer. If they do not answer within the wait window, the result says so and their answer may arrive as a later message instead. Use kind "questions" for one or more multiple-choice questions (each with its own options, optional per-option description, and optional multiSelect) — this replaces the native AskUserQuestion tool, which is disabled here.',
  inputSchema: UiInputSchema,
  outputSchema: UiAnswerSchema,
})
