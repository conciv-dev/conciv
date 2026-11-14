---
'@conciv/ui-kit-system': patch
'@conciv/app': patch
'@conciv/extension-recorder': patch
'@conciv/extension-terminal': patch
'@conciv/extension-whiteboard': patch
---

Buttons and text fields follow one size scale, the same height in every browser. `Button` sizes: `xs` 24px with 11px text, `sm` 28px with 12px text, `md` (the default) 32px and `lg` 36px with 13px text, so no button's text is larger than the panel's body text. Square icon buttons come in `icon-xs` 24px, `icon-sm` 28px, `icon` 32px and `icon-lg` 36px. `TextField` takes `size` `md` (32px) or `lg` (36px), as tall as a `Button` of the same size, so the two line up in a row. Medium buttons and inputs are 32px tall, they were 38px; small buttons are 28px, they were 22px, and the compact ones (session list retry rows, recorder actions) use `xs`. A plugin's `Ui.Button`, `Ui.IconButton` and `Ui.TextInput` map their small, normal and large sizes onto this scale. The rest of the kit's controls follow it too: `TooltipIconButton` defaults to the 32px `icon` size, the `Select` trigger, `ComboboxSelect`, `NumberInput`, `PasswordInput` (its show and copy buttons now 28px), `TagsInput`, the `ColorPicker` swatch and hex input, and the `Tabs` trigger are 32px, and the widget's settings back button, quick terminal header buttons, empty-state starters, conversation retry button and the whiteboard inbox toggle use the scale's sizes instead of 36 and 38px. The settings Views list's pin buttons are 32px too, they were 30px.
