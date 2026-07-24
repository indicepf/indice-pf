import 'server-only'

// Configuração versionada por fonte de ingestão (Fase 0D, docs/014).
// Na Fase 0 os campos IMPOSTOS são `essencial` e `minLinhas`: fonte essencial
// que falha ou fica abaixo do mínimo derruba o job (HTTP 5xx), em vez de
// terminar como sucesso parcial silencioso. `frequencia` e `lagDias`
// documentam o contrato de cada fonte e passam a ser impostos com o ledger de
// execução da Fase 1 (frescor/stale).

export type FonteConfig = {
  essencial: boolean
  minLinhas: number       // mínimo de linhas recebidas por execução
  frequencia: 'diaria' | 'mensal'
  lagDias: number         // atraso oficial esperado da publicação
}

export const FONTES_PREDITORES: { versao: number; fontes: Record<string, FonteConfig> } = {
  versao: 1,
  fontes: {
    // essenciais: alimentam retropolação, Laboratório e benchmark
    ipca:             { essencial: true,  minLinhas: 1,   frequencia: 'mensal', lagDias: 15 },
    ipca_alimentacao: { essencial: true,  minLinhas: 1,   frequencia: 'mensal', lagDias: 15 },
    ipca_alim_fora:   { essencial: true,  minLinhas: 1,   frequencia: 'mensal', lagDias: 15 },
    sidra_itens:      { essencial: true,  minLinhas: 100, frequencia: 'mensal', lagDias: 15 },
    // overlay/regressão: falha vira aviso ('parcial'), não derruba o job
    dolar:            { essencial: false, minLinhas: 1, frequencia: 'diaria', lagDias: 1 },
    euro:             { essencial: false, minLinhas: 1, frequencia: 'diaria', lagDias: 1 },
    selic:            { essencial: false, minLinhas: 1, frequencia: 'mensal', lagDias: 5 },
    salario_minimo:   { essencial: false, minLinhas: 1, frequencia: 'mensal', lagDias: 30 },
    bitcoin:          { essencial: false, minLinhas: 1, frequencia: 'diaria', lagDias: 1 },
    ibovespa:         { essencial: false, minLinhas: 1, frequencia: 'diaria', lagDias: 1 },
  },
}

export const FONTE_DIEESE = {
  versao: 1,
  essencial: true,
  minMesesPorProduto: 1,   // 0 meses = HTML vazio/markup mudado, nunca sucesso
  frequencia: 'mensal' as const,
  lagDias: 40,
}
