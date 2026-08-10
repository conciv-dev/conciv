import {defineExtension} from '@conciv/extension'
import {PAGE_EXTENSION_NAME} from './shared/defs.js'
import {PAGE_CLIENT_TOOLS} from './client/bodies.js'

export const page = defineExtension({name: PAGE_EXTENSION_NAME, tools: PAGE_CLIENT_TOOLS}).client(() => ({value: {}}))

export default page

export {A11yNodeList, PageHtmlBlock, PageValueChip, type A11yNode} from './client/page-result-views.js'
export {formatHtml} from './client/page-format.js'
