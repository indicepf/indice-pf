# ADR Fase 1 — Verdade canônica em shadow

Data: 24/07/2026. Base: auditoria `docs/014` §11–13 (Fase 1) e inventário `docs/016`. Achados: IDX-001..006, DB-001..003, PUB-007.

## Decisões

1. **Motor canônico = SQL no banco.** O cálculo publicado passa a viver numa função transacional Postgres (`publicar_snapshot_shadow`), não em SQL + Python + TypeScript concorrentes (PUB-007). A fórmula da v1 reproduz o motor legado (`integrar_snapshot`, migração 29/31) **bug-for-bug** — blend média manual/online, fallback, custo_fixo, ausência = 0 — para que a paridade seja verificável antes de qualquer mudança metodológica. Mudança de fórmula é ADR futura, nunca efeito colateral.
2. **Shadow-first, zero impacto na leitura vigente.** A publicação canônica grava apenas em tabelas novas (`dish_cost_components`, `shadow_publicacoes`, `pipeline_runs`). Não toca `custos_pratos` nem `snapshots.custo_total_pf`. Home/Histórico/Simulador continuam exatamente como estão até o cutover da Fase 5.
3. **Imutabilidade por append-only + versão.** `dish_cost_components` e `shadow_publicacoes` têm trigger que bloqueia UPDATE/DELETE. Reexecutar a publicação cria `calc_version` nova; a anterior permanece. Editar cadastro (receita, preço manual) depois de publicado não altera nenhuma versão publicada — os valores são congelados na linha do componente.
4. **Publicação transacional com gates.** A função valida dentro da transação: componentes > 0, pratos calculados ≥ pratos ativos esperados, nenhum custo ≤ 0. Qualquer falha lança exceção e faz rollback integral (nada é gravado, nem o run). Sucesso grava manifesto (contagens, mediana, mediana legada, hash md5 dos componentes) e o run no ledger.
5. **Status informacional em `snapshots`.** Colunas aditivas `status`, `methodology_version`, `published_at`, `published_by`, `supersedes_snapshot_id`, com backfill derivado do fato atual (tem `custos_pratos` → `published`; senão `staged`, `methodology_version='legacy-v1'`). Nenhum fluxo passa a depender delas nesta fase; são a base para o workflow formal.
6. **Lineage mínimo nesta fase.** Cada componente referencia `precos.id` (quando online) e congela inline preço manual, preço online, quantidade e fonte efetiva. As identidades completas `price_observations → price_estimates → price_resolutions` do modelo-alvo (§11.2) entram quando a coleta migrar (pacote da Fase 2) — criá-las agora, sem a coleta gravar nelas, produziria tabelas vazias sem enforcement real. Registrado como dívida declarada da Fase 1.
7. **Paridade como função de banco.** `verificar_paridade_shadow(snapshot, versao)` devolve a diferença por prato entre a decomposição shadow e `custos_pratos`. Gate da fase: divergência zero na fórmula congelada (fixtures) e divergências de produção classificadas antes da Fase 5.

## Alternativas rejeitadas

- Motor canônico em TypeScript/API: manteria dois motores (SQL do pipeline + TS) e transação/lock ficariam fora do banco.
- Dual-write imediato em `custos_pratos`: violaria "shadow não altera a leitura vigente" e acoplaria o rollout ao pipeline atual.
- Imutabilidade já sobre `custos_pratos`/`precos`: quebraria `recalcular_custos_ultimo_snapshot` e a auditoria de entradas hoje em uso; enforcement sobre o legado é decisão da Fase 5.

## Aplicação e rollback

Migração: `supabase/migrations/supabase_migration_42.sql` (idempotente, aditiva). Teste em banco isolado: `scripts/test_migration_42.sh` (docker). **Não aplicar em produção sem aprovação**; o rollback completo está comentado no fim do arquivo da migração (drop das tabelas/funções/triggers novas e das colunas adicionadas — nenhum dado legado é tocado).
