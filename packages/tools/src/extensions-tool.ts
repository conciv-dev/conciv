import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'

export const ExtensionsInput = z.object({
  verb: z.enum(['catalog', 'scaffold', 'validate']),
  kind: z.enum(['theme', 'composer-action', 'tool', 'tool-renderer', 'component', 'full']).optional(),
  id: z.string().optional(),
  source: z.string().optional(),
})

export const mandaraxExtensionsToolDef = toolDefinition({
  name: 'mandarax_extensions',
  description:
    'Author mandarax widget/agent extensions. verb=catalog dumps the customization surface (theme tokens, overridable components, client/server APIs); verb=scaffold returns a typed extension skeleton for a kind (theme|composer-action|tool|tool-renderer|component|full) + id; verb=validate lints draft source against the catalog. Write the returned code to mandarax/extensions/<id>.ts — it hot-reloads.',
  inputSchema: ExtensionsInput,
})
