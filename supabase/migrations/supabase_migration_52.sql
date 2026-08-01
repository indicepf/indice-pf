-- ============================================================================
-- Migração 52 — motivo da rejeição de contribuições
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 8: contribuicoes)
--
-- Problema: rejeitar uma contribuição gravava só status='rejeitada'. O usuário
-- via um badge "rejeitada" sem nenhuma explicação e não tinha como corrigir o
-- envio seguinte; e a moderação não deixava rastro do porquê da recusa.
--
-- Esta migração cria o destino do motivo. Não é preciso policy nova:
--   - contrib_select (migração 8) já expõe todas as colunas ao dono do envio,
--     então o contribuinte passa a ler o motivo em /meus-envios;
--   - contrib_admin_all (migração 9) já permite o UPDATE do moderador;
--   - o trigger trg_audit (migração 22) já registra o par dados_antes/depois em
--     audit_log, então o motivo fica arquivado para auditoria automaticamente,
--     visível no diff de /admin?aba=auditoria — sem tabela nem código novo.
--
-- motivo_categoria é texto livre (sem CHECK), como status na própria tabela: o
-- vocabulário vive em lib/format.ts (MOTIVOS_REJEICAO) e evoluir a lista não
-- deve exigir migração. Vocabulário inicial, seguindo price_observations.motivo
-- da migração 47: foto_ilegivel, preco_ausente, qtd_ausente,
-- produto_fora_catalogo, duplicada, nao_e_produto, outro.
-- ============================================================================

alter table contribuicoes
  add column if not exists motivo_categoria text,
  add column if not exists motivo_detalhe   text,
  add column if not exists rejeitado_por    uuid references auth.users (id) on delete set null,
  add column if not exists rejeitado_em     timestamptz;

comment on column contribuicoes.motivo_categoria is 'categoria da recusa (MOTIVOS_REJEICAO em lib/format.ts); null quando não rejeitada';
comment on column contribuicoes.motivo_detalhe   is 'observação livre do moderador, mostrada ao contribuinte';

-- ============================================================================
-- ROLLBACK:
--   alter table contribuicoes
--     drop column if exists motivo_categoria, drop column if exists motivo_detalhe,
--     drop column if exists rejeitado_por,    drop column if exists rejeitado_em;
-- ============================================================================
