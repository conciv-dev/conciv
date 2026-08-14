import {defineExtension} from '@conciv/extension'
import {PAGE_SESSION_GROUP_KEY, type GroupEntry} from '@conciv/ui-kit-chat'
import {PAGE_EXTENSION_NAME} from './shared/defs.js'
import {PAGE_CLIENT_TOOLS} from './client/bodies.js'
import {SessionCard} from './client/cards/session-card.js'

export const page = defineExtension({name: PAGE_EXTENSION_NAME, tools: PAGE_CLIENT_TOOLS}).client(() => ({value: {}}))

export default page

export const pageSessionEntry: GroupEntry = {key: PAGE_SESSION_GROUP_KEY, render: SessionCard}

export {pageSessionSteps, type PageSessionStep} from './client/cards/session-steps.js'
export {A11yNodeList, PageHtmlBlock, PageValueChip, type A11yNode} from './client/page-result-views.js'
export {formatHtml} from './client/page-format.js'
