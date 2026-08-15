import {defineAttachment} from '@conciv/extension'
import {GRAB_MIME} from '@conciv/grab/grab-attachment'
import type {PageServerContext} from '../server.js'

export const grabAttachment = defineAttachment<PageServerContext>({mime: GRAB_MIME})
