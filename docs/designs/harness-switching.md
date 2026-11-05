# Harness switching within one chat session

- **Author:** Omri Katz
- **Status:** Draft
- **Date:** 2026-11-03

---

## Overview

conciv runs chats through a harness: an AI coding CLI such as Claude Code, Codex, Gemini CLI, opencode or pi.
Today the server picks one harness when it starts, and every chat uses it. This design lets the user change
the harness of the current chat between turns, if more than one harness is installed. The chat continues with
the new harness, which receives the conversation so far, and the message log shows which harness wrote each
reply.

## The Problem

A user who has both Claude Code and Codex installed cannot use both in one conversation. To try the other
harness they must restart the conciv server with a different `--harness` flag and start a new chat, losing the
context they built up. Comparing harnesses on the same task, or handing a task to a different harness when one
gets stuck, means copying the conversation by hand.

conciv sits above the harnesses and already stores the full conversation in its own table. It already sends that
full history to a harness whenever there is no native session to resume. So nothing in the data model forces one
harness per chat; the limit is that the harness is chosen once per server process.

The proposed solution: record the harness on each chat, resolve it per chat instead of per server, and let the
user switch between turns. After a switch the next turn replays the stored history to the new harness, which then
starts its own native session and resumes it on later turns.

## Goals

- A user with two or more installed harnesses can switch the current chat's harness between turns from the
  widget, without restarting the server or losing the conversation.
- After a switch, the new harness answers with knowledge of the earlier turns, including turns written by a
  different harness.
- If the chat has messages, the user confirms the switch first and is told the history will be sent, with an
  approximate token count. An empty chat switches without a prompt.
- Every assistant message records which harness produced it, and the widget shows that label once a chat has
  used more than one harness.
- Switching back to a harness used earlier replays the full history again. It never resumes that harness's
  old native session, which has not seen the other harness's turns.
- The model list, slash commands, image handling and terminal launch follow the chat's current harness right
  after a switch, without a page reload.

## Non-Goals

- Switching while a turn is running.
- Carrying a harness's internal state across a switch (its todo list, file caches, permission grants). The new
  harness gets the conversation as text, not the old harness's working memory.
- Compacting the history automatically before a switch.
- Running two harnesses on the same turn, or comparing their answers side by side.
- Adding new harnesses or changing how a harness is installed or detected.

## Open Questions

- **Harnesses that cannot chat**: pi is on PATH, so it is offered, but its chat support is a stub and a switch to
  it produces an error turn. This matches what `--harness pi` does today. Should the switcher hide harnesses
  whose chat is a stub?
- **Attribution in replay**: the replayed history does not say which harness wrote each earlier reply. In the
  real run, Claude, asked "which assistant answered my previous question?", answered that it was itself, though
  Codex had answered. Should replayed assistant turns from another harness carry a "[Codex]" style prefix?
- **Replay fidelity**: the TanStack provider adapters turn the earlier history into a text preamble and drop old
  tool calls, tool results and images. The new harness sees what was said, not what tools ran.
- **Hidden panel stays interactive**: while a page-level dialog is open the panel is only made transparent
  (`data-conciv-suppressed`, `opacity: 0`), not `inert`, so it still takes clicks and no role-based test can see
  that it is hidden. This predates the feature and is why the panel-closing bug passed the browser test.

## Resolved During Build

- **Duplicate session-list entry after a switch**: fixed. A session records every native session it owned in
  `chat_metadata` (`conciv.session.earlierNatives`), and the list treats those as claimed.
- **Which harnesses are offered**: the boot harness plus every registered harness whose binary is on PATH. A
  config directory alone (for example `~/.gemini` without the `gemini` binary) does not count.
- **Old run rows**: runs recorded before this change are tagged with their session's harness, or `claude`
  when the run has no session.
- **Confirm dialog layer**: the confirm is an inline dialog inside the panel. A page-layer dialog hid the whole
  panel, the dialog with it.

## Critical User Journeys (CUJs)

### CUJ 1: Switch mid-conversation

- **Given**: Claude Code and Codex are installed; a chat on Claude Code has several turns.
- **When**: The user picks Codex in the harness switcher and confirms the dialog that says the history (about N
  tokens) will be sent, then asks "what did I ask you first?".
- **Then**: Codex answers from the replayed history. Its reply is labelled Codex; earlier replies are labelled
  Claude Code. The model list and slash commands now show Codex's.

### CUJ 2: Switch back

- **Given**: A chat that went Claude Code, then Codex.
- **When**: The user switches back to Claude Code and confirms.
- **Then**: Claude Code receives the full history including Codex's turns, not its old native session.

### CUJ 3: Empty chat

- **Given**: A new chat with no messages.
- **When**: The user picks a different harness.
- **Then**: The switch happens with no dialog; no labels are shown until a second harness is used.

### CUJ 4: Switch blocked during a run

- **Given**: A turn is streaming.
- **When**: The user opens the switcher.
- **Then**: The control is disabled; a direct switch request is rejected with a "session running" error.
