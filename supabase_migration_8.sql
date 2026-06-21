-- ============================================================================
-- Migração 8 — Frente C: contribuições de preço por foto
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- 1) Tabela de contribuições
create table if not exists contribuicoes (
  id                bigserial primary key,
  user_id           uuid references auth.users (id) on delete set null,
  ingrediente_id    integer references ingredientes (id),
  produto           text,                 -- descrição do produto na foto
  preco             numeric,              -- R$ informado
  peso_g            numeric,              -- peso/quantidade da embalagem
  tipo_loja         text,                 -- mercado | atacarejo | feira
  mercado           text,                 -- nome da rede/loja
  cidade            text,
  uf                text,
  lat               numeric,
  lng               numeric,
  foto_url          text,                 -- foto do produto
  foto_etiqueta_url text,                 -- foto da etiqueta de preço (opcional)
  status            text default 'pendente',  -- pendente | aprovada | rejeitada
  criado_em         timestamptz default now()
);

alter table contribuicoes enable row level security;

-- usuário insere e lê apenas as próprias contribuições
drop policy if exists contrib_insert on contribuicoes;
create policy contrib_insert on contribuicoes for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists contrib_select on contribuicoes;
create policy contrib_select on contribuicoes for select using (auth.uid() = user_id);
-- (moderação/admin lê tudo via service_role, que ignora RLS)

-- 2) Bucket de Storage para as fotos
insert into storage.buckets (id, name, public)
values ('contribuicoes', 'contribuicoes', true)
on conflict (id) do nothing;

-- upload: usuário autenticado só pode gravar na própria pasta ({user_id}/...)
drop policy if exists contrib_upload on storage.objects;
create policy contrib_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'contribuicoes' and (storage.foldername(name))[1] = auth.uid()::text);

-- leitura pública das fotos (bucket público; etiquetas de preço, baixa sensibilidade)
drop policy if exists contrib_read on storage.objects;
create policy contrib_read on storage.objects for select
  using (bucket_id = 'contribuicoes');
