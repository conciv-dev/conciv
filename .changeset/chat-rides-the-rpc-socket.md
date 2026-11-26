---
'@conciv/protocol': patch
'@conciv/backend': patch
'@conciv/backend-defaults': patch
'@conciv/client': patch
'@conciv/types': patch
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

A chat turn rides the browser rpc socket. `chat.send({sessionId, messages, runId})` starts the run once and streams it, and `chat.join({runId, lastEventId?})` streams a run from an event id; every event carries its offset in the run's log as its id, so a resubscribe after a drop never repeats one, and a resend of a known run id streams it instead of running it again. The `/chat-ws` socket, the `/chat-sse` stream, their path constants, the transport probe and the widget's `transport` setting are gone. `chatConnection` drops its transport options, and `@conciv/ai/client` exports `rpcStream` in place of `fetchServerSentEvents` and `webSocket`. A chat run that loses its stream retries on the rpc socket up to five times in a row with no event in between (250 ms doubling to 5 s), an event restarts that count, and once it is spent the turn fails with TanStack AI's `StreamReconnectLimitError`, as the old chat socket did; an error the engine answers is not retried.
