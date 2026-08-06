import {defineExtension} from '@conciv/extension'
import {PAGE_EXTENSION_NAME} from './shared/protocol.js'

export const page = defineExtension({name: PAGE_EXTENSION_NAME}).client(() => ({value: {}}))

export default page
