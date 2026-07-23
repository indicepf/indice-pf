// Mapeamento ingrediente do índice-pf → item do IPCA (SIDRA tabela 7060).
//
// Feito à mão, item a item: casar por semelhança de nome erra feio (o item
// "Peito" do IPCA é peito BOVINO, não peito de frango; "coxão mole" só aparece
// no IPCA com o nome "chã de dentro"). Cada linha traz o nível de confiança:
//
//   alta  — mesmo produto (Alcatra→Alcatra, Pintado→Peixe - pintado)
//   media — produto próximo ou agregado do mesmo tipo (Queijo coalho→Queijo,
//           Linguiça toscana→Linguiça, Peito de frango→Frango em pedaços)
//   baixa — sem item correspondente; cai no grupo (Rabada→Carnes, Sururu→Pescados)
//
// Use `confianca` para filtrar: uma retropolação só com 'alta' é mais defensável;
// incluir 'baixa' aumenta a cobertura e a incerteza. Ingredientes sem item
// possível ficam de fora (ver NAO_MAPEADOS).

export type Confianca = 'alta' | 'media' | 'baixa'

export type MapaItem = {
  id: number          // ingredientes.id
  nome: string        // nome no índice-pf (para leitura/auditoria)
  serie: string       // chave em fatores_preditores (ipca_<código SIDRA>)
  confianca: Confianca
  nota?: string       // por que não é óbvio
}

