import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import type {OpenInEditor} from '../../editor/open.js'

export function registerEditorRoutes(app: H3, openInEditor: OpenInEditor): void {
  app.post('/api/editor/open', async (event) => {
    const {file, line} = await readValidatedBody(event, OpenBodySchema)
    openInEditor(file, line)
    return {ok: true}
  })
}

// A blank file is a 400, surfaced by validation rather than a hand-rolled guard in the handler.
const OpenBodySchema = z.object({file: z.string().min(1), line: z.number().optional()})
