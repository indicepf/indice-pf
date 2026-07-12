import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { supabasePublico } from '@/lib/server/supabase-public'
import { brl, fmtData, limparNome, slugPrato, CORTE_COLETA } from '@/lib/format'

// Página pública por prato (SEO): conteúdo renderizado no servidor a partir do
// último custo calculado pelo pipeline. A visão interativa (série, fontes,
// níveis de preço) continua na home, via deep-link ?prato=.

type Dados = {
  prato: { id: number; nome: string; regiao: string }
  custo: number | null
  dataColeta: string | null
  itens: { nome: string; qtd_g: number; qtd_pb_g: number | null; qtd_cozida_g: number | null; qtd_meta_g: number | null }[]
}

// cache() deduplica entre generateMetadata e a página na mesma request
const getDados = cache(async (id: number): Promise<Dados | null> => {
  const db = supabasePublico()
  const { data: prato } = await db.from('pratos').select('id,nome,regiao').eq('id', id).single()
  if (!prato) return null
  const [{ data: custos }, { data: receitas }] = await Promise.all([
    db.from('custos_pratos').select('custo_total,snapshots(data)').eq('prato_id', id),
    db.from('receitas').select('qtd_g,qtd_pb_g,qtd_cozida_g,qtd_meta_g,ingredientes(nome)').eq('prato_id', id),
  ])
  // última coleta válida (>= corte) — poucas linhas por prato, resolve no JS
  const ult = ((custos || []) as any[])
    .map(c => ({ custo: Number(c.custo_total), data: c.snapshots?.data as string | undefined }))
    .filter(c => c.data && c.data >= CORTE_COLETA)
    .sort((a, b) => (a.data! < b.data! ? 1 : -1))[0]
  const itens = ((receitas || []) as any[])
    .map(r => ({
      nome: r.ingredientes?.nome as string,
      qtd_g: Number(r.qtd_g),
      qtd_pb_g: r.qtd_pb_g != null ? Number(r.qtd_pb_g) : null,
      qtd_cozida_g: r.qtd_cozida_g != null ? Number(r.qtd_cozida_g) : null,
      qtd_meta_g: r.qtd_meta_g != null ? Number(r.qtd_meta_g) : null,
    }))
    .filter(i => i.nome)
    .sort((a, b) => b.qtd_g - a.qtd_g)
  return { prato, custo: ult?.custo ?? null, dataColeta: ult?.data ?? null, itens }
})

const idDoSlug = (slug: string) => {
  const id = parseInt(slug, 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const id = idDoSlug(slug)
  const d = id ? await getDados(id) : null
  if (!d) return { title: 'Prato não encontrado — Índice PF' }
  const nome = limparNome(d.prato.nome)
  const desc = d.custo != null
    ? `Produzir uma porção de ${nome} custa ${brl(d.custo)} (coleta de ${fmtData(d.dataColeta!)}). Composição completa e preços no Índice PF.`
    : `Composição e custo de produção de ${nome} no Índice PF.`
  return {
    title: `Quanto custa produzir ${nome}? — Índice PF`,
    description: desc,
    alternates: { canonical: `/prato/${slugPrato(d.prato.id, d.prato.nome)}` },
    openGraph: { title: `${nome} — custo de produção`, description: desc },
  }
}

export default async function PratoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const id = idDoSlug(slug)
  if (!id) notFound()
  const d = await getDados(id)
  if (!d) notFound()

  // /prato/45 ou slug desatualizado → redireciona para o canônico
  const canonico = slugPrato(d.prato.id, d.prato.nome)
  if (slug !== canonico) permanentRedirect(`/prato/${canonico}`)

  const nome = limparNome(d.prato.nome)
  const pesoCompra = d.itens.reduce((s, i) => s + i.qtd_g, 0)
  const pesoServido = d.itens.reduce((s, i) => s + (i.qtd_meta_g || 0), 0)

  return (
    <main className="site-main" style={{ marginTop: 0, paddingTop: 40 }}>
      <div className="box" style={{ maxWidth: 760, margin: '0 auto 20px' }}>
        <p className="hint" style={{ marginBottom: 4 }}>{d.prato.regiao} · Índice PF</p>
        <h1 className="text-2xl font-extrabold tracking-tight">Quanto custa produzir {nome}?</h1>
        {d.custo != null ? (
          <p style={{ color: 'var(--ink-2)', lineHeight: 1.7, marginTop: 10 }}>
            Produzir uma porção de <b>{nome}</b> custa <b className="tnum">{brl(d.custo)}</b> no
            varejo online, segundo a coleta de {fmtData(d.dataColeta!)} do Índice PF — soma de
            preço × quantidade de cada ingrediente da receita, com margem de ±5%.
          </p>
        ) : (
          <p style={{ color: 'var(--ink-2)', lineHeight: 1.7, marginTop: 10 }}>
            Este prato ainda não tem custo calculado — o valor aparece após a próxima coleta.
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <Link href={`/?prato=${d.prato.id}`} className="btn-mk primary">
            Ver no índice interativo (série de preços e fontes)
          </Link>
          <Link href="/metodologia" className="btn-mk">Metodologia</Link>
        </div>
      </div>

      <div className="box" style={{ maxWidth: 760, margin: '0 auto' }}>
        <h2>Composição da porção</h2>
        <p className="hint">
          {d.itens.length} ingredientes · {Math.round(pesoCompra)} g comprados (cru)
          {pesoServido > 0 ? ` · ~${Math.round(pesoServido)} g servidos no prato` : ''}
        </p>
        <div className="overflow-x-auto">
          <table className="tbl-mk">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th style={{ textAlign: 'right' }} title="Quantidade bruta da receita original (peso cru)">Receita (PB)</th>
                <th style={{ textAlign: 'right' }} title="Quanto o PB rende depois do preparo (peso cozido)">Rende (PC)</th>
                <th style={{ textAlign: 'right' }} title="Quantidade desejada servida no prato">Meta no prato</th>
                <th style={{ textAlign: 'right' }} title="Quanto comprar (cru) para servir a meta — base do custo">Compra</th>
              </tr>
            </thead>
            <tbody>
              {d.itens.map(i => (
                <tr key={i.nome}>
                  <td>{i.nome}</td>
                  <td className="text-right text-dim tnum">{i.qtd_pb_g ? `${i.qtd_pb_g} g` : '—'}</td>
                  <td className="text-right text-dim tnum">{i.qtd_cozida_g ? `${i.qtd_cozida_g} g` : '—'}</td>
                  <td className="text-right text-dim tnum">{i.qtd_meta_g ? `${i.qtd_meta_g} g` : '—'}</td>
                  <td className="text-right tnum font-medium">{i.qtd_g} g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-dim leading-relaxed mt-4">
          O custo é preço de varejo × <b>Compra</b>: quanto se compra cru para servir a
          <b> Meta no prato</b>, corrigido pelo rendimento do preparo (carnes encolhem ao cozinhar;
          arroz e feijão expandem). Preços por ingrediente, fontes e evolução na{' '}
          <Link href={`/?prato=${d.prato.id}`} className="underline">visão interativa</Link>.
        </p>
      </div>
    </main>
  )
}