export const MAPA_INGREDIENTE_IPCA: readonly MapaItem[] = [
  // ── bovinos ──────────────────────────────────────────────────────────────
  { id: 1391, nome: 'Carne de sol', serie: 'ipca_12379', confianca: 'alta' },
  { id: 1394, nome: 'Carne seca/Charque', serie: 'ipca_12379', confianca: 'alta' },
  { id: 27, nome: 'Carne seca/charque/sol', serie: 'ipca_12379', confianca: 'alta' },
  { id: 3, nome: 'Alcatra bovina', serie: 'ipca_7294', confianca: 'alta' },
  { id: 846, nome: 'Coxão mole bovino', serie: 'ipca_7293', confianca: 'alta', nota: 'coxão mole = chã de dentro' },
  { id: 35, nome: 'Costela bovina', serie: 'ipca_7302', confianca: 'alta' },
  { id: 888, nome: 'Patinho bovino', serie: 'ipca_7295', confianca: 'alta' },
  { id: 842, nome: 'Contrafilé bovino', serie: 'ipca_7291', confianca: 'alta' },
  { id: 1459, nome: 'Peito bovino', serie: 'ipca_7301', confianca: 'alta', nota: 'o item "Peito" do IPCA é bovino' },
  { id: 48, nome: 'Fígado bovino', serie: 'ipca_7285', confianca: 'alta' },
  { id: 2, nome: 'Acém bovino', serie: 'ipca_7300', confianca: 'alta' },
  { id: 1367, nome: 'Acém/Músculo bovino', serie: 'ipca_7300', confianca: 'alta' },
  { id: 854, nome: 'Filé mignon', serie: 'ipca_7292', confianca: 'alta' },
  { id: 838, nome: 'Chuleta bovina', serie: 'ipca_7291', confianca: 'media', nota: 'chuleta = contrafilé com osso' },
  { id: 830, nome: 'Carne moída bovina', serie: 'ipca_7300', confianca: 'media', nota: 'moída costuma ser acém/patinho' },
  { id: 91, nome: 'Rabada bovina', serie: 'ipca_7283', confianca: 'baixa', nota: 'sem item próprio; grupo Carnes' },
  { id: 19, nome: 'Bucho/Dobradinha bovina', serie: 'ipca_7283', confianca: 'baixa' },
  { id: 71, nome: 'Mocotó (pata bovina)', serie: 'ipca_7283', confianca: 'baixa' },
  { id: 1138, nome: 'Matambre bovino', serie: 'ipca_7283', confianca: 'baixa' },
  { id: 1139, nome: 'Coxão duro bovino', serie: 'ipca_7283', confianca: 'baixa', nota: 'chã de fora não tem item' },

  // ── ovinos/caprinos ──────────────────────────────────────────────────────
  { id: 26, nome: 'Carne ovina (costela)', serie: 'ipca_7288', confianca: 'alta', nota: 'IPCA agrega em "carne de carneiro"' },
  { id: 24, nome: 'Carne de bode', serie: 'ipca_7288', confianca: 'media', nota: 'caprino sob "carne de carneiro"' },

  // ── aves e ovos ──────────────────────────────────────────────────────────
  { id: 45, nome: 'Frango em pedaços (coxa/sobrecoxa)', serie: 'ipca_107618', confianca: 'alta' },
  { id: 46, nome: 'Frango inteiro', serie: 'ipca_107617', confianca: 'alta' },
  { id: 77, nome: 'Peito de frango', serie: 'ipca_107618', confianca: 'media', nota: 'NÃO usar o item "Peito" (é bovino)' },
  { id: 75, nome: 'Ovo', serie: 'ipca_7355', confianca: 'alta' },

  // ── pescados ─────────────────────────────────────────────────────────────
  { id: 82, nome: 'Pintado (peixe)', serie: 'ipca_31694', confianca: 'alta' },
  { id: 79, nome: 'Pescada (peixe)', serie: 'ipca_7320', confianca: 'alta' },
  { id: 910, nome: 'Tambaqui (peixe)', serie: 'ipca_41129', confianca: 'alta' },
  { id: 833, nome: 'Cavala (peixe)', serie: 'ipca_7313', confianca: 'alta' },
  { id: 68, nome: 'Merluza (filé)', serie: 'ipca_107616', confianca: 'alta' },
  { id: 909, nome: 'Tainha (peixe)', serie: 'ipca_7309', confianca: 'alta' },
  { id: 1140, nome: 'Filhote/Piraíba (peixe)', serie: 'ipca_47623', confianca: 'alta' },
  { id: 22, nome: 'Camarão fresco', serie: 'ipca_7311', confianca: 'alta' },
  { id: 23, nome: 'Camarão seco', serie: 'ipca_7311', confianca: 'media', nota: 'IPCA cobre camarão fresco' },
  { id: 25, nome: 'Carne de siri', serie: 'ipca_7323', confianca: 'media', nota: 'item do IPCA é caranguejo' },
  { id: 886, nome: 'Pacu (peixe)', serie: 'ipca_7303', confianca: 'baixa', nota: 'sem item; grupo Pescados' },
  { id: 94, nome: 'Sururu', serie: 'ipca_7303', confianca: 'baixa' },
  { id: 1141, nome: 'Lambari/Traíra (peixe)', serie: 'ipca_7303', confianca: 'baixa' },
  { id: 1142, nome: 'Piranha (peixe)', serie: 'ipca_7303', confianca: 'baixa' },
  { id: 83, nome: 'Pirarucu seco', serie: 'ipca_7335', confianca: 'baixa', nota: 'peixe salgado; grupo industrializados' },

  // ── suínos ───────────────────────────────────────────────────────────────
  { id: 1377, nome: 'Bacon', serie: 'ipca_7347', confianca: 'alta' },
  { id: 12, nome: 'Bacon/Panceta', serie: 'ipca_7347', confianca: 'alta' },
  { id: 96, nome: 'Torresmo', serie: 'ipca_7347', confianca: 'media' },
  { id: 1457, nome: 'Panceta/Barriga suína', serie: 'ipca_7287', confianca: 'media' },
  { id: 18, nome: 'Bisteca suína', serie: 'ipca_7287', confianca: 'media' },
  { id: 1438, nome: 'Lombo suíno', serie: 'ipca_7287', confianca: 'media' },
  { id: 1462, nome: 'Pernil suíno', serie: 'ipca_7287', confianca: 'media' },
  { id: 60, nome: 'Lombo/Pernil suíno', serie: 'ipca_7287', confianca: 'media' },
  { id: 36, nome: 'Costela suína', serie: 'ipca_7287', confianca: 'media' },
  { id: 70, nome: 'Miúdos suínos', serie: 'ipca_7287', confianca: 'baixa' },
  { id: 1437, nome: 'Linguiça toscana (suína)', serie: 'ipca_7339', confianca: 'media' },
  { id: 1436, nome: 'Linguiça defumada', serie: 'ipca_7339', confianca: 'media' },
  { id: 1435, nome: 'Linguiça calabresa', serie: 'ipca_7339', confianca: 'media' },
  { id: 59, nome: 'Linguiça calabresa/defumada', serie: 'ipca_7339', confianca: 'media' },
  { id: 84, nome: 'Presunto', serie: 'ipca_7336', confianca: 'alta' },

  // ── laticínios ───────────────────────────────────────────────────────────
  { id: 67, nome: 'Manteiga', serie: 'ipca_7367', confianca: 'alta' },
  { id: 56, nome: 'Leite', serie: 'ipca_12393', confianca: 'alta' },
  { id: 87, nome: 'Queijo coalho', serie: 'ipca_107619', confianca: 'media', nota: 'IPCA tem "Queijo" genérico' },
  { id: 89, nome: 'Queijo parmesão', serie: 'ipca_107619', confianca: 'media' },
  { id: 1475, nome: 'Queijo prato', serie: 'ipca_107619', confianca: 'media' },
  { id: 1473, nome: 'Queijo mussarela', serie: 'ipca_107619', confianca: 'media' },
  { id: 88, nome: 'Queijo mussarela/prato', serie: 'ipca_107619', confianca: 'media' },
  { id: 57, nome: 'Leite de coco', serie: 'ipca_7416', confianca: 'alta' },
  { id: 38, nome: 'Creme de leite', serie: 'ipca_7356', confianca: 'baixa' },

  // ── grãos, farinhas, panificados ─────────────────────────────────────────
  { id: 7, nome: 'Arroz branco', serie: 'ipca_7173', confianca: 'alta' },
  { id: 42, nome: 'Feijão carioca', serie: 'ipca_12222', confianca: 'alta' },
  { id: 43, nome: 'Feijão de corda', serie: 'ipca_47617', confianca: 'alta', nota: 'feijão de corda = macáçar/fradinho' },
  { id: 44, nome: 'Feijão preto', serie: 'ipca_7176', confianca: 'alta' },
  { id: 1415, nome: 'Feijão branco', serie: 'ipca_7172', confianca: 'baixa' },
  { id: 50, nome: 'Grão-de-bico', serie: 'ipca_7172', confianca: 'baixa' },
  { id: 6, nome: 'Amendoim', serie: 'ipca_7172', confianca: 'baixa' },
  { id: 39, nome: 'Farinha de mandioca', serie: 'ipca_7195', confianca: 'alta' },
  { id: 41, nome: 'Farinha de trigo', serie: 'ipca_7191', confianca: 'alta' },
  { id: 1420, nome: 'Flocão de milho (cuscuz)', serie: 'ipca_7190', confianca: 'alta' },
  { id: 1423, nome: 'Fubá de milho', serie: 'ipca_7188', confianca: 'alta' },
  { id: 47, nome: 'Fubá/Flocão de milho', serie: 'ipca_7188', confianca: 'media' },
  { id: 62, nome: 'Macarrão', serie: 'ipca_7187', confianca: 'alta' },
  { id: 40, nome: 'Farinha de rosca', serie: 'ipca_7184', confianca: 'baixa' },
  { id: 49, nome: 'Goma de tapioca', serie: 'ipca_7184', confianca: 'baixa' },
  { id: 86, nome: 'Pão francês', serie: 'ipca_7375', confianca: 'alta' },
  { id: 85, nome: 'Pão de alho (bisnaga)', serie: 'ipca_7372', confianca: 'baixa' },

  // ── legumes, tubérculos, hortaliças ──────────────────────────────────────
  { id: 28, nome: 'Cebola', serie: 'ipca_7215', confianca: 'alta' },
  { id: 5, nome: 'Alho', serie: 'ipca_7418', confianca: 'alta' },
  { id: 16, nome: 'Batata inglesa', serie: 'ipca_7202', confianca: 'alta' },
  { id: 15, nome: 'Batata doce', serie: 'ipca_7201', confianca: 'alta' },
  { id: 64, nome: 'Mandioca', serie: 'ipca_7204', confianca: 'alta' },
  { id: 95, nome: 'Tomate', serie: 'ipca_7212', confianca: 'alta' },
  { id: 29, nome: 'Cenoura', serie: 'ipca_7216', confianca: 'alta' },
  { id: 81, nome: 'Pimentão', serie: 'ipca_7210', confianca: 'alta' },
  { id: 37, nome: 'Couve', serie: 'ipca_7245', confianca: 'alta' },
  { id: 4, nome: 'Alface', serie: 'ipca_7242', confianca: 'alta' },
  { id: 92, nome: 'Repolho', serie: 'ipca_7248', confianca: 'alta' },
  { id: 76, nome: 'Palmito', serie: 'ipca_7406', confianca: 'alta' },
  { id: 17, nome: 'Batata palha', serie: 'ipca_7200', confianca: 'baixa', nota: 'industrializado; sem item' },
  { id: 1, nome: 'Abóbora', serie: 'ipca_7200', confianca: 'baixa' },
  { id: 69, nome: 'Milho verde', serie: 'ipca_7200', confianca: 'baixa' },
  { id: 90, nome: 'Quiabo', serie: 'ipca_7241', confianca: 'baixa' },
  { id: 53, nome: 'Jambu', serie: 'ipca_7241', confianca: 'baixa', nota: 'regional; sem item' },
  { id: 51, nome: 'Guariroba', serie: 'ipca_7241', confianca: 'baixa', nota: 'regional; sem item' },
  { id: 1410, nome: 'Escarola/Chicória', serie: 'ipca_7241', confianca: 'baixa' },
  { id: 65, nome: 'Maniva (folha de mandioca)', serie: 'ipca_7241', confianca: 'baixa' },
  { id: 1479, nome: 'Rúcula', serie: 'ipca_7241', confianca: 'baixa' },
  { id: 1143, nome: 'Radite (almeirão)', serie: 'ipca_7241', confianca: 'baixa' },
  { id: 30, nome: 'Champignon (conserva)', serie: 'ipca_7401', confianca: 'media' },

  // ── frutas ───────────────────────────────────────────────────────────────
  { id: 13, nome: 'Banana da terra', serie: 'ipca_7255', confianca: 'alta' },
  { id: 58, nome: 'Limão', serie: 'ipca_7265', confianca: 'alta' },
  { id: 55, nome: 'Laranja', serie: 'ipca_7279', confianca: 'media', nota: 'IPCA separa por variedade; usa pera' },
  { id: 11, nome: 'Açaí (polpa)', serie: 'ipca_12396', confianca: 'alta' },
  { id: 78, nome: 'Pequi', serie: 'ipca_7254', confianca: 'baixa', nota: 'regional; grupo Frutas' },

  // ── óleos e gorduras ─────────────────────────────────────────────────────
  { id: 99, nome: 'Óleo de soja', serie: 'ipca_7385', confianca: 'alta' },
  { id: 9, nome: 'Azeite de oliva', serie: 'ipca_7386', confianca: 'alta' },
  { id: 8, nome: 'Azeite de dendê', serie: 'ipca_7384', confianca: 'baixa' },
  { id: 14, nome: 'Banha suína', serie: 'ipca_7384', confianca: 'baixa' },

  // ── temperos, molhos, condimentos ────────────────────────────────────────
  { id: 97, nome: 'Tucupi', serie: 'ipca_7421', confianca: 'alta', nota: 'IPCA tem "Caldo de tucupi"' },
  { id: 31, nome: 'Cheiro-verde', serie: 'ipca_7249', confianca: 'alta' },
  { id: 32, nome: 'Coentro', serie: 'ipca_7244', confianca: 'alta' },
  { id: 93, nome: 'Sal', serie: 'ipca_12397', confianca: 'alta' },
  { id: 33, nome: 'Colorau/Urucum', serie: 'ipca_7420', confianca: 'alta' },
  { id: 98, nome: 'Vinagre', serie: 'ipca_7424', confianca: 'alta' },
  { id: 63, nome: 'Maionese', serie: 'ipca_7423', confianca: 'alta' },
  { id: 21, nome: 'Caldo de carne (tablete)', serie: 'ipca_7425', confianca: 'alta' },
  { id: 1451, nome: 'Molho de tomate (sachê)', serie: 'ipca_109463', confianca: 'alta', nota: '"Atomatado" cobre molho/extrato' },
  { id: 1411, nome: 'Extrato de tomate', serie: 'ipca_109463', confianca: 'alta' },
  { id: 72, nome: 'Molho/extrato de tomate', serie: 'ipca_109463', confianca: 'alta' },
  { id: 54, nome: 'Ketchup', serie: 'ipca_109463', confianca: 'media' },
  { id: 34, nome: 'Cominho', serie: 'ipca_7428', confianca: 'media' },
  { id: 10, nome: 'Açafrão da terra', serie: 'ipca_7428', confianca: 'baixa' },
  { id: 74, nome: 'Orégano', serie: 'ipca_7428', confianca: 'baixa' },
  { id: 1464, nome: 'Pimenta (fresca)', serie: 'ipca_7428', confianca: 'baixa' },
  { id: 1465, nome: 'Pimenta do reino', serie: 'ipca_7428', confianca: 'baixa' },
  { id: 80, nome: 'Pimenta', serie: 'ipca_7428', confianca: 'baixa' },
  { id: 61, nome: 'Louro (folha)', serie: 'ipca_7428', confianca: 'baixa' },
  { id: 52, nome: 'Hortelã', serie: 'ipca_7241', confianca: 'baixa' },
  { id: 66, nome: 'Manjericão', serie: 'ipca_7241', confianca: 'baixa' },
  { id: 73, nome: 'Mostarda', serie: 'ipca_7415', confianca: 'baixa' },

  // ── outros ───────────────────────────────────────────────────────────────
  { id: 20, nome: 'Cachaça', serie: 'ipca_7397', confianca: 'media' },
] as const

