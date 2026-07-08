-- ============================================================================
-- Migração 28 — publicidade (house ads) — Fase 9 da migração V1
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 12: eh_admin)
--
-- Cria:
--   1. anuncios        — criativos geridos no /admin (slot, imagem, link,
--                        período de veiculação, peso p/ sorteio).
--   2. anuncio_eventos — impressões e cliques (insert público; leitura admin).
-- ============================================================================

-- 1. anuncios -----------------------------------------------------------------
create table if not exists public.anuncios (
  id          bigserial primary key,
  -- slots fixos: hero/lateral/billboard/leaderboard/nativo (blocos na página),
  -- popup (modal 1×/sessão), gate-grafico e gate-tabela (cobrem o conteúdo até fechar)
  slot        text not null check (slot in ('hero', 'lateral', 'billboard', 'leaderboard', 'nativo', 'popup', 'gate-grafico', 'gate-tabela')),
  titulo      text not null,
  texto       text,
  imagem_url  text,
  link        text,
  anunciante  text,
  ativo       boolean not null default true,
  inicio      date,
  fim         date,
  peso        int not null default 1 check (peso >= 1),
  escala      numeric not null default 1 check (escala > 0 and escala <= 1),  -- largura relativa do criativo (1 = 100% do slot)
  criado_em   timestamptz not null default now()
);

-- upgrade de tabela criada pela versão anterior desta migração (sem escala /
-- sem os slots popup e gate-*) — no-op se a tabela já está atualizada
alter table public.anuncios add column if not exists escala numeric not null default 1;
alter table public.anuncios drop constraint if exists anuncios_escala_check;
alter table public.anuncios add constraint anuncios_escala_check check (escala > 0 and escala <= 1);
alter table public.anuncios drop constraint if exists anuncios_slot_check;
alter table public.anuncios add constraint anuncios_slot_check
  check (slot in ('hero', 'lateral', 'billboard', 'leaderboard', 'nativo', 'popup', 'gate-grafico', 'gate-tabela'));

create index if not exists idx_anuncios_slot on public.anuncios (slot) where ativo;

alter table public.anuncios enable row level security;

-- leitura pública apenas dos ativos dentro do período; admin lê e edita tudo
drop policy if exists ads_select_publico on public.anuncios;
create policy ads_select_publico on public.anuncios
  for select using (
    (ativo and (inicio is null or inicio <= current_date) and (fim is null or fim >= current_date))
    or public.eh_admin()
  );

drop policy if exists ads_admin_all on public.anuncios;
create policy ads_admin_all on public.anuncios
  for all using (public.eh_admin()) with check (public.eh_admin());

-- 2. anuncio_eventos ------------------------------------------------------------
create table if not exists public.anuncio_eventos (
  id         bigserial primary key,
  anuncio_id bigint not null references public.anuncios(id) on delete cascade,
  tipo       text not null check (tipo in ('imp', 'click')),
  pagina     text,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_ad_eventos_anuncio on public.anuncio_eventos (anuncio_id, tipo);

alter table public.anuncio_eventos enable row level security;

-- qualquer visitante registra imp/click; só admin lê (métricas)
drop policy if exists adev_insert_publico on public.anuncio_eventos;
create policy adev_insert_publico on public.anuncio_eventos
  for insert with check (true);

drop policy if exists adev_admin_select on public.anuncio_eventos;
create policy adev_admin_select on public.anuncio_eventos
  for select using (public.eh_admin());
