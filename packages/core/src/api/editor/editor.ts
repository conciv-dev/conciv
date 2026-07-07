import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {EditorOpenSchema} from '@conciv/protocol/editor-types'
import type {Ok} from '@conciv/protocol/chat-types'
import type {OpenInEditor} from '../../editor/open.js'

export function makeEditorRoutes(openInEditor: OpenInEditor) {
  return new Hono().post('/open', zValidator('json', EditorOpenSchema), (c) => {
    const {file, line} = c.req.valid('json')
    openInEditor(file, line)
    const payload: Ok = {ok: true}
    return c.json(payload)
  })
}
