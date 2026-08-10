// Testes da camada de conversão do PF como unidade de conta (docs/031).
// O que precisa ficar travado: o sentido de cada conversão, o arredondamento
// e — o principal — que ausência de dado vire null, nunca 0.
import { describe, it, expect } from 'vitest'
import { lerNoMes, estenderTrimestral } from '@/lib/preditores'
import {
  converter, minutosDeTrabalho, fmtQuantidade, fmtTempo, SEMANAS_MES, CONVERSORES, seriePnad, REGIOES_PNAD,
  UNIDADES, UNIDADE_POR_KEY, valorNaUnidade, fmtNaUnidade, fmtEixo,
} from '@/lib/numerario'

describe('converter', () => {
  it('pfs_por_unidade: salário mínimo de R$ 1.518 com PF de R$ 16 compra 94,875 PFs', () => {
    expect(converter(16, 1518, 'pfs_por_unidade')).toBeCloseTo(94.875, 3)
  })
  it('unidades_por_pf: PF de R$ 16 com ouro a R$ 800/g vale 0,02 g', () => {
    expect(converter(16, 800, 'unidades_por_pf')).toBeCloseTo(0.02, 6)
  })
  it('os dois sentidos são recíprocos', () => {
    const a = converter(16, 800, 'pfs_por_unidade')!
    const b = converter(16, 800, 'unidades_por_pf')!
    expect(a * b).toBeCloseTo(1, 10)
  })

  it.each([
    ['custo do PF ausente', null, 800],
    ['cotação ausente', 16, null],
    ['custo do PF zero', 0, 800],
    ['cotação zero', 16, 0],
    ['custo negativo', -16, 800],
    ['cotação NaN', 16, NaN],
    ['custo infinito', Infinity, 800],
  ] as [string, number | null, number | null][])('%s devolve null, não 0', (_, custo, cotacao) => {
    expect(converter(custo, cotacao, 'pfs_por_unidade')).toBeNull()
    expect(converter(custo, cotacao, 'unidades_por_pf')).toBeNull()
  })
})

describe('minutosDeTrabalho', () => {
  it('Brasil 1T2026: renda R$ 3.722/mês e 39,2 h/semana pagam um PF de R$ 16 em ~44 min', () => {
    const min = minutosDeTrabalho(16, 3722, 39.2)!
    expect(min).toBeGreaterThan(43)
    expect(min).toBeLessThan(45)
  })
  it('renda por hora exatamente igual ao PF dá 60 minutos', () => {
    // renda tal que renda/(horas*SEMANAS_MES) = 16
    const renda = 16 * 40 * SEMANAS_MES
    expect(minutosDeTrabalho(16, renda, 40)).toBeCloseTo(60, 6)
  })
  it('renda maior encurta o tempo na mesma proporção', () => {
    const a = minutosDeTrabalho(16, 3000, 40)!
    const b = minutosDeTrabalho(16, 6000, 40)!
    expect(a / b).toBeCloseTo(2, 10)
  })
  it.each([
    ['sem custo', null, 3722, 39.2],
    ['sem renda', 16, null, 39.2],
    ['sem horas', 16, 3722, null],
    ['horas zero', 16, 3722, 0],
  ] as [string, number | null, number | null, number | null][])('%s devolve null', (_, c, r, h) => {
    expect(minutosDeTrabalho(c, r, h)).toBeNull()
  })
})

describe('fmtQuantidade', () => {
  it('respeita as casas decimais do conversor', () => {
    expect(fmtQuantidade(94.875, 0)).toBe('95')
    expect(fmtQuantidade(0.0203, 3)).toBe('0,020')
  })
  it('ausência vira travessão', () => { expect(fmtQuantidade(null, 2)).toBe('—') })
})

describe('fmtTempo', () => {
  it('menos de uma hora', () => { expect(fmtTempo(44.3)).toBe('44 min') })
  it('mais de uma hora', () => { expect(fmtTempo(132)).toBe('2 h 12 min') })
  it('hora cheia não mostra 0 min sobrando', () => { expect(fmtTempo(120)).toBe('2 h 0 min') })
  it('abaixo de um minuto mostra segundos', () => { expect(fmtTempo(0.5)).toBe('30 s') })
  it('ausência vira travessão', () => { expect(fmtTempo(null)).toBe('—') })
})

describe('seriePnad', () => {
  it('região canônica vira sufixo da série', () => {
    expect(seriePnad('pnad_renda', 'Centro-oeste')).toBe('pnad_renda_centro_oeste')
    expect(seriePnad('pnad_horas', 'Norte')).toBe('pnad_horas_norte')
  })
  it('sem região ou região desconhecida cai no agregado Brasil', () => {
    expect(seriePnad('pnad_renda', null)).toBe('pnad_renda')
    expect(seriePnad('pnad_renda', 'Centro-Oeste')).toBe('pnad_renda')   // grafia do topojson, não a nossa
  })
  it('cobre as 5 regiões do app', () => {
    expect(Object.keys(REGIOES_PNAD).sort()).toEqual(['Centro-oeste', 'Nordeste', 'Norte', 'Sudeste', 'Sul'])
  })
})

describe('CONVERSORES', () => {
  it('não tem série repetida', () => {
    expect(new Set(CONVERSORES.map(c => c.serie)).size).toBe(CONVERSORES.length)
  })
})

