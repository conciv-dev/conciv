export const SETTINGS_APPEARANCE_PATH = '/panel/settings/appearance'

export type SettingsSectionId = 'appearance' | 'composer' | 'connection'

export type SettingsSection = {
  id: SettingsSectionId
  label: string
  path?: typeof SETTINGS_APPEARANCE_PATH
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {id: 'appearance', label: 'Appearance', path: SETTINGS_APPEARANCE_PATH},
  {id: 'composer', label: 'Composer'},
  {id: 'connection', label: 'Connection'},
]

export const SETTINGS_NAV_LABEL = 'SETTINGS'
