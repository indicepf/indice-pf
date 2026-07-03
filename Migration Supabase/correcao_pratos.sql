-- Correção dos 6 pratos — preços coletados via SerpAPI.
-- Rode DEPOIS da supabase_migration_13.sql, no SQL Editor.
-- Idempotente: limpa os preços desses ingredientes no último snapshot antes de inserir.

-- Matambre bovino: 0 resultados válidos
delete from precos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Matambre bovino');
delete from resultados_brutos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Matambre bovino');
-- Online traz matambre (~R$30-36/kg) mas sem peso confiável nos títulos → preço manual.
update ingredientes set preco_manual = 33 where nome = 'Matambre bovino';

-- Coxão duro bovino: 8 resultados válidos
delete from precos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Coxão duro bovino');
delete from resultados_brutos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Coxão duro bovino');
insert into precos (snapshot_id, ingrediente_id, nome_ingrediente, mediana_normalizada, mediana_exibicao, media_exibicao, minimo_exibicao, maximo_exibicao, desvio_padrao, label, qtd_resultados) values ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 0.04885, 48.85, 51.16, 26.45, 91.58, 19.92, 'kg', 8);
insert into resultados_brutos (snapshot_id, ingrediente_id, nome_ingrediente, titulo, preco_bruto, preco_normalizado, exibicao, loja, link) values
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Coxão Duro Bovino Resfriado 2Kg', 52.9, 0.02645, 'R$ 26.45/kg', 'Extra Mercado', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=productid:788619499968469844,headlineOfferDocid:788619499968469844,imageDocid:5380622496796130111,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Coxão Duro Bovino em Bifes Resfriado Bandeja 400g', 19.16, 0.0479, 'R$ 47.90/kg', 'Tenda Atacado', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=catalogid:9788869650479932225,productid:7879198233642208772,headlineOfferDocid:15595839316530137877,imageDocid:10635609480286041690,gpcid:13864408805346498929,mid:576462863899434783,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Bife De Coxão Duro A Milanesa Carrefour Aproximadamente 500 G', 45.79, 0.09158, 'R$ 91.58/kg', 'Carrefour', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=productid:15070464773366776006,headlineOfferDocid:15070464773366776006,imageDocid:9170737805032048831,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Coxão Duro Bovino Bife Resfriado Bandeja 500g', 24.9, 0.0498, 'R$ 49.80/kg', 'Confiança Supermercados', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=catalogid:3617932706108945342,productid:17046041052723888143,headlineOfferDocid:12040619715645324893,imageDocid:8945824237257919328,gpcid:691150330767555247,mid:576462861041354767,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Coxão Duro Bovino Peça 1Kg', 49.99, 0.04999, 'R$ 49.99/kg', 'Coop Supermercado', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=productid:4426528776644208106,headlineOfferDocid:4426528776644208106,imageDocid:9563177639503527183,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Bife de Coxão Duro Bovino Resfriado - Bandeja 400g', 18.36, 0.0459, 'R$ 45.90/kg', 'Tenda Atacado', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=productid:2492214329688237952,headlineOfferDocid:2492214329688237952,imageDocid:1737898978662969307,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Coxão Duro Beef Angus Bandeja 500g', 34.9, 0.0698, 'R$ 69.80/kg', 'Confiança Supermercados', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=catalogid:7979365924886849012,productid:1273032434052670205,headlineOfferDocid:17901736491436036692,imageDocid:3480500657049391949,gpcid:15111980434778087551,mid:576462859034719698,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Coxão duro bovino'), 'Coxão duro bovino', 'Coxão Duro Suíno Resfriado (Corte) Bandeja 400g', 11.16, 0.0279, 'R$ 27.90/kg', 'Extra Mercado', 'https://www.google.com/search?ibp=oshop&q=coxão duro&prds=productid:9426784817022317167,headlineOfferDocid:9426784817022317167,imageDocid:14695241876689934133,pvt:hg&hl=pt&gl=br&udm=28');