describe('UNIDADES', () => {
  it('cobre reais, os 5 conversores e o tempo de trabalho, sem chave repetida', () => {
    expect(UNIDADES.map(u => u.key)).toEqual(
      ['reais', ...CONVERSORES.map(c => c.serie), 'tempo'])
    expect(new Set(UNIDADES.map(u => u.key)).size).toBe(UNIDADES.length)
  })
  it('só "PFs por unidade" inverte a direção da leitura', () => {
    // inverte = a curva sobe quando o PF fica mais BARATO. É o que decide a
    // troca de min por max na faixa do gráfico da aba Índice.
    expect(UNIDADES.filter(u => u.inverte).map(u => u.key)).toEqual(['salario_minimo', 'dieese_cesta'])
  })
  it('cada unidade declara as séries de que depende', () => {
    expect(UNIDADE_POR_KEY.reais.series).toEqual([])
    expect(UNIDADE_POR_KEY.ouro.series).toEqual(['ouro'])
    expect(UNIDADE_POR_KEY.tempo.series).toEqual(['pnad_renda', 'pnad_horas'])
  })
})

describe('valorNaUnidade', () => {
  it('reais devolve o próprio custo', () => {
    expect(valorNaUnidade(UNIDADE_POR_KEY.reais, 16, {})).toBe(16)
  })
  it('conversor aplica o sentido declarado', () => {
    expect(valorNaUnidade(UNIDADE_POR_KEY.salario_minimo, 16, { salario_minimo: 1518 })).toBeCloseTo(94.875, 3)
    expect(valorNaUnidade(UNIDADE_POR_KEY.ouro, 16, { ouro: 800 })).toBeCloseTo(0.02, 6)
  })
  it('tempo usa renda e horas da PNAD', () => {
    expect(valorNaUnidade(UNIDADE_POR_KEY.tempo, 16, { pnad_renda: 3722, pnad_horas: 39.2 }))
      .toBeCloseTo(minutosDeTrabalho(16, 3722, 39.2)!, 10)
  })
  it.each([
    ['reais', {}, null],
    ['ouro', { ouro: null }, 16],
    ['ouro', { }, 16],
    ['tempo', { pnad_renda: 3722, pnad_horas: null }, 16],
    ['tempo', { pnad_renda: null, pnad_horas: 39.2 }, 16],
  ] as [string, Record<string, number | null>, number | null][])(
    '%s sem a série necessária devolve null, não 0', (key, vals, custo) => {
      expect(valorNaUnidade(UNIDADE_POR_KEY[key], custo, vals)).toBeNull()
    })
})

describe('fmtNaUnidade / fmtEixo', () => {
  it('formata cada unidade no seu formato', () => {
    expect(fmtNaUnidade(UNIDADE_POR_KEY.reais, 14.79)).toBe('R$ 14,79')
    expect(fmtNaUnidade(UNIDADE_POR_KEY.tempo, 132)).toBe('2 h 12 min')
    expect(fmtNaUnidade(UNIDADE_POR_KEY.ouro, 0.0205)).toBe('0,021 g')
  })
  it('ausência vira travessão, não zero', () => {
    expect(fmtNaUnidade(UNIDADE_POR_KEY.reais, null)).toBe('—')
    expect(fmtEixo(UNIDADE_POR_KEY.reais, 14.79)).toBe('R$15')
  })
})

describe('lerNoMes / estenderTrimestral', () => {
  const mensal = [{ data: '2026-05-01', valor: 0.5 }, { data: '2026-06-01', valor: 0.16 }]
  const tri = [{ data: '2025-10-01', valor: 3600 }, { data: '2026-01-01', valor: 3722 }]

  it('série mensal casa só no mês exato', () => {
    expect(lerNoMes(mensal, '2026-06-01', false)).toBe(0.16)
    expect(lerNoMes(mensal, '2026-07-01', false)).toBeNull()   // ainda não publicado
  })
  it('série trimestral vale pelos meses do trimestre', () => {
    expect(lerNoMes(tri, '2026-01-01', true)).toBe(3722)
    expect(lerNoMes(tri, '2026-02-01', true)).toBe(3722)
    expect(lerNoMes(tri, '2026-03-01', true)).toBe(3722)
    expect(lerNoMes(tri, '2025-12-01', true)).toBe(3600)       // trimestre anterior
  })
  it('trimestral vale até o seguinte sair, e para no alcance', () => {
    // 1T2026 (carimbo 01/2026) é a observação mais recente que existe em agosto
    expect(lerNoMes(tri, '2026-08-07', true)).toBe(3722)       // data diária também casa
    expect(lerNoMes(tri, '2026-09-01', true)).toBe(3722)       // 8 meses: último válido
    expect(lerNoMes(tri, '2026-10-01', true)).toBeNull()       // fonte parada vira buraco
  })
  it('mês anterior à primeira observação não é preenchido para trás', () => {
    expect(lerNoMes(tri, '2025-09-01', true)).toBeNull()
  })
  it('estenderTrimestral repete o trimestre pelos meses que ele cobre', () => {
    const m = estenderTrimestral(new Map([['2025-10', 3600], ['2026-01', 3722]]))
    expect(m.get('2025-11')).toBe(3600)
    expect(m.get('2025-12')).toBe(3600)
    expect(m.get('2026-02')).toBe(3722)
    expect(m.get('2026-09')).toBe(3722)
    expect(m.has('2026-10')).toBe(false)
    expect(m.has('2025-09')).toBe(false)
  })
  it('mapa vazio continua vazio', () => {
    expect(estenderTrimestral(new Map()).size).toBe(0)
  })
})
