export function Playground({
  page,
  script,
  caption,
}: {
  page: string
  script: string
  height?: number
  caption?: string
  autoplay?: boolean
}) {
  return (
    <figure
      data-playground={`${page}/${script}`}
      className="not-prose my-6 rounded-xl border bg-fd-card p-4 text-sm text-fd-muted-foreground"
    >
      {caption ?? script}
    </figure>
  )
}
