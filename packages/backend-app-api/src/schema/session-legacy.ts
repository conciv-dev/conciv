export * as SessionLegacy from './session-legacy.js'

const renames: Record<string, readonly [string, string]> = {
  'session.text.ended': ['state', 'native'],
  'session.reasoning.started': ['state', 'native'],
  'session.reasoning.ended': ['state', 'native'],
  'session.tool.called': ['state', 'native'],
  'session.step.ended': ['providerState', 'native'],
  'session.step.failed': ['providerState', 'native'],
  'session.tool.success': ['resultState', 'native'],
  'session.tool.failed': ['resultState', 'native'],
}

export function event(type: string, data: unknown) {
  if (!isRecord(data)) return data
  if (type === 'session.message.content.updated') return content(data)
  if (type === 'session.compaction.started') return omit(data, 'recent')
  if (type === 'session.compaction.ended')
    return providerContext(omit(rename(data, 'providerState', 'native'), 'recent'))
  const entry = renames[type]
  return entry ? rename(data, entry[0], entry[1]) : data
}

function content(data: Record<string, unknown>) {
  if (!Array.isArray(data.content)) return data
  return {...data, content: data.content.map(part)}
}

function part(value: unknown) {
  if (!isRecord(value)) return value
  if (value.type === 'text' || value.type === 'reasoning') return rename(value, 'state', 'native')
  if (value.type === 'tool') return toolResult(rename(value, 'providerState', 'native'))
  return value
}

function providerContext(data: Record<string, unknown>) {
  const context = data.providerContext
  const rest = omit(data, 'providerContext')
  if (!isRecord(context)) return rest
  return {
    ...rest,
    native: {messages: Array.isArray(context.messages) ? context.messages.map(media) : context.messages},
  }
}

function media(message: unknown) {
  if (!isRecord(message) || !Array.isArray(message.content)) return message
  return {
    ...message,
    content: message.content.map((part: unknown) => {
      if (!isRecord(part) || part.type !== 'media' || part.media !== undefined || typeof part.data !== 'string')
        return part
      const {mediaType, data, ...rest} = part
      return {...rest, media: {source: {type: 'base64', data, mediaType}}}
    }),
  }
}

function omit(value: Record<string, unknown>, key: string) {
  if (!(key in value)) return value
  const {[key]: _, ...rest} = value
  return rest
}

function toolResult(value: Record<string, unknown>) {
  if (!('providerResultState' in value)) return value
  const {providerResultState, ...rest} = value
  if (!isRecord(providerResultState)) return rest
  return {...rest, native: {...(isRecord(rest.native) ? rest.native : {}), ...providerResultState}}
}

function rename(value: Record<string, unknown>, from: string, to: string) {
  if (!(from in value)) return value
  const {[from]: moved, ...rest} = value
  return to in rest ? rest : {...rest, [to]: moved}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
