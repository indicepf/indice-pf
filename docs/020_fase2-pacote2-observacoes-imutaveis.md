# Fase 2 — Pacote 2: observações imutáveis de preço

Data: 24/07/2026. Base: auditoria `docs/014` Fase 2 item 1 e §11.2 (`price_observations`); achados PUB-001/004, LAB-023, COL-005.

## Estado verificado antes deste pacote

Migração 45 confirmada em produção: linhas 1305→1453 (snap 33) e 1446→1456 (snap 34) superseded, com trilha em `audit_log`. Snapshots 33/34 publicados no shadow: medianas 16,31 vs 16,24 e 15,90 vs 15,78; prato 85 diverge +R$ 1,40/1,41 (o legado contava o Matambre em dobro) — conforme previsto em `docs/019`.

## O que este pacote entrega

**Migração 46 — `price_observations`**: identidade imutável e append-only de cada observação de preço da coleta online.

- `dedup_hash` é coluna **gerada no banco** (md5 de snapshot|ingrediente|título|loja|preços): o cliente não calcula nada, e a mesma oferta reinserida em replay não duplica (`ON CONFLICT DO NOTHING`). Replay idempotente por construção.
- Trigger append-only: UPDATE/DELETE proibidos. Correção futura será supersessão, nunca reescrita.
- **Backfill completo de `resultados_brutos`** com `legacy_table`/`legacy_id` preservados. Ofertas byte-idênticas no mesmo snapshot colapsam em uma — a deduplicação que a COL-005 pede.
- Consequência imediata: o `DELETE + INSERT` do pipeline e o hard-delete da auditoria do Laboratório **deixam de destruir o fato bruto** — a observação sobrevive na camada canônica (testado).

**Pipeline (`salvar_supabase.py`)**: dual-write — além do fluxo legado (leitura vigente até o cutover), cada resultado é gravado em `price_observations` com `run_id` do ledger. Falha na gravação das observações conta como falha do job (exit ≠ 0): preservar o fato bruto não é opcional.

## Verificação

`scripts/test_migration_42.sh`, etapa 9/9 (Postgres isolado): backfill produz N−duplicatas observações com `legacy_id`; reaplicação da migração e replay da mesma oferta não duplicam; oferta nova entra; UPDATE/DELETE bloqueados; delete do bruto legado não apaga a observação. Migração aplicada 2× (idempotência). `py_compile` do pipeline ok.

## Ao aplicar a migração 46 em produção

Verificação (me acione que eu confirmo via REST):

```sql
select count(*) from price_observations;                 -- ~nº de resultados_brutos (menos duplicatas idênticas)
select count(*) from price_observations where legacy_id is null;  -- 0 até a próxima coleta rodar
```

## Próximos pacotes da Fase 2

- Fontes manual/contribuições em `price_observations` (ampliar o check de `fonte`).
- `price_estimates` + `price_estimate_inputs` (mediana como agregação versionada com membership) e `price_resolutions` (blend/fallback), ligando `dish_cost_components.preco_id` ao DAG completo.
- Mínimo de fontes/lojas e anomalia revisável (COL-006/007); QC na autoaprovação (PUB-005).
