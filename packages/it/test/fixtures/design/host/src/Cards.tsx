import styles from './card.module.css'

const TITLES = ['Revenue', 'Invoices', 'Customers']
const TARGET_TITLES = TITLES.filter((title) => title !== 'Invoices')
export function Cards(props: {variant: string | null; column?: boolean}) {
  const titles = props.variant === 'target' || props.variant === 'mobile-gap' ? TARGET_TITLES : TITLES
  function card(title: string) {
    return (
      <article key={title} className={styles.card} data-conciv-key="54EGTw">
        <h2 data-conciv-key="_DB2qQ">{title}</h2>
        <p data-conciv-key="hJdrHg">{title.length * 1000}</p>
      </article>
    )
  }
  const gap = props.variant === 'mobile-gap' ? styles.mobileGap : ''
  const column = props.column ? styles.column : ''
  return <section className={`${styles.cards} ${gap} ${column}`} data-conciv-key="ytrNww">{titles.map(card)}</section>
}
