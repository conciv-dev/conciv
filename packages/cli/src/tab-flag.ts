import {description, name, option, schema} from '@bomb.sh/router'
import {SessionId} from '@conciv/protocol/chat-types'

export const tabFlag = option(
  name('tab'),
  description('act on this open tab (an id from conciv tools tabs), on whichever dev server holds it'),
  schema(SessionId.optional()),
)
