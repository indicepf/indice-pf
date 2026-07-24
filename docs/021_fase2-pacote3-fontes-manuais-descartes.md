# Fase 2 — Pacote 3: fontes manuais e evidência de descarte

Data: 24/07/2026. Base: auditoria `docs/014` Fase 2 itens 1 e 5 (COL-007/010, PUB-010); continuação de `docs/020`.

## Estado verificado antes deste pacote

Migração 46 aplicada em produção: 7.511 `resultados_brutos` → 7.129 `price_observations` (382 ofertas byte-idênticas colapsadas pela deduplicação), zero linhas sem `legacy_id`.

## O que este pacote entrega

**Migração 47**:
- `price_observations` aceita `fonte='manual_hist'` e ganha `status` (`included`/`rejected`) + `motivo`.
- **Backfill das 132 leituras de `precos_manuais_hist`** (com `preco_manual`; linhas só de custo fixo ficam de fora — parâmetro, não observação). Normalização R$/kg → R$/g registrada.
- `dedup_hash` recalculado por trigger BEFORE INSERT (a coluna gerada não pôde incluir `observed_at`: `timestamptz::text` não é imutável; `extract(epoch)` resolve sem depender de timezone). Semântica:
  - fontes não-online incluem `observed_at` no hash — duas leituras manuais iguais em datas diferentes são fatos distintos, nunca colapsam;
  - `status` entra no hash — a mesma oferta pode existir como rejeitada e como incluída (dois fatos; a curadoria formal chega com `price_estimates`).
- A recriação do hash suspende o append-only apenas para regravar a coluna derivada; nenhuma coluna de fato é tocada, e o trigger é recriado em seguida.

**Scraper (`scraper_pf.py`)**: cada descarte agora gera evidência estruturada no snapshot — `produto_invalido: <motivo>`, `preco_ilegivel`, `sem_quantidade_no_titulo`, `alta_50pct: teto R$X/kg`, `sanidade_ou_outlier` — em vez de sumir num print. O descarte unilateral do filtro de alta (COL-007) passa a ser auditável; a regra simétrica/revisão humana fica para o pacote de anomalias.

**Pipeline (`salvar_supabase.py`)**: grava aceitos (`status=included`) e descartados (`status=rejected` + motivo) em `price_observations`, com contagem de descartados no ledger (`pipeline_runs.counts`).

## Verificação

Suíte isolada 10/10 (migração 47 aplicada 2×): observações online preexistentes sobrevivem à recriação do hash; backfill manual com 2 leituras iguais em datas distintas não colapsa e custo fixo fica de fora; descarte entra com motivo e replay não duplica; rejeitada+incluída coexistem. `py_compile` e matriz do parser (20/20) ok.

## Ao aplicar a migração 47 em produção

```sql
select fonte, status, count(*) from price_observations group by 1, 2 order by 1, 2;
-- esperado: online_scrape/included 7129 e manual_hist/included ~130 (132 menos linhas sem preco_manual)
```

## Próximos pacotes da Fase 2

- `price_estimates` + `price_estimate_inputs` + `price_resolutions`: mediana como agregação versionada com membership derivado das observações (o pipeline passa a declarar o conjunto), ligando `dish_cost_components` ao DAG completo.
- Anomalia revisável de fato (fila de revisão para `alta_50pct` em vez de descarte automático) e mínimo de fontes/lojas (COL-006).
- QC na autoaprovação (PUB-005).
