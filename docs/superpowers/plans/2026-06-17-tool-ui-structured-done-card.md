# Tool UI — Plan D: structured done card

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agent-authored "done" summary card, on by default for capable harnesses (claude + codex), driven by `--json-schema`/`--output-schema`, surfaced via @tanstack/ai's `structured-output` message part, and disabled by a single `doneCard` config flag.

**Architecture:** A `structuredOutput` capability gates the feature per harness. When the `doneCard` flag is on and the harness is capable, the args builder passes the schema to the CLI. The decode (bespoke per harness — claude returns `result.structured_output` + a synthetic tool to suppress; codex returns the whole final message as JSON) emits the CUSTOM chunks the `StreamProcessor` consumes (`structured-output.start` → `TEXT_MESSAGE_CONTENT` → `structured-output.complete`). The widget renders the resulting part's prose `message` as text and the rest in `DoneCard`.

**Tech Stack:** `@opendui/aidx-protocol` (capability + config + schema), `@opendui/aidx-harness` (args + decode), `@opendui/aidx-core` (config resolution), `@opendui/aidx-tool-ui` (`DoneCard` from Plan B), `@opendui/aidx-widget`. Both CLI behaviors were verified live (see the spec); re-verify in the aidx pipeline (Task 6).

**Depends on:** Plans A-C. Riskiest/most invasive plan; fully bypassed when `doneCard` is off. Conventions: functions not classes; no IIFEs; one-line comments; oxfmt; zod validates every boundary.

---

## File structure

- `packages/protocol/src/harness-types.ts` (modify) — `structuredOutput: boolean` capability.
- `packages/protocol/src/config-types.ts` (modify) — `doneCard?: boolean` on `AidxConfig`.
- `packages/protocol/src/tool-types.ts` (modify) — `DoneCardData` + `DoneCardSchema` (zod) + the all-required JSON Schema for the CLIs.
- `packages/core/src/config.ts` (modify) — resolve `doneCard` (default true).
- `packages/harness/src/claude/{args,decode}.ts` (modify) — pass `--json-schema`; read `result.structured_output`; suppress synthetic `StructuredOutput`; emit structured-output chunks.
- `packages/harness/src/codex/{args,decode}.ts` (modify) — write+pass `--output-schema`; route the JSON `agent_message` to structured-output chunks.
- `packages/harness/src/_shared/agui.ts` (modify) — a `structuredOutput(messageId, object, raw)` chunk generator.
- `packages/widget/src/chat-panel.tsx` (modify) — render the `structured-output` part (`message` as text + `DoneCard`).
- Tests: `packages/harness/test/structured-output.test.ts` (create); a core config test.

---

## Task 1: capability + config flag + schema

**Files:** modify `harness-types.ts`, `config-types.ts`, `tool-types.ts`; tests.

- [ ] **Step 1: Add the capability**

In `packages/protocol/src/harness-types.ts`, add to `HarnessCapabilities`:

```ts
// The CLI can return a schema-validated final object (claude --json-schema / codex --output-schema).
structuredOutput: boolean
```

Every adapter literal must now set it. In `packages/harness/src/claude/index.ts` and
`codex/index.ts` set `structuredOutput: true`; in `gemini-cli`, `opencode`, `pi` set
`structuredOutput: false`.

- [ ] **Step 2: Add the config flag**

In `packages/protocol/src/config-types.ts`, add to `AidxConfig`:

```ts
  /** Agent-authored "done" summary card (claude/codex only). On by default; `false` disables it
   * entirely — the harness omits the schema flag, so there is zero overhead. */
  doneCard?: boolean
```

- [ ] **Step 3: Add the schema + data type**

In `packages/protocol/src/tool-types.ts`, append:

```ts
import {z} from 'zod'

// The agent-authored final summary. Every field is required so the schema is OpenAI-strict
// (codex rejects optional fields); "absent" data is an empty string / array, not a missing key.
export const DoneCardSchema = z.object({
  message: z.string(),
  summary: z.string(),
  filesChanged: z.array(z.string()),
  pageActions: z.array(z.string()),
  testsPassed: z.number(),
})
export type DoneCardData = z.infer<typeof DoneCardSchema>

// The JSON Schema handed to the CLIs. additionalProperties:false + every key required (OpenAI strict).
export const DONE_CARD_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'summary', 'filesChanged', 'pageActions', 'testsPassed'],
  properties: {
    message: {type: 'string', description: 'Your normal prose reply to the user (markdown allowed).'},
    summary: {type: 'string', description: 'One-line summary of what you did this turn.'},
    filesChanged: {type: 'array', items: {type: 'string'}, description: 'Paths changed; [] if none.'},
    pageActions: {type: 'array', items: {type: 'string'}, description: 'Page actions taken; [] if none.'},
    testsPassed: {type: 'number', description: 'Tests passing after this turn; 0 if none run.'},
  },
} as const
```