-- Filhote/Piraíba (peixe): 1 resultados válidos
delete from precos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Filhote/Piraíba (peixe)');
delete from resultados_brutos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Filhote/Piraíba (peixe)');
insert into precos (snapshot_id, ingrediente_id, nome_ingrediente, mediana_normalizada, mediana_exibicao, media_exibicao, minimo_exibicao, maximo_exibicao, desvio_padrao, label, qtd_resultados) values ((select max(id) from snapshots), (select id from ingredientes where nome = 'Filhote/Piraíba (peixe)'), 'Filhote/Piraíba (peixe)', 0.166333, 166.33, 166.33, 166.33, 166.33, 0.0, 'kg', 1);
insert into resultados_brutos (snapshot_id, ingrediente_id, nome_ingrediente, titulo, preco_bruto, preco_normalizado, exibicao, loja, link) values
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Filhote/Piraíba (peixe)'), 'Filhote/Piraíba (peixe)', 'Peixe Mar E Rio 300g Posta Filhote', 49.9, 0.166333, 'R$ 166.33/kg', 'Zaffari Online', 'https://www.google.com/search?ibp=oshop&q=piraíba peixe posta&prds=catalogid:15960873225593844830,productid:12670091723913507252,headlineOfferDocid:2669682664825419546,imageDocid:16862799562372758197,gpcid:3128955372109706979,mid:576462813938247417,pvt:hg&hl=pt&gl=br&udm=28');

-- Lambari/Traíra (peixe): 1 resultados válidos
delete from precos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Lambari/Traíra (peixe)');
delete from resultados_brutos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Lambari/Traíra (peixe)');
insert into precos (snapshot_id, ingrediente_id, nome_ingrediente, mediana_normalizada, mediana_exibicao, media_exibicao, minimo_exibicao, maximo_exibicao, desvio_padrao, label, qtd_resultados) values ((select max(id) from snapshots), (select id from ingredientes where nome = 'Lambari/Traíra (peixe)'), 'Lambari/Traíra (peixe)', 0.051225, 51.22, 51.23, 51.23, 51.23, 0.0, 'kg', 1);
insert into resultados_brutos (snapshot_id, ingrediente_id, nome_ingrediente, titulo, preco_bruto, preco_normalizado, exibicao, loja, link) values
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Lambari/Traíra (peixe)'), 'Lambari/Traíra (peixe)', 'File peixe le gour traira 400g', 20.49, 0.051225, 'R$ 51.22/kg', 'Zart Supermercados', 'https://www.google.com/search?ibp=oshop&q=traíra peixe&prds=productid:1588212026242477796,headlineOfferDocid:1588212026242477796,imageDocid:13778636308973999558,pvt:hg&hl=pt&gl=br&udm=28');

-- Piranha (peixe): 0 resultados válidos
delete from precos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Piranha (peixe)');
delete from resultados_brutos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Piranha (peixe)');
-- Piranha-peixe não é vendida online (só clipes/brinquedos) → preço manual.
-- >>> AJUSTE este R$/kg se tiver referência local do Pantanal. <<<
update ingredientes set preco_manual = 45 where nome = 'Piranha (peixe)';

