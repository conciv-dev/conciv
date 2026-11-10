import {createFormHook} from '@tanstack/solid-form'
import {fieldContext, formContext} from './form-context.js'
import {NumberField, SegmentField, SelectField, SkinField, SwitchField, TextField} from './setting-fields.js'

export const {useAppForm} = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {NumberField, SegmentField, SelectField, SkinField, SwitchField, TextField},
  formComponents: {},
})
