import {designConfig} from '../shared/tolerances.js'

export function siteNodeKey(el: Element): string | null {
  const site = el.getAttribute(SITE_ATTR)
  if (site === null) return null
  const alike = [...(el.parentNode?.children ?? [])].filter((sibling) => sibling.getAttribute(SITE_ATTR) === site)
  return `${site}${ORDINAL_SEPARATOR}${alike.indexOf(el)}`
}

const SITE_ATTR = designConfig.attributes.site
const ORDINAL_SEPARATOR = '/'
