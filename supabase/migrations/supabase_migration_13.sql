-- ============================================================================
-- Migração 13 — corrige 6 pratos que apontavam para o ingrediente errado
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Cada prato tinha seu ingrediente-chave consolidado num genérico errado.
-- Aqui criamos o ingrediente correto e re-apontamos APENAS a linha da receita
-- daquele prato (sem afetar os demais pratos que usam o genérico).
-- ============================================================================

-- helper: insere um ingrediente só se ainda não existir (por nome)
-- e repoenta a linha de um prato do ingrediente antigo para o novo.

-- 1) Matambre Recheado Assado PF (prato 85): Acém bovino → Matambre bovino
insert into ingredientes (nome, categoria, busca, unidade, palavras_ok, palavras_nao, ativo)
select 'Matambre bovino', 'Proteína bovina', 'matambre bovino', 'g', 'matambre', null, true
where not exists (select 1 from ingredientes where nome = 'Matambre bovino');
update receitas set ingrediente_id = (select id from ingredientes where nome = 'Matambre bovino')
where prato_id = 85 and ingrediente_id = 2;

-- 2) Bife à Rolê ou Bife de Panela (prato 64): Alcatra → Coxão duro bovino
insert into ingredientes (nome, categoria, busca, unidade, palavras_ok, palavras_nao, ativo)
select 'Coxão duro bovino', 'Proteína bovina', 'coxão duro', 'g', 'coxão duro|coxao duro', 'coxão mole|coxao mole|moído|moido', true
where not exists (select 1 from ingredientes where nome = 'Coxão duro bovino');
update receitas set ingrediente_id = (select id from ingredientes where nome = 'Coxão duro bovino')
where prato_id = 64 and ingrediente_id = 3;

-- 3) Guisado de Filhote (prato 59): Pintado → Filhote/Piraíba (peixe)
insert into ingredientes (nome, categoria, busca, unidade, palavras_ok, palavras_nao, ativo)
select 'Filhote/Piraíba (peixe)', 'Pescado', 'piraíba peixe posta', 'g', 'piraíba|piraiba|filhote', 'ração|racao|cachorro|gato|cão|cao|pet', true
where not exists (select 1 from ingredientes where nome = 'Filhote/Piraíba (peixe)');
update receitas set ingrediente_id = (select id from ingredientes where nome = 'Filhote/Piraíba (peixe)')
where prato_id = 59 and ingrediente_id = 82;

-- 4) Peixe Frito (Lambari/Traíra) (prato 13): Pintado → Lambari/Traíra (peixe)
insert into ingredientes (nome, categoria, busca, unidade, palavras_ok, palavras_nao, ativo)
select 'Lambari/Traíra (peixe)', 'Pescado', 'traíra peixe', 'g', 'traíra|traira|lambari', 'isca|artificial|silicone|anzol|chumbada|conserva|sardinha', true
where not exists (select 1 from ingredientes where nome = 'Lambari/Traíra (peixe)');
update receitas set ingrediente_id = (select id from ingredientes where nome = 'Lambari/Traíra (peixe)')
where prato_id = 13 and ingrediente_id = 82;

-- 5) Caldo de Piranha do Pantanal (prato 12): Pintado → Piranha (peixe)
insert into ingredientes (nome, categoria, busca, unidade, palavras_ok, palavras_nao, ativo)
select 'Piranha (peixe)', 'Pescado', 'piranha peixe', 'g', 'piranha', 'cabelo|prendedor|alicate|brinquedo|pelúcia|pelucia|tesoura|grampo|presilha', true
where not exists (select 1 from ingredientes where nome = 'Piranha (peixe)');
update receitas set ingrediente_id = (select id from ingredientes where nome = 'Piranha (peixe)')
where prato_id = 12 and ingrediente_id = 82;

-- 6) Frango c/ Polenta e Radite (prato 89): Alface → Radite (almeirão)
insert into ingredientes (nome, categoria, busca, unidade, peso_ref_g, palavras_ok, palavras_nao, ativo)
select 'Radite (almeirão)', 'Legume/Verdura', 'almeirão maço', 'maco', 300, 'almeirão|almeirao|radite|radicchio|chicória|chicoria', null, true
where not exists (select 1 from ingredientes where nome = 'Radite (almeirão)');
update receitas set ingrediente_id = (select id from ingredientes where nome = 'Radite (almeirão)')
where prato_id = 89 and ingrediente_id = 4;
