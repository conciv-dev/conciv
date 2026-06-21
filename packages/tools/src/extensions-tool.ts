import {z} from 'zod'
import {defineTool, buildCatalog, scaffold, validateSource, type ToolDefinition} from '@mandarax/extensions'

export const ExtensionsInput = z.object({
  verb: z.enum(['catalog', 'scaffold', 'validate']),
  kind: z.enum(['theme', 'composer-action', 'tool', 'tool-renderer', 'component', 'full']).optional(),
  // An extension id doubles as the filename and a JS identifier in scaffolds, so keep it identifier-safe.
  id: z
    .string()
    .regex(/^[a-zA-Z]\w*$/, 'id must start with a letter and contain only letters, digits, or _')
    .optional(),
  source: z.string().optional(),
})

// Stateless (no ctx): catalog/scaffold/validate are pure projections of node-safe extension metadata.
export function createExtensionsToolDefinition(): ToolDefinition<typeof ExtensionsInput> {
  return defineTool({
    name: 'mandarax_extensions',
    label: 'Extensions',
    description:
      'Author mandarax widget/agent extensions. verb=catalog dumps the customization surface (theme tokens, overridable components, client/server APIs); verb=scaffold returns a typed extension skeleton for a kind (theme|composer-action|tool|tool-renderer|component|full) + id; verb=validate lints draft source against the catalog. Write the returned code to mandarax/extensions/<id>.tsx for kinds that render JSX (tool-renderer, component, full) and mandarax/extensions/<id>.ts otherwise (theme, composer-action, tool) — JSX in a .ts file fails to parse. Client (.client) changes hot-reload into the live widget; new or changed server (.server) tools and prompt text need a dev-server restart.',
    parameters: ExtensionsInput,
    execute: (input) => {
      if (input.verb === 'catalog') return buildCatalog()
      if (input.verb === 'scaffold') {
        if (!input.kind || !input.id) throw new Error('scaffold needs {kind, id}')
        return {code: scaffold(input.kind, {id: input.id})}
      }
      if (!input.source) throw new Error('validate needs {source}')
      return validateSource(input.source)
    },
  })
}
