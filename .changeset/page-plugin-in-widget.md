---
'@conciv/app': patch
---

The widget now carries the page plugin's browser half: the open tab attaches to the session you are on, so the agent's page tools reach that tab through the plugin, and other plugins can read the page and its React tree.

Turning the highlight effect on (`page_effect`) now shows the page plugin's inspector: hover outlines an element, a click opens its source in your editor, Escape turns it off.

`@conciv/ui-kit-system/host.css` is a new stylesheet: the shadow host block the widget uses (reset `all: initial`, the `.light`/`.dark` color scheme on the host, border-box sizing), so other shadow roots can match the widget.

While the agent uses the page, its veil and cursor are drawn once, by the page plugin, under the chat panel: the chat's Stop and composer stay clickable. The highlight inspector draws above the panel again, as before.

`@conciv/backend-plugin-api`: a `page.overlay` slot item with `hides: false` is drawn over the page and leaves the widget alone: Escape, the panel's focus trap, the launcher and the quick bar behave as if it were not there.
