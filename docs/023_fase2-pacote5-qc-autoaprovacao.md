# Fase 2 — Pacote 5: QC na autoaprovação e coleta manual vinculada

Data: 24/07/2026. Base: auditoria `docs/014` PUB-005, Fase 2 itens 6–7; continuação de `docs/022`.

## Estado verificado antes deste pacote

Migração 48 aplicada: as 7 tabelas canônicas negam acesso anônimo (401) — exposição de RLS fechada. DAG do snapshot 37 materializado (`ipf-shadow-v2-dag`): 111 estimativas, 598 inputs, 125 resoluções, **0 não reconciliadas** — toda mediana online fecha com a mediana SQL das suas observações.

## O que este pacote entrega (migração 49)

1. **Coleta manual vinculada**: trigger em `precos_manuais_hist` — qualquer linha nova com `preco_manual` (leitura manual, contribuição aprovada, por qualquer caminho) vira observação canônica automaticamente, com `legacy_id` e dedup. Linhas só de custo fixo ficam de fora. A fonte manual deixa de depender de backfill.
2. **PUB-005 — autoaprovação deixa de ser cega**: `aprovar_coletas_pendentes` agora roda `verificar_qc_snapshot` antes de integrar. Checks versionados (`qc_config`, limiares iniciais: ≥100 ingredientes com preço, ≥95% de cobertura de fontes das receitas) são **sempre registrados** em `data_quality_checks` (append-only, RLS). Snapshot reprovado não integra — fica pendente com falha visível em `pipeline_runs` (`auto_approval_qc/failed`). A aprovação manual do admin segue sem gate (decisão humana explícita).
3. **Nenhuma metodologia muda**: os checks medem contagem/cobertura; amostra baixa (`qtd_resultados < 3`) é registrada como **aviso**, não bloqueio — transformar mínimo de fontes em regra que altera a mediana é ADR futura (COL-006).

## Verificação

Suíte isolada 12/12 (49 aplicada 2×): leitura manual nova vira observação com normalização e `legacy_id` (custo fixo não); snapshot sem preços é reprovado (2 checks bloqueantes registrados + falha no ledger) e permanece pendente; snapshot bom é integrado automaticamente com shadow publicado e mediana correta; configuração de QC versionada (versão maior vence).

## Ao aplicar a migração 49 em produção

Sem passo extra: o gate só atua na próxima autoaprovação do pg_cron. Conferência opcional:

```sql
select verificar_qc_snapshot(37);              -- true esperado
select regra, severidade, resultado, valor_observado, limiar
from data_quality_checks where snapshot_id = 37 order by id desc limit 3;
```

## Estado da Fase 2 após este pacote

Concluídos: identidade imutável das fontes online e manual (46/47/49), dedup + supersessão (45), evidência de descarte (47), ledger de execução (45/44), DAG estimativa→resolução→componente (48), QC na autoaprovação (49). Pendentes da fase: ADR de mínimo de fontes que altere a mediana (COL-006), fila de revisão humana para anomalias (`alta_50pct`), confiança estruturada do parser (COL-002 completo). Depois: Fase 3 (fatores e Laboratório sobre componentes canônicos).
