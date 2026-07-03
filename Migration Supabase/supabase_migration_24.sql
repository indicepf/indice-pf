-- Migration 24 — Ranking de contribuidores (item 9)
-- Função SECURITY DEFINER: um ranking público precisa agregar contribuições de todos
-- os usuários, o que o RLS bloquearia. A função roda com privilégio elevado mas só
-- devolve dados agregados (nome, contagens, cidade/uf, última data) das contribuições
-- APROVADAS. Nada sensível (sem CPF, PIX, e-mail).

create or replace function top_contribuidores(mes text default null)
returns table (
  user_id uuid,
  nome text,
  cidade text,
  uf text,
  entradas bigint,
  ingredientes bigint,
  ultima timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.user_id,
    coalesce(p.nome, 'Anônimo') as nome,
    (array_agg(c.cidade order by c.criado_em desc) filter (where c.cidade is not null))[1] as cidade,
    (array_agg(c.uf     order by c.criado_em desc) filter (where c.uf     is not null))[1] as uf,
    count(*)                       as entradas,
    count(distinct c.ingrediente_id) as ingredientes,
    max(c.criado_em)               as ultima
  from contribuicoes c
  left join profiles p on p.id = c.user_id
  where c.status = 'aprovada'
    and (mes is null or to_char(c.criado_em, 'YYYY-MM') = mes)
  group by c.user_id, p.nome
  order by entradas desc, ingredientes desc, ultima desc
  limit 10;
$$;

grant execute on function top_contribuidores(text) to anon, authenticated;
