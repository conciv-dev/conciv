import type {Component} from 'solid-js'
import type {AttachmentExpand, ExtensionAttachment} from './types.js'

export type AttachmentBuilder<Ctx = unknown> = ExtensionAttachment & {
  __ctx?: Ctx
  __expand?: AttachmentExpand<Ctx>
  card: (component: Component) => AttachmentBuilder<Ctx>
  server: (expand: AttachmentExpand<Ctx>) => AttachmentBuilder<Ctx>
}

export type AnyAttachmentBuilder = ExtensionAttachment & {__expand?: AttachmentExpand<never>}

export function defineAttachment<Ctx = unknown>(def: {mime: string}): AttachmentBuilder<Ctx> {
  const builder: AttachmentBuilder<Ctx> = {
    mime: def.mime,
    card(component) {
      builder.__card = component
      return builder
    },
    server(expand) {
      builder.__expand = expand
      return builder
    },
  }
  return builder
}
