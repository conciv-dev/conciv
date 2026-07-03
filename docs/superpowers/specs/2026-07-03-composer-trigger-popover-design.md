# Composer Trigger Popover (inline `/` and `@` menu)

Port assistant-ui's `Unstable_TriggerPopover` architecture to `@conciv/ui-kit-chat` (Solid), headless by default, and wire it end to end: a `/` slash-command menu fed by the harness's real command list and an `@` mention menu fed by the registered tool list.

Reference implementation: `/Users/omrikatz/Public/web/assistant-ui` — `packages/react/src/primitives/composer/trigger/*`, `packages/react/src/unstable/useSlashCommandAdapter.ts`, `useMentionAdapter.ts`, `packages/core/src/types/trigger.ts`, `directive.ts`, `adapters/directive-formatter.ts`.

## Goals

- Same compound-component API, same props, same keyboard contract as assistant-ui, minus the `Unstable_` prefixes (v0, break freely).
- Headless primitives only; the styled wrapper comes in a later design pass.
- `/` menu lists every command the harness reports: Claude built-ins, skills, plugin skills, MCP prompts. Discovered, never defined by hand.
- `@` menu lists registered tools (conciv + extension tools). Auto-discovered from existing registrations.
- Backend contract shaped for every harness, implemented for Claude in v1.
- A reserved, typed seam for extensions to register commands later.

## Non-goals (v1)

- Styled wrapper with our design (follow-up pass, positioning decision included: plain CSS anchor vs Ark positioning hooks — primitive stays positioning-agnostic either way).
- Widget-local commands in the `/` menu (new session, compact stay as composer buttons).
- Client-side extension commands (`run` variant) — seam documented below.
- Mention chip rendering inside sent messages (`DirectiveText` equivalent).
- `files`-mode command discovery for codex / gemini-cli / opencode — contract ready, each flips in its own follow-up after verifying that CLI expands `/name` in non-interactive prompt text.

## Package: `@conciv/ui-kit-chat`

### Types (`src/primitives/composer/trigger/types.ts`)

```ts
export type TriggerItem = {
  id: string
  type: string
  label: string
  description?: string
  metadata?: Record<string, unknown>
}

export type TriggerCategory = {id: string; label: string}

export type TriggerAdapter = {
  categories(): readonly TriggerCategory[]
  categoryItems(categoryId: string): readonly TriggerItem[]
  search?(query: string): readonly TriggerItem[]
}

export type DirectiveSegment = {kind: 'text'; text: string} | {kind: 'mention'; type: string; label: string; id: string}

export type DirectiveFormatter = {
  serialize(item: TriggerItem): string
  parse(text: string): readonly DirectiveSegment[]
}

export type TriggerBehavior =
  | {kind: 'directive'; formatter: () => DirectiveFormatter; onInserted?: (item: TriggerItem) => void}
  | {
      kind: 'action'
      formatter: () => DirectiveFormatter
      onExecute: (item: TriggerItem) => void
      removeOnExecute?: () => boolean
    }
```

`defaultDirectiveFormatter` ported verbatim: `:type[label]{name=id}` syntax, `{name=…}` omitted when `id === label`, bounded regex parse into segments.

The existing stub `Composer.TriggerPopover`, `TriggerItem {id, label, insert}` in `composer-handlers.tsx`, `handlers.triggerItems`, and `trigger-popover.stories.tsx` are deleted and replaced.

### Component API

```tsx
<Composer.TriggerPopoverRoot>
  <Composer.Root>
    <Composer.Input />
    <Composer.TriggerPopover char="/" adapter={adapter} isLoading={loading()}>
      <Composer.TriggerPopover.Action formatter={fmt} onExecute={run} removeOnExecute />
      <Composer.TriggerPopoverCategories>
        {(categories) => (
          <For each={categories()}>
            {(cat) => (
              <Composer.TriggerPopoverCategoryItem categoryId={cat.id}>{cat.label}</Composer.TriggerPopoverCategoryItem>
            )}
          </For>
        )}
      </Composer.TriggerPopoverCategories>
      <Composer.TriggerPopoverItems>
        {(items) => (
          <For each={items()}>
            {(item, index) => (
              <Composer.TriggerPopoverItem item={item} index={index()}>
                {item.label}
              </Composer.TriggerPopoverItem>
            )}
          </For>
        )}
      </Composer.TriggerPopoverItems>
      <Composer.TriggerPopoverBack>Back</Composer.TriggerPopoverBack>
    </Composer.TriggerPopover>
  </Composer.Root>
</Composer.TriggerPopoverRoot>
```

