import type { Metadata } from 'next'
import { Card } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Metodologia — Índice PF',
  description: 'Como o Índice PF coleta, valida e calcula o custo do prato feito brasileiro.',
}

const FONTES = [
  {
    titulo: 'Coleta no varejo online',
    texto: 'Duas vezes por mês (dias 1 e 15), o preço de mais de 100 ingredientes é coletado automaticamente no Google Shopping. Cada busca é validada por regras de inclusão e exclusão de termos, preços fora da curva são descartados por filtro estatístico (IQR) e o valor oficial do ingrediente é a mediana das cotações, normalizada para R$/kg.',
  },
  {
    titulo: 'Leituras manuais',
    texto: 'Ingredientes sem cotação online confiável recebem leituras de preço cadastradas pela equipe, com loja e fonte registradas. Quando um ingrediente tem leitura manual recente e preço online, o valor usado é a média das duas medianas.',
  },
  {
    titulo: 'Contribuições de campo',
    texto: 'Usuários fotografam etiquetas de preço em mercados e atacarejos. Cada foto tem localização e data registradas e passa por moderação antes de entrar na base. As contribuições aprovadas geram recompensa em dinheiro para quem enviou.',
  },
  {
    titulo: 'Calibração campo × online',
    texto: 'Os preços de campo aprovados são comparados com os preços online dos mesmos ingredientes para medir o desconto real de mercados e atacarejos por região — substituindo gradualmente os percentuais estimados.',
  },
] as const

export default function MetodologiaPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Metodologia</h1>
      <p className="text-dim mt-3 leading-relaxed">
        O Índice PF mede o custo de produção de uma porção de prato feito. São acompanhados
        <strong className="text-ink"> 100 pratos regionais</strong> — 20 de cada uma das 5 regiões do Brasil — com
        receitas fixas de ingredientes e quantidades por porção.
      </p>

      <h2 className="text-lg font-bold tracking-tight mt-10 mb-4">De onde vêm os preços</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {FONTES.map(f => (
          <Card key={f.titulo} className="p-5">
            <h3 className="font-medium">{f.titulo}</h3>
            <p className="text-sm text-dim mt-2 leading-relaxed">{f.texto}</p>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-bold tracking-tight mt-10 mb-3">Como o índice é calculado</h2>
      <ol className="list-decimal pl-5 space-y-2 text-sm text-dim leading-relaxed">
        <li>Cada ingrediente recebe um preço por grama (R$/g) a partir das fontes acima.</li>
        <li>O custo de um prato é a soma de <span className="text-ink">preço × quantidade da receita</span> de cada ingrediente da porção.</li>
        <li>O <span className="text-ink">índice nacional é a mediana dos custos dos 100 pratos</span> naquela coleta. Os índices regionais usam a mediana dos 20 pratos da região.</li>
      </ol>

      <h2 className="text-lg font-bold tracking-tight mt-10 mb-3">Níveis de preço</h2>
      <p className="text-sm text-dim leading-relaxed">
        O preço coletado é o do <strong className="text-ink">varejo online</strong>. Os níveis
        <strong className="text-ink"> Mercado (−10%)</strong> e <strong className="text-ink">Atacarejo (−22%)</strong> são
        estimativas aplicadas sobre o preço online, em processo de calibração com os dados de campo. Os percentuais
        serão substituídos pelos descontos reais medidos por região conforme as contribuições acumulam.
      </p>

      <h2 className="text-lg font-bold tracking-tight mt-10 mb-3">Limitações conhecidas</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm text-dim leading-relaxed">
        <li>A série histórica é recente — o índice ganha profundidade a cada coleta quinzenal.</li>
        <li>O preço online é nacional; a variação regional de um mesmo ingrediente vem dos dados de campo, ainda em acumulação.</li>
        <li>Ingredientes sem cotação na coleta usam o último preço conhecido (a cobertura de cada prato é exibida no detalhe).</li>
      </ul>
    </main>
  )
}
