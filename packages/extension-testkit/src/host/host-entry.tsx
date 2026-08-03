import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import '@conciv/ui-kit-chat/theme/conciv.css'
import 'virtual:uno.css'
import extension from 'virtual:conciv-extension-under-test'
import {startHost} from './host-runtime.js'

startHost(extension)
