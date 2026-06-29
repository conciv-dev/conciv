import beautify from 'js-beautify'

// Pretty-print a serialized DOM string (the page `dom` read returns body.outerHTML as one unbroken
// line) into indented HTML so Pierre/Shiki renders it readably. Display-only — the wire payload stays
// raw. Uses js-beautify (VS Code's HTML formatter); falls back to the input if it throws.
// ([[page-dom-html-formatting]]) — lives here (not ui-kit-chat) since it's page-tool-specific.
export function formatHtml(src: string): string {
  try {
    return beautify.html(src, {indent_size: 2, wrap_line_length: 0, preserve_newlines: false})
  } catch {
    return src
  }
}
