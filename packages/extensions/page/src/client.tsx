import {defineExtension} from '@conciv/extension'
import {PAGE_EXTENSION_NAME} from './shared/defs.js'
import {GrabCard} from './client/cards/grab-card.js'
import {grabAttachment} from './shared/grab-attachment.js'

grabAttachment.card(GrabCard)

export const page = defineExtension({
  name: PAGE_EXTENSION_NAME,
  attachments: [grabAttachment],
}).client(() => ({value: {}}))

export default page

export {endRun, endTask, mountSimulator} from './client/simulator.js'
