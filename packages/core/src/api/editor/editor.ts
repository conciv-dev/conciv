import {type H3, readValidatedBody} from 'h3'
import {EditorOpenSchema} from '@opendui/aidx-protocol/test-types'
import type {OpenInEditor} from '../../editor/open.js'

export function registerEditorRoutes(app: H3, openInEditor: OpenInEditor): void {
  // A blank file is a 400, surfaced by the shared schema's validation, not a hand-rolled guard.
  app.post('/api/editor/open', async (event) => {
    const {file, line} = await readValidatedBody(event, EditorOpenSchema)
    openInEditor(file, line)
    return {ok: true}
  })
}
