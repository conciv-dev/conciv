export type SeoInput = {
  title: string
  description: string
  image: string
  ogType?: 'website' | 'article'
}

export function seo({title, description, image, ogType = 'website'}: SeoInput) {
  return [
    {title},
    {name: 'description', content: description},
    {property: 'og:type', content: ogType},
    {property: 'og:site_name', content: 'conciv'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:image', content: image},
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
    {name: 'twitter:image', content: image},
  ]
}
