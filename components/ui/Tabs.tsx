// navegação de abas no segbar do mockup (pills), como os controles da home
type Props<K extends string> = {
  tabs: readonly (readonly [K, string])[]
  active: K
  onChange: (k: K) => void
  className?: string
}

export default function Tabs<K extends string>({ tabs, active, onChange, className = '' }: Props<K>) {
  return (
    <nav className={`segbar ${className}`}>
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)} className={active === k ? 'on' : ''}>
          {label}
        </button>
      ))}
    </nav>
  )
}
