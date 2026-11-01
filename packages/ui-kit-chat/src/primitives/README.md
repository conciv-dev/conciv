# primitives

## Overview

Headless, unstyled compound components modeled on the assistant-ui API. Each folder holds one compound and its context; all read chat state from `store/chat-context.tsx`.

## Subdirectories & Boundaries

- action-bar: [action-bar](./action-bar/README.md) - Headless per-message action bar (copy, reload, edit, export, speak, feedback) and the context providers it reads.
- action-bar-more: [action-bar-more](./action-bar-more/README.md) - Headless overflow menu for the action bar, built on `Menu` from `@conciv/ui-kit-system`.
- activity: [activity](./activity/README.md) - Headless `Activity` root that derives turns, tool results by call id, live state and the active tool call from chat messages, for activity timelines.
- assistant-modal: [assistant-modal](./assistant-modal/README.md) - Headless popover-based assistant modal built on `Popover` from `@conciv/ui-kit-system`, with an option to open when a run starts.
- attachment: [attachment](./attachment/README.md) - Attachment model, adapters (image, text, composed) and the headless `Attachment` parts used by composer and message attachment lists.
- branch-picker: [branch-picker](./branch-picker/README.md) - Headless branch picker for navigating message branches.
- composer: [composer](./composer/README.md) - Headless `Composer` compound: input, send/cancel, attachments with adapters, quote, dictation, queue, plus draft persistence and a width-fitted actions toolbar.
- error: [error](./error/README.md) - Headless `Error` compound that renders only while the chat context holds an error.
- message: [message](./message/README.md) - Headless `Message` compound: root, parts rendering (flat or grouped), attachments, conditional rendering and error, with message and part contexts.
- message-part: [message-part](./message-part/README.md) - Hooks and parts for reading the current message part by type, and the model-only visibility check.
- model-selector: [model-selector](./model-selector/README.md) - Headless model picker with search, grouping and an effort selector per model.
- queue-item: [queue-item](./queue-item/README.md) - Headless parts for a queued user message: its text, a steer action that sends it now, and remove.
- selection-toolbar: [selection-toolbar](./selection-toolbar/README.md) - Headless toolbar that appears for a non-empty text selection and can quote it into the composer.
- suggestion: [suggestion](./suggestion/README.md) - Headless suggestion item: title, description and a trigger that sends the suggestion prompt.
- thread: [thread](./thread/README.md) - Headless `Thread` compound: viewport with virtualized turns, messages, scroll-to-bottom, suggestions and empty state, plus viewport and turn-estimate contexts.
- thread-list: [thread-list](./thread-list/README.md) - Headless session list and list item parts driven by a `ThreadListActions` provider.
- util: [util](./util/README.md) - Shared building blocks for the headless primitives: the polymorphic `Primitive` elements, an action-button factory, a controlled/uncontrolled signal and a settle-fold open state.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
