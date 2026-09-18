-- ============================================================================
-- Migração 58 — fonte fixa: releitura automática do link para o item que a
-- busca nunca acha
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- PROBLEMA. Alguns ingredientes do catálogo simplesmente não existem no Google
-- Shopping em volume utilizável. Carne de bode trouxe UMA oferta na coleta 45
-- (um kit de linguiças) e nenhuma em 43 e 44; Jambu trouxe três, sendo duas
-- presunto francês e folhado de queijo. Não é defeito de filtro nem de busca: o
-- nicho não está anunciado. O responsável resolve isso há meses do mesmo jeito,
-- abrindo sempre a mesma loja e digitando o preço na mão em /admin.
--
-- O QUE MUDA. Esses ingredientes passam a ter uma fonte fixa: a URL da loja e a
-- quantidade da embalagem anunciada nela. Quando a coleta da semana fecha o
-- ingrediente sem nenhuma oferta, `pipeline/fonte_fixa.py` abre a página, lê o
-- preço e grava uma LEITURA MANUAL (precos_manuais_hist, origem 'link') — o
-- mesmo caminho da leitura digitada à mão, com o mesmo blend manual×online e a
-- mesma janela de ±10 dias. Nada entra como se fosse oferta de mercado.
--
-- Por que não reusar `preco_manual_link`: aquele campo é o link da última
-- leitura digitada, preenchido em 73 ingredientes, muitos deles com URL de
-- promoção ou redirecionamento de anúncio (google.com/aclk...). Fonte que o
-- robô vai reler toda semana é uma decisão explícita, não um efeito colateral
-- de ter colado um link uma vez.
-- ============================================================================

alter table ingredientes add column if not exists fonte_fixa_url text;
-- quantidade da embalagem ANUNCIADA NA PÁGINA, em g (ou ml), usada para
-- converter o preço lido em R$/kg (ou R$/L), que é a unidade de
-- ingredientes.preco_manual. Página que cota o quilo = 1000, o padrão.
alter table ingredientes add column if not exists fonte_fixa_qtd_g numeric default 1000;

comment on column ingredientes.fonte_fixa_url is
  'Loja relida automaticamente quando a coleta da semana não acha o ingrediente. Vira leitura manual (origem ''link''), nunca oferta online.';
comment on column ingredientes.fonte_fixa_qtd_g is
  'Quantidade da embalagem anunciada na fonte fixa, em g/ml. 1000 = a página cota o quilo/litro.';