| Component                    | Props                                         | Notes                                                                                                                                                               |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TriggerPopoverRoot`         | `children`                                    | Trigger registry + active-ARIA context. Dev warnings on duplicate char and prefix collision.                                                                        |
| `TriggerPopover`             | `char`, `adapter?`, `isLoading?` + div props  | Renders `role="listbox"` container with `id`, `aria-activedescendant`, `data-state="open"` when open; children pass through when closed.                            |
| `TriggerPopover.Directive`   | `formatter?`, `onInserted?`                   | Registers directive behavior; renders nothing. Defaults to `defaultDirectiveFormatter`.                                                                             |
| `TriggerPopover.Action`      | `formatter?`, `onExecute`, `removeOnExecute?` | Registers action behavior; `removeOnExecute` default `false` (audit chip stays). Exactly one behavior child per popover; last registration wins with a dev warning. |
| `TriggerPopoverCategories`   | `children(categories)` + div props            | Render function; renders only when open at top level in category mode. `role="group"`.                                                                              |
| `TriggerPopoverCategoryItem` | `categoryId` + button props                   | Drills into category. `data-highlighted` when keyboard-highlighted.                                                                                                 |
| `TriggerPopoverItems`        | `children(items)` + div props                 | Renders only when a category is active or in search mode. `role="group"`.                                                                                           |
| `TriggerPopoverItem`         | `item`, `index?` + button props               | `role="option"`, `id={popoverId}-option-{item.id}`, `aria-selected`, `data-highlighted`, mousemove → highlight, click → select.                                     |
| `TriggerPopoverBack`         | button props                                  | Renders only when drilled into a category and not in search mode. Click → back to categories.                                                                       |

Scope context (their `useTriggerPopoverScopeContext`) is exported as `useTriggerPopoverScope()` for the styled layer: `{open, query, categories, items, activeCategoryId, isSearchMode, isLoading, highlightedIndex, highlightedItemId, popoverId, selectItem, selectCategory, goBack, close, highlightIndex, handleKeyDown, setCursorPosition, registerSelectItemOverride}`.

### Model (`src/primitives/composer/trigger/trigger-popover-model.ts`)

One `createTriggerPopoverModel({char, adapter, behavior, text, setText, popoverId})` context model replaces their four tap-resources; per the views-over-context rule, all logic lives here, components stay thin.

- **Detection**: `cursorPosition` signal; `detectTrigger(text, char, cursor)` pure function ported verbatim (backwards scan from cursor, abort on whitespace, trigger must be at text start or after whitespace) → memo `{offset, query} | null`.
- **Navigation**: `activeCategoryId` signal, memos for `categories`, `categoryItems`, `searchResults` (search mode when a query is typed at top level, or always when the adapter has no categories; fallback search filters all `categoryItems` on id/label/description when the adapter lacks `search`), `navigableList`, `isSearchMode`. Category resets when the popover closes.
- **Keyboard**: `highlightedIndex` signal, reset to 0 when the navigable list, search mode, or active category changes. `handleKeyDown(e): boolean` consumed-flag contract: ArrowDown/Up cycle with wraparound, Enter/Tab select item or drill category (Shift+Enter and Shift+Tab pass through), Escape closes, Backspace with empty query inside a category goes back. `highlightedItemId` for `aria-activedescendant`.
- **Selection**: `selectItem(item)` splices composer text — `before + serialize(item) + space-padded after` for directive (then `onInserted`); action strips the trigger span when `removeOnExecute`, otherwise inserts the chip, then calls `onExecute`. `close()` moves the cursor before the trigger char so detection deactivates. `registerSelectItemOverride(fn)` kept for a future TipTap (`@conciv/ui-kit-tap`) composer, mirroring their Lexical override.
- `open` = trigger detected && adapter present && behavior registered. `popoverId` via `createUniqueId`.

Composer text comes from the existing `useComposer()` (`text()` / `setText`).

### Root context

`TriggerPopoverRoot` holds `char → model` registrations (assistant-ui's separate `ComposerInputPluginContext` is folded in) and exposes `activeAria(): {popoverId, highlightedItemId} | null` for the input.

### `Composer.Input` integration (additive; no-ops outside a root)

- `onKeyDown`: the open trigger's `handleKeyDown` runs first; when consumed, submit/Escape-cancel handling is skipped.
- Cursor tracking: `onInput`, `onKeyUp`, `onClick`, `onSelect` push `selectionStart` into every registered trigger's `setCursorPosition`.
- ARIA (WAI-ARIA editable combobox): `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls={popoverId}`, `aria-activedescendant={highlightedItemId}` while a popover is open; attributes absent when closed.

### Adapter factories (`src/behaviors/`)

```ts
type SlashCommandDef = {id: string; label?: string; description?: string; icon?: string; execute(): void}
createSlashCommandAdapter(options: {commands: Accessor<readonly SlashCommandDef[]>; removeOnExecute?: boolean})
  → {adapter: TriggerAdapter; action: {onExecute; removeOnExecute?}}