- [ ] **Step 4: Test the schema is OpenAI-strict + parses**

```ts
// packages/protocol/test/done-card.test.ts
import {describe, it, expect} from 'vitest'
import {DoneCardSchema, DONE_CARD_JSON_SCHEMA} from '../src/tool-types.js'

describe('done card schema', () => {
  it('requires every property (OpenAI strict)', () => {
    expect(DONE_CARD_JSON_SCHEMA.required).toEqual(Object.keys(DONE_CARD_JSON_SCHEMA.properties))
    expect(DONE_CARD_JSON_SCHEMA.additionalProperties).toBe(false)
  })
  it('parses a full object and rejects a partial one', () => {
    expect(
      DoneCardSchema.safeParse({message: 'hi', summary: 's', filesChanged: [], pageActions: [], testsPassed: 0})
        .success,
    ).toBe(true)
    expect(DoneCardSchema.safeParse({message: 'hi'}).success).toBe(false)
  })
})
```

- [ ] **Step 5: Run + typecheck**

Run: `pnpm --filter @opendui/aidx-protocol exec vitest run test/done-card.test.ts && pnpm --filter @opendui/aidx-harness typecheck`
Expected: test PASS; harness typecheck fails only if an adapter is missing `structuredOutput` — add it.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src packages/protocol/test/done-card.test.ts packages/harness/src/*/index.ts
git commit -m "feat(protocol): structuredOutput capability, doneCard flag, done-card schema"
```

---

## Task 2: resolve the doneCard config (default true)

**Files:** modify `packages/core/src/config.ts`.

- [ ] **Step 1: Find the config resolver**

Run: `grep -n "systemPrompt\|enabled\|resolveConfig\|AidxConfig" packages/core/src/config.ts | head`
Locate where defaults are applied.

- [ ] **Step 2: Default doneCard to true**

Where the resolved config is built, add `doneCard: config.doneCard ?? true`. Expose it on whatever
shape the chat route reads (so Task 3/4 can branch on it). If core has a config test, add a case:
`doneCard` defaults to `true`, and `false` is preserved.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @opendui/aidx-core typecheck`

```bash
git add packages/core/src/config.ts
git commit -m "feat(core): resolve doneCard config (default true)"
```

---

## Task 3: the structured-output chunk generator

**Files:** modify `packages/harness/src/_shared/agui.ts`.

- [ ] **Step 1: Add the generator**

Mirror the existing `textMessage`/`toolCall` generators. The CUSTOM names + `TEXT_MESSAGE_CONTENT`
sandwich are what `StreamProcessor` consumes to build a `structured-output` part (verified against
`@tanstack/ai` processor):

```ts
// Emit a schema-validated final object as a tanstack structured-output part. messageId is fresh.
export function* structuredOutput(messageId: string, object: unknown, raw: string): Generator<StreamChunk> {
  yield {type: EventType.CUSTOM, name: 'structured-output.start', value: {messageId}}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: raw}
  yield {type: EventType.CUSTOM, name: 'structured-output.complete', value: {messageId, object, raw}}
}
```

Confirm `EventType.CUSTOM` and `EventType.TEXT_MESSAGE_CONTENT` are the imported names already used
in this file. Commit with Task 4 (no behavior yet).

---

## Task 4: claude — pass schema, read result, suppress synthetic tool

**Files:** modify `packages/harness/src/claude/args.ts`, `packages/harness/src/claude/decode.ts`.

- [ ] **Step 1: Pass `--json-schema` when enabled + capable**

In `claude/args.ts`, the args builder receives the turn. Thread the resolved `doneCard` flag to it
(via the turn or a builder param — check how `buildClaudeArgs(turn)` is called from the chat route).
When on, append:

```ts
import {DONE_CARD_JSON_SCHEMA} from '@opendui/aidx-protocol/tool-types'
// ...inside the argv builder, chat turns only (not compact):
if (doneCardEnabled) argv.push('--json-schema', JSON.stringify(DONE_CARD_JSON_SCHEMA))
```

- [ ] **Step 2: Suppress the synthetic StructuredOutput tool block**

In `claude/decode.ts` `openBlock`, claude emits a `tool_use` named `StructuredOutput` to satisfy the
schema. Skip opening a tool block for it so it never renders as a tool card:

```ts
} else if (cb.type === 'tool_use' && cb.id) {
  if (cb.name === 'StructuredOutput') return // schema plumbing, not a real tool call
  open.set(i, {kind: 'tool', mid: cb.id})
  yield {type: EventType.TOOL_CALL_START, toolCallId: cb.id, toolCallName: cb.name ?? '', toolName: cb.name ?? ''}
}
```

(Its args deltas / close are no-ops because the block was never opened — verify `deltaBlock`/
`closeBlock` already early-return on an unknown index, which they do via `open.get(i)` being
undefined.)

- [ ] **Step 3: Emit the structured-output part from `result.structured_output`**

claude returns the object on the terminal `result` event. Extend `ClaudeEventSchema` to read it and,
when present, emit the structured-output chunks. Find the result handling (around the
`ClaudeEventSchema`/`result` branch in `decode.ts`):

```ts
// add to the result schema
structured_output: z.unknown().optional(),
// when handling the result event, before/with RUN_FINISHED:
if (ev.structured_output !== undefined) {
  yield* structuredOutput(mint('s'), ev.structured_output, JSON.stringify(ev.structured_output))
}
```

Import `structuredOutput` from `../_shared/agui.js`. The `message` field still also streamed as the
normal assistant text, so the prose is unaffected.

- [ ] **Step 4: Test the claude decode path**

```ts
// packages/harness/test/structured-output.test.ts (claude portion)
import {describe, it, expect} from 'vitest'
import {claudeToAguiEvents} from '../src/claude/decode.js'

async function collect(lines: string[]) {
  const out: unknown[] = []
  for await (const c of claudeToAguiEvents(toStream(lines))) out.push(c)
  return out
}
// toStream: wrap the NDJSON lines as the decode input shape used by other claude decode tests
```

Assert: a stream containing a `StructuredOutput` `tool_use` block produces NO `TOOL_CALL_START` for
it, and a `result` event with `structured_output` produces a `structured-output.start` +
`structured-output.complete` CUSTOM pair. Model the input shape on the existing
`packages/harness/test/claude-decode.test.ts`.

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/structured-output.test.ts`

```bash
git add packages/harness/src/_shared/agui.ts packages/harness/src/claude packages/harness/test/structured-output.test.ts
git commit -m "feat(harness): claude --json-schema done card (read result, suppress synthetic tool)"
```

---

## Task 5: codex — pass schema file, route agent_message JSON

**Files:** modify `packages/harness/src/codex/args.ts`, `packages/harness/src/codex/decode.ts`.

- [ ] **Step 1: Write + pass `--output-schema <file>`**

codex takes a FILE path. The args builder writes the schema to a temp file and passes it. Check how
`codex/args.ts` is structured (it returns argv; it may need to become async or accept a
pre-written path from the chat route). Concretely:

```ts
import {DONE_CARD_JSON_SCHEMA} from '@opendui/aidx-protocol/tool-types'
// the chat route writes DONE_CARD_JSON_SCHEMA to `${stateDir}/done-schema.json` once and passes the
// path in the turn; args appends:
if (doneCardEnabled && schemaPath) argv.push('--output-schema', schemaPath)
```

(Decide in execution whether the temp file is written by the route or the args builder; the route is
cleaner since args builders are otherwise pure/sync.)

- [ ] **Step 2: Route the JSON agent_message to structured-output**

In `codex/decode.ts`, the final `item.completed`/`agent_message` `text` is the JSON object when the
schema is active. When `doneCard` is on, parse it and emit the structured-output chunks instead of a
plain text message:

```ts
// when the agent_message item completes and doneCard is active:
const parsed = safeJson(item.text)
if (parsed) yield * structuredOutput(mint('s'), parsed, item.text)
else yield * textMessage(mint('m'), item.text) // fallback: not JSON, render as prose
```

Add a `safeJson` helper. Import `structuredOutput`, `textMessage` from `../_shared/agui.js`.

- [ ] **Step 3: Test the codex decode path**

Add a codex portion to `structured-output.test.ts`: feed a codex `item.completed` `agent_message`
whose `text` is `'{"message":"hi","summary":"s","filesChanged":[],"pageActions":[],"testsPassed":0}'`
and assert it yields `structured-output.start`/`.complete` (not a plain text message). Model the
input on `packages/harness/test/` codex decode tests if present.

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/structured-output.test.ts`

```bash
git add packages/harness/src/codex packages/harness/test/structured-output.test.ts
git commit -m "feat(harness): codex --output-schema done card (route agent_message JSON)"
```

---

## Task 6: widget renders the done card

**Files:** modify `packages/widget/src/chat-panel.tsx`.

- [ ] **Step 1: Render the structured-output part**

Add a `<Match>` in `PartView` for the structured-output part (it arrives in the message `parts`).
Validate with `DoneCardSchema`; render the prose `message` via the existing text view and the rest
via `DoneCard`:

```tsx
<Match
  when={
    props.part.type === 'structured-output' ? (props.part as Extract<MessagePart, {type: 'structured-output'}>) : null
  }
>
  {(p) => {
    const data = () => DoneCardSchema.safeParse(p().data)
    return (
      <Show when={data().success && data().data} fallback={<TextPartView content={rawText(p())} streaming={false} />}>
        {(d) => (
          <>
            <TextPartView content={d().message} streaming={false} />
            <DoneCard data={d()} />
          </>
        )}
      </Show>
    )
  }}
</Match>
```

Import `DoneCard` from `@opendui/aidx-tool-ui` and `DoneCardSchema` from
`@opendui/aidx-protocol/tool-types`. Add a `rawText(part)` helper returning `part.raw ?? ''`.

- [ ] **Step 2: Rebuild + IT**

Run: `pnpm turbo run build --filter=@opendui/aidx-widget`
Add to `tool-ui.it.test.ts`: a stream emitting `structured-output.start`/content/`.complete` renders
the prose + a `.pw-done` card with the files/tests roll-up. Run
`pnpm --filter @opendui/aidx-widget test`.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/chat-panel.tsx packages/widget/test/tool-ui.it.test.ts
git commit -m "feat(widget): render structured done card"
```

---

## Task 7: end-to-end pipeline real-run (the residual risk)

**Files:** none (verification); fix-ups as needed.

- [ ] **Step 1: Run a real claude turn with the flag on**

Start the dev server/example app (see `packages/widget/test` or the examples). With `doneCard` on
(default), send a message that edits a file and runs a test. Confirm in the thread:

- a done card appears with the structured roll-up,
- the prose `message` reads normally,
- NO junk `StructuredOutput` tool card,
- the permission gate, usage tracker, and compaction still behave (do a `/compact` after).

- [ ] **Step 2: Run a real codex turn**

Switch the harness to codex; repeat. Confirm the final answer renders as prose + done card (not raw
JSON), and a loose/optional-field schema is not used (we ship the strict schema).

- [ ] **Step 3: Flip the flag off and confirm zero overhead**

Set `doneCard: false` in the aidx config; confirm the CLI args no longer include
`--json-schema`/`--output-schema` (log the argv), no done card renders, and turns behave exactly as
before. This is the bounded-risk guarantee.

- [ ] **Step 4: Record findings**

If the pipeline run surfaces interactions (extra-turn latency, usage double-count, compaction
interplay), note them at the top of this plan and fix before merge. Commit any fixes.

---

## Task 8: full verification

- [ ] **Step 1: Typecheck + build + test the chain**

Run: `pnpm turbo run typecheck build test --filter=@opendui/aidx-protocol --filter=@opendui/aidx-harness --filter=@opendui/aidx-core --filter=@opendui/aidx-widget --filter=@opendui/aidx-tool-ui`
Expected: green.

- [ ] **Step 2: Lint + format + commit**

Run: `pnpm lint && pnpm format:check`

```bash
git add -A && git commit -m "chore: lint/format after structured done card" || echo "nothing to commit"
```

---

## Self-review notes (author)

- Spec coverage: implements the structured done card on-by-default for claude+codex with the single
  `doneCard` off-switch that bypasses the whole path; bespoke per-harness decode matching the
  live-verified behavior (claude `result.structured_output` + synthetic-tool suppression; codex JSON
  `agent_message` routing); emission via the real CUSTOM `structured-output.start/.complete` chunks
  (not the unexported helpers); widget renders prose `message` + `DoneCard`. Resolves the residual
  open item (#4) via the Task 7 real-run.
- The strict all-required schema is shared from protocol so claude (lenient) and codex (strict) use
  the same shape.
- Verify during execution: how `buildClaudeArgs`/`codex` args receive the `doneCard` flag + schema
  path (route vs builder), the exact `result` event field plumbing in `claude/decode.ts`, and the
  codex `item.completed` shape in `codex/decode.ts` (model tests on the existing decode tests).
