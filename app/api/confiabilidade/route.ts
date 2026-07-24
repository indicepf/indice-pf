import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { exigirAdmin, SEM_CACHE } from '@/lib/server/autorizar'
import { todasLinhas } from '@/lib/server/paginar'
import { mediana, media, mad, iqr, bootstrapMedianCI } from '@/lib/stats'
import { MAPA_INGREDIENTE_DIEESE } from '@/lib/mapa-ingredientes'

// N mínimo para o IC por bootstrap ter algum sentido (LAB-019: "intervalos
// por bootstrap quando a amostra permitir"). Abaixo disso, null — nenhuma
// falsa precisão. Diferente do nMin=6 do semáforo (lib/benchmark.ts): aqui é
// só sobre o bootstrap ser estatisticamente defensável, não classificação.
const N_MIN_BOOTSTRAP = 8

// Confiabilidade: nosso preço medido × preço medido pelo DIEESE, item a item.
//
// Duas medições independentes do mesmo produto. Se concordam, ambas ganham
// credibilidade; se divergem muito num item, é sinal para investigar a coleta
// daquele item. Não é regressão nem estimativa — é comparação direta.
//
// A razão é nosso_preço / preço_DIEESE: 1,00 = igual, 0,80 = medimos 20% menos.
// Compara só os meses em que existem as duas medições.

export const maxDuration = 60


export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req, 'api/confiabilidade')
  if ('resposta' in auth) return auth.resposta

  const db = supabaseAdmin()
  const ids = [...new Set(MAPA_INGREDIENTE_DIEESE.map(m => m.id))]
  const series = [...new Set(MAPA_INGREDIENTE_DIEESE.map(m => m.serie))]

  // coletas → mês
  const snaps = await todasLinhas<{ id: number; data: string }>((de, ate) =>
    db.from('snapshots').select('id, data').order('data', { ascending: true }).range(de, ate))
  if (!snaps.length) return NextResponse.json({ error: 'sem coletas', code: 'NO_SNAPSHOT' }, { status: 500, headers: SEM_CACHE })
  const mesDoSnap = new Map(snaps.map(s => [s.id, s.data.slice(0, 7)]))

  // Nosso preço por ingrediente em cada coleta (só linhas com ingrediente_id).
  const precos = await todasLinhas<{ snapshot_id: number; ingrediente_id: number | null; mediana_exibicao: number; label: string }>((de, ate) =>
    db.from('precos').select('snapshot_id, ingrediente_id, mediana_exibicao, label')
      .not('ingrediente_id', 'is', null).range(de, ate))

  const alvo = new Set(ids)

  // agrega por (ingrediente, mês): mediana das coletas do mês.
  // SÓ ingrediente_id — a coleta antiga (só nome_ingrediente) misturava
  // embalagens de 500g, mais caras por kg, e inflava a mediana (farinha caía de
  // R$11 antiga para R$8 na coleta estruturada). Comparar contra o DIEESE exige
  // regime homogêneo, então usamos apenas a coleta com ingrediente_id.
  const porIngMes = new Map<string, number[]>()
  const unidade = new Map<number, string>()
  for (const p of precos) {
    const ym = mesDoSnap.get(p.snapshot_id)
    if (!ym || !p.mediana_exibicao || p.mediana_exibicao <= 0) continue
    if (!p.ingrediente_id || !alvo.has(p.ingrediente_id)) continue
    const k = `${p.ingrediente_id}|${ym}`
    const arr = porIngMes.get(k) ?? []
    arr.push(p.mediana_exibicao)
    porIngMes.set(k, arr)
    if (p.label) unidade.set(p.ingrediente_id, p.label)
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

    // resumo sobre os meses comparáveis (com as duas medições) — nosso, dieese e
    // razão vêm todos do MESMO conjunto, para não descasar as colunas
    const comparaveis = pontos.filter(p => p.razao != null)
    const med = (xs: (number | null | undefined)[]) => {
      const v = xs.filter((x): x is number => x != null)
      return v.length ? Math.round(mediana(v) * 100) / 100 : null
    }
    // valor da nossa coleta mais recente (pode não ter par DIEESE ainda — o
    // DIEESE atrasa ~1 mês), para mostrar o preço atual mesmo sem comparação
    const nossoAtual = [...pontos].reverse().find(p => p.nosso != null)?.nosso ?? null

    // Diagnósticos do protocolo de benchmark (Fase 3, LAB-019): não mudam a
    // razaoMediana nem o semáforo (lib/benchmark.ts segue gatendo por nMin=6
    // e comparabilidade='direta') — só adicionam transparência sobre a
    // dispersão e a magnitude do erro, para todo N > 0.
    const razoes = comparaveis.map(p => p.razao!)
    const erros = comparaveis.map(p => Math.abs(p.nosso! - p.dieese!))
    const errosPct = comparaveis.filter(p => p.dieese! > 0).map(p => Math.abs(p.nosso! - p.dieese!) / p.dieese! * 100)
    const round3 = (v: number) => Math.round(v * 1000) / 1000
    const round2 = (v: number) => Math.round(v * 100) / 100
    const razaoMedianaVal = razoes.length ? mediana(razoes) : null
    const ic90 = comparaveis.length >= N_MIN_BOOTSTRAP ? bootstrapMedianCI(razoes, { pct: 0.9 }) : null
    const diagnosticos = comparaveis.length ? {
      viesPct: razaoMedianaVal != null ? round2((razaoMedianaVal - 1) * 100) : null,
      maeReais: round2(media(erros)),
      mapePct: errosPct.length ? round2(media(errosPct)) : null,
      madRazao: round3(mad(razoes)),
      iqrRazao: { q1: round3(iqr(razoes).q1), q3: round3(iqr(razoes).q3), iqr: round3(iqr(razoes).iqr) },
      bootstrapIC90Razao: ic90 ? [round3(ic90[0]), round3(ic90[1])] as [number, number] : null,
    } : null

    return {
      id: m.id, nome: m.nome, serie: m.serie,
      comparabilidade: m.comparabilidade, nota: m.nota ?? null,
      unidade: unidade.get(m.id) ?? null,
      // período efetivamente comparado (meses com as duas medições)
      periodo: comparaveis.length ? { ini: comparaveis[0].ym, fim: comparaveis[comparaveis.length - 1].ym } : null,
      nossoMediana: med(comparaveis.map(p => p.nosso)),
      dieeseMediana: med(comparaveis.map(p => p.dieese)),
      nossoAtual,
      razaoMediana: razaoMedianaVal != null ? round3(razaoMedianaVal) : null,
      nMeses: comparaveis.length,
      diagnosticos,
      pontos,
    }
  })

  return NextResponse.json({ meses, itens }, { headers: SEM_CACHE })
}
