---
'@conciv/plugin-page': patch
---

`@conciv/plugin-page/client` exports only what the widget calls: `installReactBridge`, `grabApi`, `fitImagePreview`, `showToast`, `pageAttachmentCards`, `pageSessionEntry`, `PAGE_ACT_TOOL_NAMES`, `PAGE_TOOL_PREFIX` and `pageToolMeta`. The DOM helpers it also re-exported (snapshot, capture, dehydrate, React tracking and the picker internals) stay inside the plugin.
