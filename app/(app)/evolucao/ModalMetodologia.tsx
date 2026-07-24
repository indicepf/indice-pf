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
          A série medida usada aqui começa em <b>21 de junho de 2026</b>. Houve coleta desde março de
          2026, mas com metodologia anterior (sem id de ingrediente, embalagens misturadas), então esses
          pontos <b>não são comparáveis</b> e ficam fora do produto — é uma quebra de regime, não uma
          série contínua desde março. Para mostrar como o prato feito se comportaria antes disso,
          projetamos o índice atual para trás usando a inflação medida de cada alimento. O resultado é
          uma <b>estimativa</b>, não uma medição — e está sempre marcado como tal (linha tracejada),
          separado da série medida (linha cheia).
        </Secao>

        <Secao t="De onde vêm os dados">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><b>Índice medido (21/06/2026 →):</b> nossa coleta estruturada. Preço de cada ingrediente
              raspado de varejo online + leituras de campo enviadas por usuários; o custo de cada prato
              ativo é a soma dos ingredientes pela receita, e o índice é a mediana desses custos.</li>
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
          variação do deflator</b>. Formalmente, razão(mês−1) = razão(mês) ÷ (1 + variação_do_mês).
          No método <b>por ingrediente</b> (Fase 3), cada <b>componente canônico</b> do prato — o custo
          real de cada ingrediente, já resolvido como preço online, manual, blend ou custo fixo — é
          projetado individualmente por sua própria razão; não há peso de receita a normalizar, a soma
          dos componentes já é o custo do prato. O índice do mês é a mediana desses custos recompostos.
          Nos métodos <b>agregados</b>, apenas o índice agregado é projetado por um único deflator — os
          pratos individuais não são recompostos. Se faltar a variação de um mês (do item e do grupo), a
          série <b>para ali</b>: mês sem dado não vira variação zero.
        </Secao>

        <Secao t="Os métodos, do mais preciso ao mais amplo">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><b>Por ingrediente (recomendado):</b> cada componente é deflacionado pelo <i>seu próprio</i>
              item do IPCA — tomate pelo IPCA-tomate, carne pela IPCA-carnes — não importa se o preço da
              coleta é online, manual ou blend. Componente de <b>custo fixo do negócio</b>, ou ingrediente
              <b> sem item mapeado</b> no IPCA, fica <b>congelado</b>: mantém o valor nominal da âncora em
              todos os meses passados, sem ser deflacionado nem redistribuído sobre o resto — mais
              honesto do que assumir que ele se move junto com os alimentos. <b>Limite: só alcança 2020</b>
              (início do IPCA por item).</li>
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
          O seletor escolhe até qual nível incluir. Ingrediente fora do nível escolhido não sai da
          cesta: ele passa a ser deflacionado pelo grupo (Alimentação no domicílio) — é uma escolha do
          filtro, não uma lacuna. Na tela aparecem três números de cobertura, sobre o custo real da
          âncora: <b>por item próprio</b>, <b>pelo grupo</b> (política do filtro acima) e <b>congelado</b>
          (custo fixo ou ingrediente sem item — nunca deflacionado). Os três somam o custo total.
        </Secao>

        <Secao t="Por que não há faixa de incerteza">
          A retropolação é <b>determinística</b> — não tem resíduo aleatório, então não cabe um intervalo
          de confiança estatístico, que seria falsa precisão. A antiga “faixa entre métodos” foi
          removida: os métodos comparados usavam âncoras, cestas e conjuntos de meses diferentes, então
          o min–max entre eles não media incerteza. Um envelope de sensibilidade entre especificações
          só volta quando todos os métodos usarem a mesma âncora, a mesma cesta e o mesmo período,
          com backtest no trecho observado.
        </Secao>

        <Secao t="Como interpretar — e o que não fazer">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Use para <b>leitura gráfica e contexto</b>. O valor reconstruído é uma estimativa do
              custo da <b>cesta atual</b> em <b>reais nominais de cada época</b> (“quanto a cesta de
              hoje custaria em reais de 2020”) — não é valor “a preços de hoje”.</li>
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
