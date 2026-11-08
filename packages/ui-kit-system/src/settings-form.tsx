import {createFormHook} from '@tanstack/solid-form'
import {settingsFieldComponents} from './settings-fields.js'
import {settingsFormContexts} from './settings-form-contexts.js'

export const useSettingsForm = createFormHook({
  fieldContext: settingsFormContexts.fieldContext,
  formContext: settingsFormContexts.formContext,
  fieldComponents: settingsFieldComponents,
  formComponents: {},
}).useAppForm