-- Radite (almeirão): 12 resultados válidos
delete from precos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Radite (almeirão)');
delete from resultados_brutos where snapshot_id = (select max(id) from snapshots) and ingrediente_id = (select id from ingredientes where nome = 'Radite (almeirão)');
insert into precos (snapshot_id, ingrediente_id, nome_ingrediente, mediana_normalizada, mediana_exibicao, media_exibicao, minimo_exibicao, maximo_exibicao, desvio_padrao, label, qtd_resultados) values ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 0.015933, 15.93, 15.96, 10.97, 19.97, 2.73, 'kg', 12);
insert into resultados_brutos (snapshot_id, ingrediente_id, nome_ingrediente, titulo, preco_bruto, preco_normalizado, exibicao, loja, link) values
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Maço', 3.29, 0.010967, 'R$ 3.29/un (≈R$ 10.97/kg)', 'Supermercados Casa do Sabão', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:6452953244707462984,productid:17120819188389674315,headlineOfferDocid:13144413654925317568,imageDocid:2288147216096234590,gpcid:5664903775155852054,mid:576462874947795794,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Maço Unidade', 4.5, 0.015, 'R$ 4.50/un (≈R$ 15.00/kg)', 'Verduras Luzzi', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:14473744815629314615,productid:9401128742478849263,headlineOfferDocid:12399667207202925834,imageDocid:11071049706355796938,gpcid:2094268846345034817,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Pão de Açucar Maço', 5.69, 0.018967, 'R$ 5.69/un (≈R$ 18.97/kg)', 'Supermercado Copercana', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:665127944438961195,productid:10944096201709825767,headlineOfferDocid:2624215413269965848,imageDocid:8620077135226384329,gpcid:13843065179250680312,mid:576462477838614445,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Hidropônico Enxuto Origem Maço', 4.95, 0.0165, 'R$ 4.95/un (≈R$ 16.50/kg)', 'Enxuto', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:394617357034561900,productid:780523283137043892,headlineOfferDocid:7127032719890249664,imageDocid:17337738865147104710,gpcid:9651026816849584041,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Un', 5.0, 0.016667, 'R$ 5.00/un (≈R$ 16.67/kg)', 'Horta do Horto', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:13131778774948188397,productid:14977766159686430359,headlineOfferDocid:3689698049118668396,imageDocid:2503516174956920278,gpcid:3552606133057360418,mid:576462886412009819,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Enxuto Origem Maço', 4.45, 0.014833, 'R$ 4.45/un (≈R$ 14.83/kg)', 'Enxuto', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:12257397757801134717,productid:4770198092469952823,headlineOfferDocid:9931454155413265712,imageDocid:14783196254311183513,gpcid:6537296533456033131,mid:576462893499813260,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão', 4.98, 0.0166, 'R$ 4.98/un (≈R$ 16.60/kg)', 'TriMais', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=productid:6659756587474500966,headlineOfferDocid:6659756587474500966,imageDocid:2598186491484195555,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Pão Benverde em Maço', 4.49, 0.014967, 'R$ 4.49/un (≈R$ 14.97/kg)', 'Semar Supermercados', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:18245538828262692439,productid:3854119265465431452,headlineOfferDocid:13693831455857734382,imageDocid:14222236535062730972,gpcid:1732434230842073561,mid:576462517998725424,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Hidropônico Mais Verdes', 5.99, 0.019967, 'R$ 5.99/un (≈R$ 19.97/kg)', 'Covabra Supermercados', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:14045472147974007280,productid:14984229740895712565,headlineOfferDocid:16315568004858140193,imageDocid:12821334814779789362,gpcid:1601640416569297452,mid:576462815473991919,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Sementes Almeirão de Folha Larga Topseed', 3.5, 0.011667, 'R$ 3.50/un (≈R$ 11.67/kg)', 'Cobasi', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:11546119362386212613,productid:5356097153170183278,headlineOfferDocid:7001831634952478141,imageDocid:1144852533291341953,rds:PC_38650726838303034|PROD_PC_38650726838303034,gpcid:38650726838303034,mid:576462854169582226,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Hort Almeirao Almeida Maco', 5.99, 0.019967, 'R$ 5.99/un (≈R$ 19.97/kg)', 'Supermercado Guarani', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:4094985560524002272,productid:3304403605003168523,headlineOfferDocid:13904460374017232595,imageDocid:16125825928137160712,gpcid:158563413109716523,mid:576462887368377271,pvt:hg&hl=pt&gl=br&udm=28'),
  ((select max(id) from snapshots), (select id from ingredientes where nome = 'Radite (almeirão)'), 'Radite (almeirão)', 'Almeirão Suguimoto Maço', 4.61, 0.015367, 'R$ 4.61/un (≈R$ 15.37/kg)', 'Sonda Supermercados', 'https://www.google.com/search?ibp=oshop&q=almeirão maço&prds=catalogid:5804386035218424574,productid:5000919800121106596,headlineOfferDocid:5078274242554374435,imageDocid:2644382497020579523,gpcid:16717339115324605444,pvt:hg&hl=pt&gl=br&udm=28');

-- ── Recalcula o custo dos 6 pratos corrigidos no último snapshot ────────────
with latest as (select max(id) as sid from snapshots),
calc as (
  select r.prato_id,
    round(coalesce(sum(
      case
        when i.custo_fixo is not null then i.custo_fixo
        when i.preco_manual is not null then i.preco_manual / 1000.0 * r.qtd_g
        when p.mediana_normalizada is not null then p.mediana_normalizada * r.qtd_g
        else 0
      end
    ), 0)::numeric, 2) as custo,
    count(*) as total,
    count(*) filter (
      where i.custo_fixo is not null or i.preco_manual is not null or p.mediana_normalizada is not null
    ) as cobertos
  from receitas r
  join ingredientes i on i.id = r.ingrediente_id
  left join precos p on p.ingrediente_id = r.ingrediente_id and p.snapshot_id = (select sid from latest)
  where r.prato_id in (12, 13, 59, 64, 85, 89)
  group by r.prato_id
)
update custos_pratos cp
set custo_total            = calc.custo,
    ingredientes_cobertos  = calc.cobertos,
    ingredientes_estimados = 0,
    ingredientes_total     = calc.total
from calc, latest
where cp.prato_id = calc.prato_id and cp.snapshot_id = latest.sid;

-- ── Recalcula o índice nacional (mediana dos custos dos pratos) ─────────────
update snapshots set custo_total_pf = (
  select round(percentile_cont(0.5) within group (order by custo_total)::numeric, 2)
  from custos_pratos where snapshot_id = (select max(id) from snapshots)
)
where id = (select max(id) from snapshots);

