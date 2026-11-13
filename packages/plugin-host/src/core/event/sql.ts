import type {EventTable} from '@conciv/db'
import type {Event} from '../../schema/event.js'

export {EventSequenceTable, EventTable} from '@conciv/db'

export type EventRow = Omit<typeof EventTable.$inferSelect, 'id'> & {id: Event.Id}
