import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'

export const ExtensionsInput = z.object({
  verb: z.enum(['catalog', 'scaffold', 'validate']),
  kind: z.enum(['composer-action', 'tool', 'tool-renderer', 'component', 'full']).optional(),

  name: z
    .string()
    .regex(/^[a-zA-Z]\w*$/, 'name must start with a letter and contain only letters, digits, or _')
    .optional(),
  source: z.string().optional(),
})

export const concivExtensionsToolDef = toolDefinition({
  name: 'conciv_extensions',
  description:
    'Author conciv widget/agent extensions on the import-based contract (defineExtension({name}).client().server(), a SolidJS Component branching on useSlot()/useContext(), defineTool().server().render()). Extensions style exclusively through the widget --chat-* tokens and utilities: there is no per-extension theme override, so derive any bespoke colour locally with color-mix over a public token. verb=catalog dumps the customization surface (readable tokens, the six slots, client/server surfaces); verb=scaffold returns a typed extension skeleton for a kind (composer-action|tool|tool-renderer|component|full) + name; verb=validate lints draft source against the catalog. Write the returned code to conciv/extensions/<name>.tsx for kinds that render JSX (composer-action, tool-renderer, component, full) and conciv/extensions/<name>.ts otherwise (tool), since JSX in a .ts file fails to parse. Client (.client) changes hot-reload into the live widget; new or changed server (.server) tools and prompt text need a dev-server restart. The composer-action and full scaffolds import ComposerActions from @conciv/ui-kit-chat: before running the project, add @conciv/ui-kit-chat to package.json dependencies (matching the version range already pinned for @conciv/extension, since @conciv/* releases in lockstep) if it is not listed yet.',
  inputSchema: ExtensionsInput,
})
