-- ============================================================================
-- Migração 5 — corrige sequências de id dessincronizadas pelo clone do projeto
-- Rode no SQL Editor do Supabase. Segura e idempotente.
--
-- O projeto novo foi criado a partir de um clone/backup do antigo, mas as
-- sequências de auto-incremento (id) não acompanharam os dados restaurados.
-- Resultado: INSERT tenta um id que já existe → "duplicate key".
-- setval(seq, max(id)) faz o próximo id ser max+1, sempre livre.
-- ============================================================================

select setval(pg_get_serial_sequence('snapshots', 'id'),
              (select coalesce(max(id), 1) from snapshots));

select setval(pg_get_serial_sequence('precos', 'id'),
              (select coalesce(max(id), 1) from precos));

select setval(pg_get_serial_sequence('resultados_brutos', 'id'),
              (select coalesce(max(id), 1) from resultados_brutos));

select setval(pg_get_serial_sequence('custos_pratos', 'id'),
              (select coalesce(max(id), 1) from custos_pratos));
