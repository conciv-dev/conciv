import {Combobox as Ark} from '@ark-ui/solid/combobox'
import {nativeFocusPart} from './native-focus.js'

export const Combobox = Object.assign({}, Ark, {
  Input: nativeFocusPart(Ark.Input, 'input'),
  Trigger: nativeFocusPart(Ark.Trigger, 'button'),
})
