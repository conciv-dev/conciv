import {createUi} from '@internal/plugin/ui'
import {ActionRow, Group, SettingsHeader} from '../../settings/settings-ui'
import {useLayers} from '../../app/context'

export const ui = createUi({ActionRow, Group, SettingsHeader, useLayers})
