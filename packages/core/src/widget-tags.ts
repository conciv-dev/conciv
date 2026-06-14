export type HtmlTag = {tag: string; attrs: Record<string, string | boolean>; injectTo: 'head'}

// <head> tags the bundler plugin injects: pw-api-base (cross-origin core server) + widget script.
export function htmlTags(corePort: number, opts: {previewId: string; widgetUrl?: string}): HtmlTag[] {
  const tags: HtmlTag[] = [
    {tag: 'meta', attrs: {name: 'pw-api-base', content: `http://127.0.0.1:${corePort}`}, injectTo: 'head'},
    {tag: 'meta', attrs: {name: 'pw-preview-id', content: opts.previewId}, injectTo: 'head'},
  ]
  if (opts.widgetUrl) tags.push({tag: 'script', attrs: {src: opts.widgetUrl, defer: true}, injectTo: 'head'})
  return tags
}
