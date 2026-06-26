import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'

export const ExtensionsInput = z.object({
  verb: z.enum(['catalog', 'scaffold', 'validate']),
  kind: z.enum(['theme', 'composer-action', 'tool', 'tool-renderer', 'component', 'full']).optional(),
  // An extension name doubles as the filename and a JS identifier in scaffolds, so keep it identifier-safe.
  name: z
    .string()
    .regex(/^[a-zA-Z]\w*$/, 'name must start with a letter and contain only letters, digits, or _')
    .optional(),
  source: z.string().optional(),
})

export const mandaraxExtensionsToolDef = toolDefinition({
  name: 'mandarax_extensions',
  description:
    'Author mandarax widget/agent extensions on the import-based contract (defineExtension({name}).client().server(), a SolidJS Component branching on useSlot()/useContext(), declarative theme, defineTool().server().render()). verb=catalog dumps the customization surface (theme tokens, the six slots, client/server surfaces); verb=scaffold returns a typed extension skeleton for a kind (theme|composer-action|tool|tool-renderer|component|full) + name; verb=validate lints draft source against the catalog. Write the returned code to mandarax/extensions/<name>.tsx for kinds that render JSX (composer-action, tool-renderer, component, full) and mandarax/extensions/<name>.ts otherwise (theme, tool) — JSX in a .ts file fails to parse. Client (.client) changes hot-reload into the live widget; new or changed server (.server) tools and prompt text need a dev-server restart.',
  inputSchema: ExtensionsInput,
})
