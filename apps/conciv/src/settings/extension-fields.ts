import {lowerCase, memoize, partition, upperFirst} from 'es-toolkit'
import {z} from 'zod'
import type {AnyExtension, ExtensionSettingsSchema} from '@conciv/extension'

type Option = {value: string; label: string}

type FieldText = {key: string; label: string; hint?: string}

export type ExtensionField =
  | (FieldText & {kind: 'switch' | 'text'})
  | (FieldText & {kind: 'segment' | 'select'; options: Option[]})
  | (FieldText & {kind: 'number'; min?: number; max?: number; step?: number})

const SEGMENT_LIMIT = 3

export type ExtensionSettingsPage = {title: string; fields: ExtensionField[]}

export const extensionSettingsPage = memoize((extension: AnyExtension): ExtensionSettingsPage => {
  const entries = Object.entries(extension.settings?.shape ?? {})
  const [supported, unsupported] = partition(entries, ([, field]) => control(field.unwrap()) !== undefined)
  if (unsupported.length > 0)
    console.warn(
      `conciv: the settings page has no control for ${unsupported.map(([key]) => `"${key}"`).join(', ')} of extension "${extension.name}"`,
    )
  const fields = supported.flatMap(([key, field]) => {
    const kind = control(field.unwrap())
    return kind ? [kind({key, ...describe(key, field)})] : []
  })
  return {title: humanise(extension.name), fields}
})

type ShapeField = ExtensionSettingsSchema['shape'][string]

function describe(key: string, field: ShapeField): Omit<FieldText, 'key'> {
  const meta = field.meta() ?? z.globalRegistry.get(field.unwrap())
  return {label: meta?.title ?? humanise(key), hint: meta?.description}
}

function control(inner: z.core.SomeType): ((text: FieldText) => ExtensionField) | undefined {
  if (inner instanceof z.ZodBoolean) return (text) => ({...text, kind: 'switch'})
  if (inner instanceof z.ZodString) return (text) => ({...text, kind: 'text'})
  if (inner instanceof z.ZodNumber)
    return (text) => ({
      ...text,
      kind: 'number',
      min: inner.minValue ?? undefined,
      max: inner.maxValue ?? undefined,
      step: inner.isInt ? 1 : undefined,
    })
  if (inner instanceof z.ZodEnum) {
    const options = inner.options.map((value) => ({value: String(value), label: humanise(String(value))}))
    return (text) => ({...text, kind: options.length > SEGMENT_LIMIT ? 'select' : 'segment', options})
  }
  return undefined
}

function humanise(key: string): string {
  return upperFirst(lowerCase(key))
}
