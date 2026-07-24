# Fase 2 — Pacote 4: DAG estimativa/resolução e RLS das tabelas canônicas

Data: 24/07/2026. Base: auditoria `docs/014` §11.2 (price_estimates/inputs/resolutions) e SEC-008; continuação de `docs/021`.

## Defeito de segurança encontrado e corrigido (introduzido por mim nas migrações 42/46)

As tabelas canônicas foram criadas **sem habilitar RLS**; os default privileges do Supabase as deixaram legíveis com a chave anônima — confirmado em produção em 24/07: `pipeline_runs`, `shadow_publicacoes` e `dish_cost_components` responderam `200` com dados a chamadas anônimas. A migração 48 habilita RLS (sem policies) e revoga `anon`/`authenticated` nas 7 tabelas canônicas; só `service_role` (que ignora RLS) acessa. Verificar após aplicar (ver abaixo).

## O que este pacote entrega

**Migração 48** — o DAG de lineage do modelo-alvo fecha:

```
price_observation → price_estimate (+ inputs) → price_resolution → dish_cost_component
```

- `price_estimates`: a mediana online vira agregação declarada — valor importado do motor legado (`scraper_median_import_v1`), com **membership real** (`price_estimate_inputs` = as observações incluídas do snapshot, verdadeiro inclusive para o backfill, já que `resultados_brutos` sempre guardou só os aceitos) e **reconciliação**: a mediana SQL dos inputs é recalculada e comparada ao valor importado (`reconciliado` true/false; `null` sem inputs). Reconciliação não bloqueia publicação — divergência aparece no manifesto para investigação.
- Estimativa `manual`: cadastro atual (`cadastro_atual_v1`), inputs desconhecidos — **provenance parcial declarada**, nunca fabricada (liga às observações `manual_hist` quando a coleta manual migrar).
- `price_resolutions`: a regra do blend/fallback vira registro explícito por ingrediente (`custo_fixo`/`blend`/`manual`/`online`/`ausente`) com `valor_final`.
- `dish_cost_components.resolution_id`: todo componente aponta para sua resolução.
- `publicar_snapshot_shadow` v3 (`ipf-shadow-v2-dag`) constrói tudo na mesma transação; a fórmula do custo é idêntica (paridade re-testada) e o manifesto ganha contagens de estimativas/inputs/resoluções/não-reconciliadas.
- Tabelas novas são append-only (mesmo trigger das demais).

## Verificação

Suíte isolada 11/11 (48 aplicada 2×): paridade preservada com o DAG; estimativa online com 2 inputs reconcilia (mediana 0,007/0,009 = 0,008 = valor legado); snapshot sem observações fica `reconciliado=null`; regras por ingrediente corretas; nenhum componente sem resolução; append-only; RLS habilitado nas 7 tabelas (checado via `pg_class.relrowsecurity`).

## Ao aplicar a migração 48 em produção

1. Republicar o snapshot mais recente para materializar o primeiro DAG: `select publicar_snapshot_shadow(37);` — no manifesto, conferir `estimativasNaoReconciliadas` (esperado baixo; >0 indica snapshots com merge/rescrape onde as observações acumulam conjuntos — investigável, não erro do DAG).
2. Me acionar: eu confirmo via REST que o acesso anônimo às 7 tabelas passou a ser negado e leio o manifesto do DAG.

## O que fica para os próximos pacotes

- Coleta manual/contribuições gravando observações com vínculo (fecha a provenance da estimativa manual).
- Fila de anomalia revisável (alta_50pct) e mínimo de fontes/lojas (COL-006).
- QC na autoaprovação (PUB-005) usando as contagens/reconciliação do DAG como gates.
