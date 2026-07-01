import {definePermissions} from 'jazz-tools'
import {app} from './schema.js'

const scopedTables = ['canvasElements', 'canvasPending', 'comments', 'pins', 'cursors', 'reads'] as const

export default definePermissions(app, (ctx) => {
  scopedTables.forEach((name) => {
    const table = ctx.policy[name]
    table.allowRead.always()
    table.allowInsert.always()
    table.allowUpdate.always()
    table.allowDelete.always()
  })
})
