// navegação de abas em sublinhado (padrão de /perfil, /admin e /evolucao)
type Props<K extends string> = {
  tabs: readonly (readonly [K, string])[]
  active: K
  onChange: (k: K) => void
  className?: string
}

export default function Tabs<K extends string>({ tabs, active, onChange, className = '' }: Props<K>) {
  return (
    <nav className={`flex gap-5 border-b border-border ${className}`}>
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`text-sm pb-2 -mb-px border-b-2 transition whitespace-nowrap cursor-pointer ${
            active === k ? 'border-accent text-ink font-medium' : 'border-transparent text-dim hover:text-ink'
          }`}>
          {label}
        </button>
      ))}
    </nav>
  )
}
