import {defineExtension} from '@conciv/extension'

export default defineExtension({
  name: 'host-api-fixture',
  tables: [{name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`}],
})
