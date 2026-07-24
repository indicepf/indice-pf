# Fase 2 — Pacote 1: supersessão de preços, dedup e ledger do pipeline

Data: 24/07/2026. Base: `docs/018` §B (duplicatas 33/34) e auditoria `docs/014` Fase 2 itens 6 e 8 (PUB-004/006/010, LAB-023 por analogia).

## O que este pacote entrega

1. **Supersessão em `precos`** (migração 45): `superseded_by/at/reason`. Corrigir um preço nunca apaga a linha antiga — ela aponta para a substituta, com trilha em `audit_log`. Totalmente reversível.
2. **Dedup dos casos existentes**: regra determinística — em cada `(snapshot, ingrediente)` com mais de uma linha ativa, vence a de maior id com mediana não nula (senão a de maior id); as demais são marcadas. Em produção isso resolve os snapshots 33/34 (ingrediente 1138: vencem as linhas 1453/1456; as originais sem mediana ficam superseded).
3. **Índice único parcial** `uq_precos_ativos_snapshot_ingrediente`: nunca mais duas linhas ativas para o mesmo `(snapshot, ingrediente)` — a causa raiz da recusa dos 33/34 não pode recorrer.
4. **Motores filtram superseded**: `integrar_snapshot` e `publicar_snapshot_shadow` ignoram linhas substituídas. Números legados já publicados **não** são reescritos pela migração; apenas cálculos futuros usam o filtro.
5. **Ledger no pipeline Python**: `salvar_supabase.py` registra cada execução em `pipeline_runs` (`coleta_salvar`: started → published/failed, com snapshot, modo, contagens e erro). Melhor esforço: falha do ledger não derruba o job, mas é impressa.

## Verificação

`scripts/test_migration_42.sh` (8/8, Postgres isolado): a 45 é aplicada **sobre** um banco que já contém duplicatas nos dois padrões reais (nula+valorada e valorada+valorada), duas vezes (idempotência). Asserções: zero duplas ativas restantes; vencedora correta; trilha em `audit_log`; nova duplicata bloqueada pelo índice; integração pós-45 usa só a linha ativa com paridade shadow zero; lineage (`preco_id`) nunca aponta para linha superseded; snapshot que era recusado por duplicata passa a publicar após o dedup — exatamente o fluxo esperado para 33/34.

## Ao aplicar a migração 45 em produção

1. Rodar em seguida: `select publicar_snapshot_shadow(33); select publicar_snapshot_shadow(34);`
2. A paridade desses dois divergirá no **prato 85**: o custo legado contou o Matambre duas vezes. Corrigir o número legado publicado é supersessão de snapshot (decisão da Fase 5) — não fazer via re-integração ad hoc.
3. Se a migração 29 ou a 44 forem reaplicadas algum dia, reaplicar a 45 (recriam os motores sem o filtro).

## O que fica para os próximos pacotes da Fase 2

- Identidades imutáveis `price_observations → price_estimates → price_resolutions` com a coleta gravando nelas (itens 1–3 da Fase 2) — exige redesenho do scraper/salvar; substituirá o `DELETE + INSERT`.
- Mínimo de fontes/lojas por mediana e anomalia revisável em vez de descarte unilateral (itens 4–5, COL-005/006/007).
- Remoção da autoaprovação sem QC (item 7, PUB-005) — depende dos checks de qualidade persistidos.
