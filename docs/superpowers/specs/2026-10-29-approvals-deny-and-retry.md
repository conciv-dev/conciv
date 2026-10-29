# Approvals on @tanstack/ai 1.0: the library's deny-and-retry flow

Status: signed off 2026-10-29. Part of the deps-latest lane (plan:
`docs/superpowers/plans/2026-10-29-deps-latest.md`).

## Why

`@tanstack/ai` 1.0 stopped turning the CUSTOM `approval-requested` event into a tool-call part
state (0.51 `processor.ts:2072`; 1.0 `handleCustomEvent` handles only `structured-output.*` and
`ui-resource`). Our permission gate (`packages/core/src/chat/gate.ts`) emits that event and holds
the CLI on an awaited promise, so on 1.0 the ask never renders inline and the run waits until the
120 s timeout.

1.0 has no way to pause a CLI mid-turn: interrupts exist only at `chat()`'s own loop boundaries,
and harness adapters always finish with `stop`. The library's flow for CLI harnesses is
deny-and-retry (`@tanstack/ai-sandbox` `src/approvals.ts:1-17`): on `ask` with no decision the
adapter denies the action this turn and emits `approval-requested`; the client shows the ask;
the next run carries the decision in `TextOptions.approvals`, keyed by a deterministic
`approvalId` (`${provider}:${kind}:${target}`), and the action is allowed. The user chose this
flow ("always library way").

## What the library does not cover in 1.0, and how we fill it

Each gap is filled through a library extension point, never beside one.

| Gap | Fill |
|---|---|
| Nothing on the client handles the adapters' CUSTOM `approval-requested` (ai-client `onCustomEvent` forwards it untouched) | Our `onCustomEvent` handler collects it into the pending-asks list, keyed by `approvalId`. The library event has no `toolCallId`, so asks render in the pending-approvals strip, not in the inline tool card |
| No public client API sends a harness decision back (`resolveInterrupt` works only on `RUN_FINISHED` interrupts; `addToolApprovalResponse` is private) | Decisions go to the server over the existing `chat.permissionDecision` RPC. A core chat middleware injects them into the next run with `onConfig` → `resumeToolState.approvals` (`middleware/types.ts:366-397`, applied at `index.ts:5695`) |
| No persistent grant ("allow for session") | A per-thread grant store: `once` grants are consumed by the next run, `session` grants are re-injected on every run of that thread. Kept in the chat DB so it survives restarts |
| Every adapter throws without a trailing user message, so a bare continuation is impossible | Approving sends a user message through the normal send path ("Approved: <title>"), which starts the retry run. The run resumes the CLI session (`modelOptions.sessionId`, `--resume`) |
| Our read-only command grammar (`classifyCommand`, `escapesReadOnlyIntent`) has no slot | Expressed as the `withSandbox` definition's `SandboxPolicy` (`commands.allow/ask/deny`, `capabilities`, `default`). `askFreeCommandAllows` goes into `commands.allow`. `evaluateCommand` matches the whole line, so chained commands ask more often. Accepted: stricter, never looser |
| Bridged conciv tools with `approval: 'ask'` are never checked by the library (`tool-bridge.ts:172-188` runs `execute` directly) | `gatedTools` keeps wrapping their `execute`, but deny-and-retry instead of blocking: with no grant, it emits the library event (`buildApprovalRequestedEvent`, `approvalId({provider: 'conciv', kind: 'tool', target: name})` from `@tanstack/ai-sandbox`) and returns a refusal. A granted id passes. This is also the only gate for codex, which has no permission hook |
| claude-code asks `approval_prompt` for bridged `mcp__` tools, and the policy `default: 'ask'` would deny-and-retry every call | Bridged tool names go into the adapter's allowed tools. Their gate is `gatedTools`, above |
| opencode and ACP ignore `SandboxPolicy`; their ids are coarse (`opencode:tool:bash`, the ACP title) | Accepted as the library's granularity. A session grant on opencode bash covers every bash command for that thread. Called out in the UI copy of the ask ("all bash commands this session") |
| Code mode forbids `needsApproval` tools (`create-code-mode-tool.ts:115`) | Gated tools inside code mode use the same `gatedTools` deny-and-retry: the refusal surfaces inside the sandbox as a tool error |

## What gets deleted

- The blocking ask: `makeAskGate`'s `waitFor`, `ASK_TIMEOUT_MS`, `asks.cancel` on run end, the
  `timeout` decision, `approvalSettledChunk` / `conciv.approval-settled`, `approvalAskOf` /
  `approvalSettledOf` in protocol (replaced by parsing the library event shape).
- Our `permission.resolve` override in `gateProvisioner`; the library's resolver runs.
- The opencode and ACP permission handlers (`opencodePermissionHandler`, `acpPermissionHandler`);
  the library defaults run.
- `classifyCommand` and its grammar helpers, once the `SandboxPolicy` carries the same allow list.
- `command-memory.ts` as an in-memory matcher; its role moves to the grant store.
- Inline-card approval UI keyed on `part.state === 'approval-requested'` for harness asks (the
  part never gets that state). Kept for any library path that still sets it from
  `RUN_FINISHED` interrupts (MCP `needsApproval`, see TanStack/ai#1924).
- Push-socket replay of pending asks (`api/push.ts`): pending asks come from the grant store and
  the thread's last run instead.

## Decisions (user, 2026-10-29)

1. RPC `registry.call`, `server_reload`, `server_restart` (`api/rpc/router.ts:41-64`) stop
   asking: the human calling them from the widget is the approval. `approveAskGatedCall` and the
   `noListenerRefusal` path are deleted. Agent-initiated calls go through a chat run and hit
   `gatedTools`.
2. Approving posts a visible user message ("Approved: <title>"; "Approved for this session:
   <title>" for session scope) through the normal send path. Denying posts nothing; the ask is
   dismissed and the refusal stands.

## Acceptance

- Every harness (claude-code, codex, opencode, acp, code mode) asking a risky action produces one
  pending ask in the strip. Approving once runs it on the retry. Approving for session lets a
  repeat of the same id through without asking. Denying leaves it refused.
- Read-only commands run without an ask under the policy.
- Gated bridged tools are never executed without a grant (test per harness).
- Replay: reloading the pane with a pending ask shows it again.
- Tests move to the new flow: `code-mode-approval-replay.it`, `bridge-gate.it`,
  `apps/conciv/test/approval-replay.browser`, `ui-kit-chat chain-approval-collapse.browser`.
- No `waitFor`, no timeout constant, no `approval-settled` left (grep).
