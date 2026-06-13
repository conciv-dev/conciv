import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import type {OpenInEditor} from '../../editor/open.js'

const OpenBodySchema = z.object({file: z.string(), line: z.number().optional()})

export function registerEditorRoutes(app: H3, openInEditor: OpenInEditor): void {
  app.post('/api/editor/open', async (event) => {
    const {file, line} = await readValidatedBody(event, OpenBodySchema)
    if (!file) {
      event.res.status = 400
      return {error: 'file required'}
    }
    openInEditor(file, line)
    return {opened: file}
  })
}
