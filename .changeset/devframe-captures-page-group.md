---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/client': patch
'@conciv/page': patch
'@conciv/embed': patch
'@conciv/app': patch
---

The captures and page procedures are also served as conciv:captures:* and conciv:page:* hub functions beside oRPC. Page queries now travel over the hub: the widget tab joins its session with conciv:page:join and answers conciv:page:query calls, so the push socket carries chat events only and the oRPC page.queries and page.reply procedures are gone. Every joined tab of a session still gets the query and the first reply wins; a reply that does not parse now fails at once with HANDLER_ERROR instead of timing out.
