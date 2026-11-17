import {defineExtension} from '@conciv/extension'
import {PAGE_EXTENSION_NAME} from './shared/defs.js'
import {grabAttachment} from './server/grab-attachment.js'

export const page = defineExtension({
  name: PAGE_EXTENSION_NAME,
  attachments: [grabAttachment],
})

export default page
