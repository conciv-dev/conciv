import {load} from 'js-yaml'

const delimited = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[^\S\r\n]*(?:\r?\n|$)/

function matter(content: string) {
  const match = content.match(delimited)
  if (!match) return {data: {}, content}
  const data: unknown = load(match[1] ?? '')
  return {data: data ?? {}, content: content.slice(match[0].length)}
}

export function parse(content: string) {
  try {
    return matter(content)
  } catch {
    return matter(sanitize(content))
  }
}

export function parseOption(content: string) {
  try {
    return parse(content)
  } catch {
    return undefined
  }
}

export function sanitize(content: string) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
  if (frontmatter === undefined) return content
  const result = frontmatter.split(/\r?\n/).flatMap((line) => {
    if (line.trim().startsWith('#') || line.trim() === '' || /^\s+/.test(line)) return [line]
    const entry = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
    const key = entry?.[1]
    const value = entry?.[2]?.trim()
    if (key === undefined || value === undefined) return [line]
    if (value === '' || value === '>' || value === '|' || value.startsWith('"') || value.startsWith("'")) return [line]
    if (!value.includes(':') && !/^[[{].*[\]}]\s*\S/.test(value)) return [line]
    return [`${key}: |-`, `  ${value}`]
  })
  return content.replace(frontmatter, () => result.join('\n'))
}
