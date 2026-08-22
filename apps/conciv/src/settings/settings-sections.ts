export type SettingsSectionPath = '/panel/settings/appearance'

export type SettingsSection = {id: 'appearance'; label: string; path: SettingsSectionPath}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {id: 'appearance', label: 'Appearance', path: '/panel/settings/appearance'},
]

export const SETTINGS_GROUP_LABEL = 'SECTIONS'

export const SETTINGS_FIRST_SECTION: SettingsSection = {
  id: 'appearance',
  label: 'Appearance',
  path: '/panel/settings/appearance',
}
