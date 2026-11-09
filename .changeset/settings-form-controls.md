---
'@conciv/ui-kit-system': patch
---

New generic form controls on Ark UI: a field wrapper (`FieldShell`, on Ark Field and Fieldset, with label, description, error, row or stack layout, disabled, read-only and required), `NumberInput`, `TagsInput`, `ColorPicker`, `PasswordInput`, `Checkbox` and `CheckboxGroup`, `RadioCards`, `ComboboxSelect`, `HotkeyRecorder` and `ConfirmDialog`. `TextField` gains invalid styling, start and end addons and an end action slot; `Select` gains invalid and read-only styling. Every control takes plain props and reads disabled, read-only and invalid from an enclosing Ark field.
