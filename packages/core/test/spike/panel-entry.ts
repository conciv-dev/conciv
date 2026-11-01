import {connectPanelChannel} from 'devframe/in-page-channel'
import {connectRemoteDevframe} from '@devframes/hub/client'

Object.assign(window, {connectPanelChannel, connectRemoteDevframe})
