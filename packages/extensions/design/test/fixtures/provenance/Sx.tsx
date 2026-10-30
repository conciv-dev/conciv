import Card from '@mui/material/Card'

type Props = {titles: string[]}

export function Sx(props: Props) {
  return props.titles.map(function card(title) {
    if (title === '') return null
    return (
      <section key={title}>
        <h2>{title}</h2>
        {/* oxfmt-ignore */}
        <Card sx={{
                color: (theme) => theme.palette.primary.main,
                p: 2,
                marginTop: 2,
                '& .x': {pl: 1},
              }}
        >
          {title}
        </Card>
      </section>
    )
  })
}
