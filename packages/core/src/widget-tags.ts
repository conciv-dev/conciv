export type HtmlTag = {tag: string; attrs: Record<string, string | boolean>; injectTo: 'head'}

// <head> tags the widget needs, injected by the bundler plugin. pw-api-base points at the
// standalone core server (cross-origin); the script tag loads the widget bundle when given a url.
export function htmlTags(corePort: number, opts: {previewId: string; widgetUrl?: string}): HtmlTag[] {
  const tags: HtmlTag[] = [
    {tag: 'meta', attrs: {name: 'pw-api-base', content: `http://127.0.0.1:${corePort}`}, injectTo: 'head'},
    {tag: 'meta', attrs: {name: 'pw-preview-id', content: opts.previewId}, injectTo: 'head'},
  ]
  if (opts.widgetUrl) tags.push({tag: 'script', attrs: {src: opts.widgetUrl, defer: true}, injectTo: 'head'})
  return tags
}
