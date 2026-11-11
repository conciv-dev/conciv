import styles from './card.module.css'

const TITLES = ['Revenue', 'Invoices', 'Customers']
const TARGET_TITLES = TITLES.filter((title) => title !== 'Invoices')
export function Cards(props: {variant: string | null}) {
  const titles = props.variant === 'target' || props.variant === 'mobile-gap' ? TARGET_TITLES : TITLES
  function card(title: string) {
    return (
      <article key={title} className={styles.card}>
        <h2>{title}</h2>
        <p>{title.length * 1000}</p>
      </article>
    )
  }
  const gap = props.variant === 'mobile-gap' ? styles.mobileGap : ''
  return <section className={`${styles.cards} ${gap}`}>{titles.map(card)}</section>
}
