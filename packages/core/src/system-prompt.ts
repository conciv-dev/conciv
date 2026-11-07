import type {AnyExtension, ExtensionPromptContext} from '@conciv/extension'
import type {WidgetHost} from '@conciv/protocol/push-types'

type SystemPromptOpts = ExtensionPromptContext & {extensions?: Record<string, unknown>}

export function createSystemPrompt(
  base: string | undefined,
  extensions: readonly AnyExtension[],
  opts: SystemPromptOpts,
): (host: WidgetHost | null) => string {
  const resolved = extensions.flatMap((extension) => {
    const text = extension.systemPrompt?.(opts.extensions?.[extension.name], {cwd: opts.cwd})
    return text ? [{hosts: extension.hosts, text}] : []
  })
  return (host) =>
    [base, ...resolved.filter((entry) => servesHost(entry.hosts, host)).map((entry) => entry.text)]
      .filter(Boolean)
      .join('\n\n')
}

function servesHost(hosts: readonly WidgetHost[], host: WidgetHost | null): boolean {
  return host === null || hosts.includes(host)
}
