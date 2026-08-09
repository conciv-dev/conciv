import {defineExtension} from '@conciv/extension'
import {PAGE_EXTENSION_NAME} from './shared/defs.js'
import {PAGE_CLIENT_TOOLS} from './client/bodies.js'

export const page = defineExtension({name: PAGE_EXTENSION_NAME, tools: PAGE_CLIENT_TOOLS}).client(() => ({value: {}}))

export default page
