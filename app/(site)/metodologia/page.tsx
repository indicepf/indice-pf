import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Metodologia — Índice PF',
  description: 'Como o Índice PF coleta, valida e calcula o custo do prato feito brasileiro.',
}

// conteúdo e layout do mockup (renderMethod), sem emojis
const FONTES = [
  ['Visitas de campo', 'Nosso time visita mercados e coleta preços presencialmente.'],
  ['Ligações', 'Contato direto com atacarejos e distribuidores.'],
  ['ABIA', 'Dados repassados pela Associação Brasileira da Indústria de Alimentos.'],
  ['Fotos de usuários', 'Preços enviados e validados pela comunidade.'],
  ['Scraping', 'Marketplaces, apps de pedidos e mídias de busca.'],
  ['Aproveitamento', 'Preço final calculado sobre o peso do produto já cozido.'],
] as const

export default function MetodologiaPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="box">
        <h2>Metodologia</h2>
        <p className="hint">Como o Índice PF é construído</p>
        <p style={{ color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 16 }}>
          O Índice PF mede a variação de preço dos alimentos que compõem o <b>prato feito</b> brasileiro —
          a refeição mais representativa do país — em múltiplos níveis da cadeia e cinco regiões.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 my-4">
          {FONTES.map(([t, d]) => (
            <div key={t} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
              <b className="text-sm">{t}</b>
              <p className="text-[13px] text-dim mt-1.5">{d}</p>
            </div>
          ))}
        </div>
        <div className="method-banner" style={{ marginTop: 8 }}>
          <div className="mb-ico">±5%</div>
          <div>
            <h4>Margem de erro</h4>
            <p>Por combinar múltiplas fontes, o índice trabalha com margem de erro de <b>±5%</b>. Ideal
              para tendência, não para precificação individual.</p>
          </div>
        </div>
      </div>

      <div className="box">
        <h2>Como o índice é calculado</h2>
        <p className="hint">Do preço do ingrediente ao custo do prato</p>
        <ol className="list-decimal pl-5 space-y-2 text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>
          <li>Cada ingrediente recebe um preço por grama (R$/g) a partir das fontes acima — o valor oficial é a mediana das cotações, com filtros estatísticos de outliers.</li>
          <li>O custo de um prato é a soma de <b>preço × quantidade da receita</b> de cada ingrediente da porção.</li>
          <li>O <b>índice é a mediana dos custos dos 100 pratos</b> em cada coleta. Os índices regionais usam a mediana dos 20 pratos da região.</li>
          <li>Os níveis <b>Mercado (−10%)</b> e <b>Atacarejo (−22%)</b> são estimativas sobre o preço online, em calibração contínua com os dados de campo.</li>
        </ol>
      </div>
    </main>
  )
}
