'use client'

import { Modal } from '@/components/ui'

// Documentação do laboratório: de onde vêm os dados, como a reconstrução é
// feita, o que cada opção significa, limitações e como interpretar. Fica num
// modal para não poluir a tela, mas com o detalhe todo — é o que separa uma
// estimativa defensável de um número solto num gráfico.
export default function ModalMetodologia({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Metodologia — reconstrução do índice para o passado" onClose={onClose} wide>
      <div className="space-y-5 text-sm leading-relaxed max-h-[75vh] overflow-y-auto pr-1">

        <Secao t="O problema">
          A coleta real do Índice PF começou em <b>março de 2026</b>. Para mostrar como o prato feito
          se comportaria antes disso, projetamos o índice atual para trás usando a inflação medida de
          cada alimento. O resultado é uma <b>estimativa</b>, não uma medição — e está sempre marcado
          como tal (linha tracejada), separado da série medida (linha cheia).
        </Secao>

        <Secao t="De onde vêm os dados">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><b>Índice medido (março/2026 →):</b> nossa coleta. Preço de cada ingrediente raspado de
              varejo online + leituras de campo enviadas por usuários; o custo de cada um dos 100 pratos
              é a soma dos ingredientes pela receita, e o índice é a mediana desses 100 custos.</li>
            <li><b>IPCA por item (SIDRA/IBGE, tabela 7060):</b> variação percentual mensal oficial de ~198
              itens (arroz, carnes, tomate, óleo…). É o deflator: diz quanto cada alimento subiu ou caiu
              a cada mês. Disponível desde <b>janeiro/2020</b>. API pública, sem chave.</li>
            <li><b>Cesta básica DIEESE:</b> preço médio em R$ de 13 alimentos, medido presencialmente nas
              capitais, mensal desde <b>julho/1994</b> (início do Real). É uma fonte <b>independente</b> da
              nossa e do IPCA — por isso serve tanto de deflator alternativo quanto de validação.</li>
          </ul>
        </Secao>

        <Secao t="Como a reconstrução é feita">
          Todo método parte do mesmo princípio: <b>ancorar no que foi medido e caminhar para trás pela
          variação do deflator</b>. Formalmente, preço(mês−1) = preço(mês) ÷ (1 + variação_do_mês). O
          índice de cada mês passado é recomposto e dele se tira a mediana dos 100 pratos, a mesma
          estatística do índice real.
        </Secao>

        <Secao t="Os métodos, do mais preciso ao mais amplo">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><b>Por ingrediente (recomendado):</b> cada ingrediente é deflacionado pelo <i>seu próprio</i>
              item do IPCA — tomate pelo IPCA-tomate, carne pela IPCA-carnes. O peso de cada ingrediente
              vem da participação real dele no custo do prato. Preserva o movimento relativo entre
              alimentos. <b>Limite: só alcança 2020</b> (início do IPCA por item).</li>
            <li><b>Agregado — Cesta DIEESE:</b> deflaciona o índice inteiro por um único número, o preço da
              cesta básica. Menos preciso (trata todos os pratos igual), mas é a única forma de ir até
              <b> 1994</b>, e usa dado independente do IPCA.</li>
            <li><b>Agregado — IPCA Alimentação / fora do domicílio / cheio:</b> mesma ideia, deflacionando
              pela inflação de alimentos, de refeição-fora, ou geral. "Fora do domicílio" inclui serviço
              (mão de obra, aluguel), não só ingrediente; "cheio" nem é específico de comida.</li>
          </ul>
        </Secao>

        <Secao t="Confiança do mapeamento (só no método por ingrediente)">
          Cada um dos 137 ingredientes foi ligado à mão a um item do IPCA, com um nível de confiança:
          <ul className="list-disc pl-5 space-y-1.5 mt-1.5">
            <li><b>alta</b> — mesmo produto (Alcatra → Alcatra, Pintado → Peixe-pintado).</li>
            <li><b>média</b> — produto próximo ou agregado (Queijo coalho → Queijo; Peito de frango →
              Frango em pedaços — <i>não</i> o item "Peito", que no IPCA é bovino).</li>
            <li><b>baixa</b> — sem item próprio, cai no grupo (Rabada → Carnes; Sururu → Pescados).</li>
          </ul>
          O seletor escolhe até qual nível incluir. "Exata + próxima" cobre 90% do custo. Na prática os
          três níveis convergem, o que indica que a estimativa não depende das escolhas discutíveis na
          margem.
        </Secao>

        <Secao t="Margem de incerteza (a faixa sombreada)">
          A retropolação é <b>determinística</b> — não tem resíduo aleatório, então não cabe um intervalo
          de confiança estatístico, que seria falsa precisão. O que mostramos é honesto e diferente: a
          <b> faixa entre métodos independentes</b> (por ingrediente, DIEESE, IPCA-alimentação e
          IPCA-fora). Onde os caminhos concordam, a faixa é estreita e a estimativa é firme; onde
          discordam, ela se abre. Hoje a faixa fica em torno de <b>±2% a ±9%</b> conforme o mês. É uma
          medida de <i>robustez do método</i>, não de erro amostral.
        </Secao>

        <Secao t="Como interpretar — e o que não fazer">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Use para <b>leitura gráfica e contexto</b> ("o PF custaria ~R$9 em 2020, a preços de hoje").</li>
            <li>A parte tracejada é estimativa; a cheia é medição. Não trate a tracejada como dado real.</li>
            <li><b>Não</b> use a série reconstruída como variável num modelo, principalmente regredindo
              contra o próprio IPCA — como ela foi <i>construída</i> a partir do IPCA, o resultado seria
              circular (R² artificial perto de 1, sem significado).</li>
            <li>Quanto mais para trás, maior a incerteza: cesta e receitas mudam, e a composição de 2020
              é aplicada a preços de 1995.</li>
          </ul>
        </Secao>

        <p className="text-xs text-dim border-t border-border pt-3">
          Fontes: IBGE/SIDRA tabela 7060 (IPCA por item) · DIEESE, Pesquisa Nacional da Cesta Básica ·
          coleta própria do Índice PF. Todas de acesso público.
        </p>
      </div>
    </Modal>
  )
}

function Secao({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="font-semibold text-ink mb-1.5">{t}</h4>
      <div className="text-ink-2">{children}</div>
    </section>
  )
}
