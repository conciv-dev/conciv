import {z} from 'zod'

export const AnchorResolveInput = z.object({cid: z.string()})

export const anchorResolveDef = {
  name: 'anchor.resolve',
  description: 'Check whether a source-linked comment still points at its element (fresh/moved/drifted).',
  inputSchema: AnchorResolveInput,
  promptSnippet: 'Use anchor.resolve to see if a comment has drifted from the code it was attached to.',
}
