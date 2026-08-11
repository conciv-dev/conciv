import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ElementDescriptor, ToolCaptureView} from '@conciv/protocol/element-capture-types'
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

function stepDescriptor(capture: ToolCaptureView | undefined): ElementDescriptor | undefined {
  return capture?.after?.descriptor ?? capture?.before?.descriptor
}

function stepTarget(
  verb: string,
  input: Record<string, unknown>,
  descriptor: ElementDescriptor | undefined,
): {target: string; namedTarget: boolean} {
  const fixed = FIXED_TARGETS[verb]
  if (fixed !== undefined) return {target: fixed, namedTarget: false}
  const named = nonEmpty(descriptor?.accessibleName)
  if (named !== undefined) return {target: named, namedTarget: true}
  const located = nonEmpty(input.selector) ?? nonEmpty(input.ref)
  if (located !== undefined) return {target: located, namedTarget: false}
  const componentName = nonEmpty(input.name)
  if (componentName !== undefined) return {target: componentName, namedTarget: true}
  return {target: 'page', namedTarget: false}
}

function stepValue(input: Record<string, unknown>, descriptor: ElementDescriptor | undefined): string | undefined {
  return nonEmpty(input.value) ?? nonEmpty(descriptor?.value)
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
      const descriptor = stepDescriptor(captureFor(part.id))
      return {
        verb,
        ...stepTarget(verb, input, descriptor),
        value: stepValue(input, descriptor),
        state: stepState(resultFor(part.id), streaming),
      }
    })
}