type MentionOptions = {items?: Accessor<readonly TriggerItem[]>; categories?: Accessor<...>; formatter?: DirectiveFormatter; onInserted?: (item: TriggerItem) => void}
createMentionAdapter(options: MentionOptions)
  → {adapter: TriggerAdapter; directive: {formatter; onInserted?}}
```

Same semantics as their hooks: `execute` stays in the factory closure, items remain serializable. Solid accessors instead of React re-render capture.

## Protocol (`@conciv/protocol/chat-types`)

```ts
export type ChatCommand = {
  name: string
  description: string
  argumentHint?: string
  source: 'harness' | 'mcp' | 'plugin'
}
export type ChatTool = {name: string; description: string; extension?: string}
```

`source` is derived server-side from the command name shape (`mcp__server__prompt` → `mcp`, `plugin:command` → `plugin`, rest → `harness`). Built-ins and skills are not reliably distinguishable from the SDK payload, so they share the `harness` source.

## Harness contract (`@conciv/protocol/harness-types`)

New capability entry, same style as `mcp` / `compaction`:

```ts
slashCommands: 'live' | 'files' | 'none'
```

New adapter member, enforced by the same discriminated-union pattern as `compaction`/`history` (`'live' | 'files'` requires `commands`, `'none'` forbids it):

```ts
export type HarnessCommand = {name: string; description?: string; argumentHint?: string}
commands?(ctx: {cwd: string; sessionId?: string; mcpUrl?: string}): Promise<HarnessCommand[]>
```

`mcpUrl` mirrors `HarnessTurn.mcpUrl` (`${origin}/api/mcp` when `capabilities.mcp === 'http'`) so a cold-cache probe session sees the same MCP prompt commands a real turn would.

| Harness                | Mode                       | v1                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude (SDK)           | `live`                     | Implemented. Warm session → `query.supportedCommands()`. No warm session → spawn a short-lived init query, read the list, evict; cache per cwd. `decode.ts` handles the `system/commands_changed` push by replacing the cwd cache (SDK guidance: replace, never refetch — `supportedCommands()` is captured at initialize). |
| claude (CLI args mode) | `none`                     | Stream-json mode has no control channel.                                                                                                                                                                                                                                                                                    |
| codex                  | `none` → `files` follow-up | `~/.codex/prompts/*.md` + project prompts, after verifying `codex exec` expands `/name`.                                                                                                                                                                                                                                    |
| gemini-cli             | `none` → `files` follow-up | `.gemini/commands/**/*.toml`, same verification.                                                                                                                                                                                                                                                                            |
| opencode               | `none` → `files` follow-up | `.opencode/command/*.md`, same verification.                                                                                                                                                                                                                                                                                |
| pi                     | `none`                     | —                                                                                                                                                                                                                                                                                                                           |

`files` scanners will share a `_shared/command-files.ts` helper (directory list + per-format name/description extraction); each adapter declares its locations. Flipping a harness touches only its adapter.

## Core routes + api-client

- `GET /api/chat/commands?sessionId=…` → `{commands: ChatCommand[]}`. Resolves the active harness adapter; `slashCommands: 'none'` → empty list. Mirrors `/api/chat/models`.
- `GET /api/chat/tools` → `{tools: ChatTool[]}` from the already-collected `concivTools` + extension tools.
- Both added to `api-client` with schemas.

## Extension commands — reserved seam (not implemented in v1)

`ExtensionMeta` reserves a typed `commands` leaf, parallel to `tools`, self-describing (no central catalog):

```ts
commands?: readonly ExtensionCommand[]
// ExtensionCommand = {name: string; description: string; argumentHint?: string; prompt(args: string): string}
```

When implemented: the engine collects `extension.commands` exactly like `extension.tools`, and `core/api/mcp/mcp.ts` registers each as an MCP prompt (`server.registerPrompt`) next to the existing `registerTool` loop. Claude surfaces MCP prompts as `/mcp__conciv__<name>` slash commands automatically, so they arrive through the same `supportedCommands()` list with zero widget or harness changes. A client-side `run` variant (browser-executed commands against the extension host context) is a separate future addition riding the `.Action` behavior.

Nothing that exists today is defined twice: harness commands are discovered, tools are already registered once and surface via `@`.

## Widget wiring

**`/` commands**: `createResource` on the commands route (fetched on panel open and thread switch; refetched when a turn completes so `commands_changed` updates land). Items: `id: name`, `label: /name`, `description`, `metadata: {source, argumentHint}`. Directive behavior with a slash formatter — `serialize` → `/name ` plain text (no `:type[…]` syntax; the command must reach the CLI as real prompt text), `parse` → single text segment. Flat list, group headers by `source` (adapter `search` returns matches grouped in source order; headers rendered by the widget from item metadata). Picking inserts; the user appends arguments and submits; the SDK expands slash commands from prompt text natively. The `/` trigger is registered only when the command list is non-empty, so harnesses with `slashCommands: 'none'` never show a dead menu.

**`@` mentions**: tools route → `TriggerItem`s (`type: 'tool'`), directive behavior, formatter `serialize` → `@name ` plain text. Groups: Tools / per-extension.

## Testing

- `detectTrigger`, `defaultDirectiveFormatter` round-trip, slash/mention formatters: vitest unit tests (pure functions).
- Primitives: Storybook play stories in ui-kit-chat — full keyboard contract (arrow cycling with wraparound, Enter/Tab select + drill, Shift+Enter newline passthrough, Escape close, Backspace-to-categories), click select, hover highlight, search filtering, category drill + back, empty and loading states, input ARIA (`aria-expanded`, `aria-activedescendant`) — native assertions (roles/text), no test ids.
- Widget e2e (`packages/widget/test`, existing IT pattern: real widget bundle, real `http.createServer` API, Playwright `browser.newPage()`, native locators):
  - Serve `/api/chat/commands` and `/api/chat/tools` with real payloads; type `/` in the composer → grouped options visible; ArrowDown + Enter → draft contains `/compact `; append args + submit → the outgoing chat POST body starts with the command text (asserted server-side, app state not DOM value).
  - `@` flow: type `@` → tool options; select → draft contains `@page.read `.
  - Escape closes; empty commands payload → typing `/` opens nothing.
- Routes: core package IT covering `slashCommands: 'live'` and `'none'` adapter branches.
- Claude `supportedCommands` + `commands_changed` cwd cache: harness IT against the real SDK session where the suite already spawns one.

## Follow-ups (explicitly out of v1)

1. Styled wrapper (`src/styled/`) with our design + positioning decision (CSS anchor vs Ark positioning hooks).
2. `files` command discovery per non-Claude harness, each after verifying its CLI's `/name` prompt expansion.
3. Extension `commands` leaf implementation (MCP prompt registration) + client-side `run` commands.
4. Widget-local commands (new session, compact) in the `/` menu via `.Action` routing.
5. Mention chips in sent messages (`DirectiveText` equivalent) and TipTap composer integration via `registerSelectItemOverride`.
