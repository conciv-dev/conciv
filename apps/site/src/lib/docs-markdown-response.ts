import {getDocsMarkdown} from '@/lib/docs.functions'

export async function docsMarkdownResponse(slugs: string[]): Promise<Response> {
  const markdown = await getDocsMarkdown({data: slugs})
  if (markdown === null) return new Response('Not found', {status: 404, headers: {'Content-Type': 'text/plain'}})
  return new Response(markdown, {headers: {'Content-Type': 'text/markdown; charset=utf-8'}})
}
