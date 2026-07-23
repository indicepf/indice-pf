import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { todasLinhas } from '@/lib/server/paginar'
import { mediana } from '@/lib/stats'
import { MAPA_INGREDIENTE_DIEESE } from '@/lib/mapa-ingredientes'

// Confiabilidade: nosso preço medido × preço medido pelo DIEESE, item a item.
//
// Duas medições independentes do mesmo produto. Se concordam, ambas ganham
// credibilidade; se divergem muito num item, é sinal para investigar a coleta
// daquele item. Não é regressão nem estimativa — é comparação direta.
//
// A razão é nosso_preço / preço_DIEESE: 1,00 = igual, 0,80 = medimos 20% menos.
// Compara só os meses em que existem as duas medições.

export const maxDuration = 60


export async function GET() {
  const db = supabaseAdmin()
  const ids = [...new Set(MAPA_INGREDIENTE_DIEESE.map(m => m.id))]
  const series = [...new Set(MAPA_INGREDIENTE_DIEESE.map(m => m.serie))]

  // coletas → mês
  const snaps = await todasLinhas<{ id: number; data: string }>((de, ate) =>
    db.from('snapshots').select('id, data').order('data', { ascending: true }).range(de, ate))
  if (!snaps.length) return NextResponse.json({ error: 'sem coletas' }, { status: 500 })
  const mesDoSnap = new Map(snaps.map(s => [s.id, s.data.slice(0, 7)]))

  // Nosso preço por ingrediente em cada coleta. As coletas antigas não gravaram
  // ingrediente_id (só nome_ingrediente), então casa também por nome idêntico
  // (ignorando maiúsculas) — o que dobra a cobertura de vários itens. Match
  // exato de propósito: a coleta antiga tinha "Carne Bovina" genérica, que NÃO
  // deve casar com "Alcatra bovina".
  const precos = await todasLinhas<{ snapshot_id: number; ingrediente_id: number | null; nome_ingrediente: string | null; mediana_exibicao: number; label: string }>((de, ate) =>
    db.from('precos').select('snapshot_id, ingrediente_id, nome_ingrediente, mediana_exibicao, label').range(de, ate))

  const norm = (s: string) => s.trim().toLowerCase()
  const idPorNome = new Map(MAPA_INGREDIENTE_DIEESE.map(m => [norm(m.nome), m.id]))
  const alvo = new Set(ids)

  // agrega por (ingrediente, mês): mediana das coletas do mês
  const porIngMes = new Map<string, number[]>()
  const unidade = new Map<number, string>()
  for (const p of precos) {
    const ym = mesDoSnap.get(p.snapshot_id)
    if (!ym || !p.mediana_exibicao || p.mediana_exibicao <= 0) continue
    const ing = (p.ingrediente_id && alvo.has(p.ingrediente_id))
      ? p.ingrediente_id
      : (p.nome_ingrediente ? idPorNome.get(norm(p.nome_ingrediente)) : undefined)
    if (ing == null) continue
    const k = `${ing}|${ym}`
    const arr = porIngMes.get(k) ?? []
    arr.push(p.mediana_exibicao)
    porIngMes.set(k, arr)
    if (p.label) unidade.set(ing, p.label)
  }

  // DIEESE nos mesmos meses
  const meses = [...new Set(snaps.map(s => s.data.slice(0, 7)))].sort()
  const dieese = await todasLinhas<{ serie: string; data: string; valor: number }>((de, ate) =>
    db.from('fatores_preditores').select('serie, data, valor')
      .in('serie', series).gte('data', `${meses[0]}-01`).range(de, ate))
  const dieesePorSerieMes = new Map<string, number>()
  for (const d of dieese) dieesePorSerieMes.set(`${d.serie}|${d.data.slice(0, 7)}`, Number(d.valor))

  const itens = MAPA_INGREDIENTE_DIEESE.map(m => {
    const pontos = meses.map(ym => {
      const nossos = porIngMes.get(`${m.id}|${ym}`)
      const nosso = nossos?.length ? Math.round(mediana(nossos) * 100) / 100 : null
      const deles = dieesePorSerieMes.get(`${m.serie}|${ym}`) ?? null
      return {
        ym, nosso, dieese: deles,
        razao: nosso != null && deles ? Math.round((nosso / deles) * 1000) / 1000 : null,
      }
    }).filter(p => p.nosso != null || p.dieese != null)

    const razoes = pontos.map(p => p.razao).filter((r): r is number => r != null)
    return {
      id: m.id, nome: m.nome, serie: m.serie,
      comparabilidade: m.comparabilidade, nota: m.nota ?? null,
      unidade: unidade.get(m.id) ?? null,
      razaoMediana: razoes.length ? Math.round(mediana(razoes) * 1000) / 1000 : null,
      nMeses: razoes.length,
      pontos,
    }
  })

  return NextResponse.json({ meses, itens })
}
