# Fase 1 — Inventário do schema de produção

Data: 24/07/2026. Método: OpenAPI do PostgREST (`GET /rest/v1/` com credencial server-side de `.env.local`), somente leitura. Base da auditoria `docs/014` (DB-001, DB-011).

## Limites do método

`.env.local` não tem connection string Postgres, então `pg_catalog` não pôde ser consultado diretamente. O OpenAPI expõe tabelas, colunas, tipos e PKs do schema `public` e os nomes das RPCs expostas — **não** expõe policies RLS, triggers, grants, constraints não-PK nem funções internas (`integrar_snapshot` e `aprovar_coletas_pendentes` têm `revoke` e ainda assim aparecem listadas; a evidência de comportamento vem das migrations 29/31 versionadas). Toda migration nova deve ser aditiva e idempotente por causa desse limite.

## Tabelas (22) e colunas observadas

`*` = chave primária.

| Tabela | Colunas |
|---|---|
| `snapshots` | id\*, data, fonte, custo_total_pf, criado_em, simulado |
| `custos_pratos` | id\*, snapshot_id, prato_id, custo_total, ingredientes_cobertos, ingredientes_total, ingredientes_estimados, criado_em |
| `precos` | id\*, snapshot_id, ingrediente_id, nome_ingrediente, mediana_normalizada, mediana_exibicao, label, custo_porcao, qtd_resultados, desvio_padrao, media_exibicao, minimo_exibicao, maximo_exibicao, criado_em |
| `resultados_brutos` | id\*, snapshot_id, ingrediente_id, nome_ingrediente, titulo, preco_bruto, preco_normalizado, exibicao, loja, link, criado_em |
| `ingredientes` | id\*, nome, categoria, busca, unidade, peso_ref_g, palavras_ok, palavras_nao, ativo, custo_fixo, preco_manual, preco_manual_link, preco_manual_loja, preco_manual_em, criado_em |
| `pratos` | id\*, regiao, nome, ativo, criado_em |
| `receitas` | id\*, prato_id, ingrediente_id, qtd_g, qtd_cozida_g, qtd_pb_g, qtd_meta_g |
| `precos_manuais_hist` | id\*, ingrediente_id, nome, preco_manual, custo_fixo, loja, link, origem, contribuicao_id, tipo_local, criado_em |
| `fatores_preditores` | serie\*, data\*, valor, fonte, atualizado_em |
| `fatores_catalogo` | serie\*, label, categoria, granularidade, unidade, atualizado_em |
| `contribuicoes` | id\*, user_id, ingrediente_id, produto, preco, peso_g, tipo_loja, mercado, cidade, uf, lat, lng, foto_url, foto_etiqueta_url, foto_hash, status, endereco, bairro, regiao, marca, aprovado_por, aprovado_em, aprovado_dispositivo, aprovado_lat, aprovado_lng, criado_em |
| `historico_precos` | data, nome_ingrediente, preco, media, minimo, maximo, desvio_padrao, label, custo_porcao, qtd_resultados, custo_total_pf (sem PK exposta) |
| `profiles` | id\*, nome, telefone, regiao, cpf, chave_pix, consentimento_cpf_em, is_admin, is_super, sexo, data_nascimento, avatar_url, criado_em |
| `audit_log` | id\*, tabela, registro_id, acao, ator, dados_antes, dados_depois, criado_em |
| `super_acoes` | id\*, ator, ator_nome, acao, tabela, registro_id, dados_antes, dados_depois, dispositivo, lat, lng, criado_em |
| `assinaturas`, `pagamentos`, `webhook_eventos`, `pratos_usuario`, `anuncios`, `anuncio_eventos`, `login_log` | fora do escopo do Índice |

## RPCs expostas

`aprovar_coletas_pendentes`, `aprovar_contribuicao`, `aprovar_ultima_coleta`, `editar_contribuicao_aprovada`, `editar_leitura_manual`, `eh_admin`, `eh_super`, `integrar_snapshot`, `is_premium`, `recalcular_custos_ultimo_snapshot`, `refresh_precos_manuais`, `regiao_do_estado`, `salvar_leitura_manual`, `solicitar_saque`, `super_editar_perfil`, `super_editar_saque`, `super_excluir`, `top_contribuidores`.

## Confirmações dos achados da auditoria

- **DB-001 confirmado**: `snapshots` não tem `status`, `run_id`, `methodology_version`, `published_at`, `supersedes` nem hash. "Publicado" hoje é a mera existência de linha em `custos_pratos` (migração 29 §3).
- **DB-002 confirmado**: não existe decomposição por componente; `custos_pratos` guarda só o total e três contadores de cobertura (que o Histórico não usa — IDX-008).
- Não existe ledger de execução (`pipeline_runs`) nem tabela de qualidade.
- Motor de integração atual: `integrar_snapshot(sid)` (migração 29, corrigida pela 31) — upsert em `custos_pratos` com blend `média(manual/1000, mediana_normalizada)`, fallback manual→online, `custo_fixo` prioritário, ausência vira custo 0; mediana via `percentile_cont(0.5)` gravada em `snapshots.custo_total_pf`. `refresh_precos_manuais()` roda antes e muta o cadastro (PUB-008).
