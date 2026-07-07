import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {EditorOpenSchema} from '@conciv/protocol/editor-types'
import type {Ok} from '@conciv/protocol/chat-types'
import type {OpenInEditor} from '../../editor/open.js'

export type EditorVars = {editor: {open: OpenInEditor}}

const app = new Hono<{Variables: EditorVars}>().post('/open', zValidator('json', EditorOpenSchema), (c) => {
  const {file, line} = c.req.valid('json')
  c.var.editor.open(file, line)
  const payload: Ok = {ok: true}
  return c.json(payload)
})

export default app
