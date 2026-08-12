import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCaptureView} from '@conciv/protocol/element-capture-types'
import {pageVerbOfTool} from '../../shared/defs.js'

export type PageSessionStep = {
  verb: string
  target: string
  namedTarget: boolean
  value?: string
  state: 'streaming' | 'complete' | 'error' | 'aborted'
}

const StepInput = z.record(z.string(), z.unknown())

const FIXED_TARGETS: Record<string, string> = {css: 'stylesheet', eval: 'script', effect: 'effect'}

const SCRIPT_VERBS = new Set(['eval', 'css', 'effect'])

const CODE_INPUT_KEYS: Record<string, string> = {eval: 'code', css: 'text'}

const CHIP_BUDGET = 64

function clipLine(value: string): string {
  return value.length > CHIP_BUDGET ? `${value.slice(0, CHIP_BUDGET - 1)}…` : value
}

function firstMeaningfulLine(text: string): string | undefined {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length > 0) return trimmed
  }
  return undefined
}

export function pageSessionScripted(steps: ReadonlyArray<PageSessionStep>): boolean {
  return steps.length > 0 && steps.every((step) => SCRIPT_VERBS.has(step.verb))
}

function stepInput(part: ToolCallPart): Record<string, unknown> {
  const direct = StepInput.safeParse(part.input)
  if (direct.success) return direct.data
  if (typeof part.arguments !== 'string' || part.arguments.length === 0) return {}
  try {
    const parsed = StepInput.safeParse(JSON.parse(part.arguments))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function descriptorField(capture: ToolCaptureView | undefined, field: 'accessibleName' | 'value'): string | undefined {
  return nonEmpty(capture?.after?.descriptor[field]) ?? nonEmpty(capture?.before?.descriptor[field])
}

function stepTarget(
  verb: string,
  input: Record<string, unknown>,
  capture: ToolCaptureView | undefined,
): {target: string; namedTarget: boolean} {
  const fixed = FIXED_TARGETS[verb]
  if (fixed !== undefined) return {target: fixed, namedTarget: false}
  const named = descriptorField(capture, 'accessibleName')
  if (named !== undefined) return {target: named, namedTarget: true}
  const located = nonEmpty(input.selector) ?? nonEmpty(input.ref)
  if (located !== undefined) return {target: located, namedTarget: false}
  const componentName = nonEmpty(input.name)
  if (componentName !== undefined) return {target: componentName, namedTarget: true}
  return {target: 'page', namedTarget: false}
}

function stepValue(
  verb: string,
  input: Record<string, unknown>,
  capture: ToolCaptureView | undefined,
): string | undefined {
  const codeKey = CODE_INPUT_KEYS[verb]
  if (codeKey !== undefined) {
    const source = nonEmpty(input[codeKey])
    if (source === undefined) return undefined
    return clipLine(firstMeaningfulLine(source) ?? source)
  }
  return nonEmpty(input.value) ?? descriptorField(capture, 'value')
}

function stepState(result: ToolResultPart | undefined, streaming: boolean): PageSessionStep['state'] {
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete') return 'complete'
  return streaming ? 'streaming' : 'aborted'
}

export function pageSessionSteps(
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
  captureFor: (toolCallId: string) => ToolCaptureView | undefined,
  actNames: ReadonlySet<string>,
  streaming: boolean,
): PageSessionStep[] {
  return parts
    .filter((part) => actNames.has(part.name))
    .map((part) => {
      const verb = pageVerbOfTool(part.name)
      const input = stepInput(part)
      const capture = captureFor(part.id)
      return {
        verb,
        ...stepTarget(verb, input, capture),
        value: stepValue(verb, input, capture),
        state: stepState(resultFor(part.id), streaming),
      }
    })
}