// Sem item possível no IPCA — ficam fora da retropolação por ingrediente.
export const NAO_MAPEADOS: readonly { id: number; nome: string; motivo: string }[] = [
  { id: 292, nome: 'Sangue de aves', motivo: 'não existe item equivalente no IPCA' },
  { id: 293, nome: 'Sangue suíno', motivo: 'não existe item equivalente no IPCA' },
] as const

// Itens do índice-pf que também existem na cesta DIEESE (preço R$ medido).
// Serve para a comparação de confiabilidade: nosso preço × preço do DIEESE.
//
// `comparabilidade` diz o quanto a comparação é justa:
//   direta     — mesmo produto e mesma unidade; divergência aponta para a coleta
//   aproximada — produto ou ponto de venda diferem; divergência é esperada
//
// Não entram aqui (verificado em 23/07/2026, jun/2026):
//   Banana da terra × dieese_banana — produtos diferentes (banana-da-terra é
//     mais cara que a banana comum da cesta) e a metodologia do DIEESE mede
//     banana em dúzias em parte das capitais. Razão observada 1,45.
//   Café e Açúcar — o índice-pf não tem esses ingredientes.
export type Comparabilidade = 'direta' | 'aproximada'

export const MAPA_INGREDIENTE_DIEESE: readonly {
  id: number; nome: string; serie: string; comparabilidade: Comparabilidade; nota?: string
}[] = [
  { id: 7, nome: 'Arroz branco', serie: 'dieese_arroz', comparabilidade: 'direta' },
  { id: 42, nome: 'Feijão carioca', serie: 'dieese_feijao', comparabilidade: 'direta', nota: 'DIEESE usa o tipo mais consumido em cada capital' },
  { id: 95, nome: 'Tomate', serie: 'dieese_tomate', comparabilidade: 'direta' },
  { id: 16, nome: 'Batata inglesa', serie: 'dieese_batata', comparabilidade: 'direta' },
  { id: 99, nome: 'Óleo de soja', serie: 'dieese_oleo', comparabilidade: 'direta' },
  { id: 39, nome: 'Farinha de mandioca', serie: 'dieese_farinha', comparabilidade: 'aproximada', nota: 'DIEESE alterna farinha de trigo/mandioca conforme a região' },
  { id: 56, nome: 'Leite', serie: 'dieese_leite', comparabilidade: 'direta' },
  { id: 67, nome: 'Manteiga', serie: 'dieese_manteiga', comparabilidade: 'aproximada', nota: 'conferir unidade: a cesta especifica 750 g' },
  { id: 86, nome: 'Pão francês', serie: 'dieese_pao', comparabilidade: 'aproximada', nota: 'DIEESE pesquisa padaria; nossa coleta é majoritariamente online' },
  { id: 3, nome: 'Alcatra bovina', serie: 'dieese_carne', comparabilidade: 'aproximada', nota: 'o corte da cesta varia por capital (carne de primeira)' },
  { id: 846, nome: 'Coxão mole bovino', serie: 'dieese_carne', comparabilidade: 'aproximada', nota: 'idem: corte varia por capital' },
] as const

export const IPCA_POR_INGREDIENTE: Record<number, MapaItem> =
  Object.fromEntries(MAPA_INGREDIENTE_IPCA.map(m => [m.id, m]))
