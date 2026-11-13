---
'@conciv/ui-kit-chat': patch
'@conciv/ai': patch
'@conciv/client': patch
---

A plugin's permission card offers "Always allow", which saves the answer for the project; cards for built-in tools keep "Allow for session". A permission card now leaves every open chat once anyone answers it, and a card whose request is already gone leaves when clicked instead of staying on screen. A denied card shows "Denied" in red with a blocked mark, the same tone the chat uses for a failed tool call.
