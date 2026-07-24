---
'@conciv/ui-kit-chat-tools': patch
---

Purpose-built tool cards for the code-mode and discovery surfaces: CodeRunCard (`execute_typescript`), DiscoveredApisCard (`discover_tools`), LoadedToolsCard (`__lazy__tool__discovery__`), and a `conciv_extensions` inline row, so no conciv-owned tool falls through to the generic fallback. `ToolCard` gains an optional `status` override, letting a payload-level failure (`success: false` on a wire-successful call) render the failure state instead of a green dot, and its status dot is now labelled for assistive tech. Code-mode binding names are sanitized to valid JS identifiers, fixing a crash where a single dotted tool name (`canvas.svg`) produced invalid generated source and broke every `execute_typescript` call.
