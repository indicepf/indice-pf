# -*- coding: utf-8 -*-
"""
PROPOSTA de tripé de scraping para os 99 ingredientes-base canônicos.

Para cada base:
  busca   → query enviada ao Google Shopping (SerpAPI)
  unidade → 'g' | 'ml' | 'unidade'  (define a normalização do preço)
  ok      → palavras_ok  (pelo menos 1 deve estar no título)
  nao     → palavras_nao (nenhuma pode estar no título)

Reaproveita o estilo das 27 entradas originais de scraper_pf.py.
TODOS os campos são proposta inicial e devem ser revisados/ajustados.
A quantidade por porção NÃO entra aqui — vem da aba "Receitas Finais"
(modelo de custo por prato).
"""

TRIPE = {
    # ── Proteína bovina ──────────────────────────────────────────────────────
    "Acém bovino": {
        "busca": "acém bovino kg", "unidade": "g",
        "ok": ["acém", "acem", "músculo", "musculo", "paleta"],
        "nao": ["temperado", "moída", "moida", "hambúrguer", "almôndega", "caldo", "tablete"]},
    "Alcatra bovina": {
        "busca": "alcatra bovina kg", "unidade": "g",
        "ok": ["alcatra"],
        "nao": ["temperada", "hambúrguer", "caldo", "tablete", "suína"]},
    "Contrafilé bovino": {
        "busca": "contra file bovino", "unidade": "g",
        "ok": ["contrafil", "contra fil"],
        "nao": ["suíno", "temperado", "caldo"]},
    "Chuleta bovina": {
        "busca": "chuleta", "unidade": "g",
        "ok": ["chuleta"],
        "nao": ["suína", "suino", "porco", "lombo", "temperada"]},
    "Coxão mole bovino": {
        "busca": "coxão mole", "unidade": "g",
        "ok": ["coxão mole", "coxao mole"],
        "nao": ["duro", "temperado", "moído"]},
    "Patinho bovino": {
        "busca": "patinho", "unidade": "g",
        "ok": ["patinho"],
        "nao": ["temperado", "moído", "moida", "frango", "suíno"]},
    "Filé mignon": {
        "busca": "filé mignon bovino kg", "unidade": "g",
        "ok": ["mignon"],
        "nao": ["suíno", "porco", "frango", "temperado"]},
    "Carne moída bovina": {
        "busca": "carne moída", "unidade": "g",
        "ok": ["moída", "moida"],
        "nao": ["temperada", "frango", "suína", "suino", "linguiça", "hambúrguer", "peru"]},
    "Bucho/Dobradinha bovina": {
        "busca": "dobradinha bovina", "unidade": "g",
        "ok": ["dobradinha", "bucho", "mondongo"],
        "nao": ["temperado", "caldo", "pronto"]},
    "Carne de bode": {
        "busca": "carne de bode", "unidade": "g", "preco_manual": 40.0,
        "ok": ["bode", "caprino", "cabrito"],
        "nao": ["temperada", "caldo"]},
    "Carne ovina (costela)": {
        "busca": "costela de cordeiro ovino kg", "unidade": "g",
        "ok": ["ovina", "ovino", "cordeiro", "carneiro"],
        "nao": ["temperada", "caldo"]},
    "Carne seca/charque/sol": {
        "busca": "carne seca charque kg", "unidade": "g",
        "ok": ["carne seca", "charque", "carne de sol", "jerked"],
        "nao": ["caldo", "tablete", "temperado pronto"]},
    "Costela bovina": {
        "busca": "costela bovina kg", "unidade": "g",
        "ok": ["costela"],
        "nao": ["suína", "suino", "porco", "temperada", "caldo"]},
    "Fígado bovino": {
        "busca": "fígado bovino kg", "unidade": "g",
        "ok": ["fígado", "figado"],
        "nao": ["frango", "galinha", "temperado", "caldo", "bacalhau"]},
    "Mocotó (pata bovina)": {
        "busca": "mocotó bovino kg", "unidade": "g",
        "ok": ["mocotó", "mocoto", "pata bovina"],
        "nao": ["caldo", "tablete", "pronto", "lata"]},
    "Rabada bovina": {
        "busca": "rabada bovina kg", "unidade": "g",
        "ok": ["rabada", "rabo bovino"],
        "nao": ["caldo", "temperada"]},

    # ── Proteína suína ───────────────────────────────────────────────────────
    "Bacon/Panceta": {
        "busca": "bacon kg", "unidade": "g",
        "ok": ["bacon", "panceta", "barriga suína", "toucinho"],
        "nao": ["sabor", "temperado", "tablete"]},
    "Bisteca suína": {
        "busca": "bisteca suína kg", "unidade": "g",
        "ok": ["bisteca", "suína", "suino", "porco"],
        "nao": ["temperada", "defumada", "bovina"]},
    "Costela suína": {
        "busca": "costela suína kg", "unidade": "g",
        "ok": ["costela suína", "costela suina", "costela de porco"],
        "nao": ["bovina", "boi", "temperada", "defumada"]},
    "Linguiça calabresa/defumada": {
        "busca": "linguiça calabresa kg", "unidade": "g",
        "ok": ["linguiça", "linguica", "calabresa"],
        "nao": ["frango", "salsicha"]},
    "Lombo/Pernil suíno": {
        "busca": "lombo suíno kg", "unidade": "g",
        "ok": ["lombo", "pernil", "suína", "suino", "porco"],
        "nao": ["bovino", "temperado", "defumado", "linguiça"]},
    "Miúdos suínos": {
        "busca": "miúdos suínos kg", "unidade": "g",
        "ok": ["miúdos", "miudos", "suíno", "suino", "porco"],
        "nao": ["frango", "bovino", "caldo"]},
    "Presunto": {
        "busca": "presunto kg", "unidade": "g",
        "ok": ["presunto"],
        "nao": ["peru", "tender", "blanquet"]},
    "Torresmo": {
        "busca": "torresmo kg", "unidade": "g",
        "ok": ["torresmo", "pururuca"],
        "nao": ["sabor", "snack"]},

    # ── Proteína aves ────────────────────────────────────────────────────────
    "Frango em pedaços (coxa/sobrecoxa)": {
        "busca": "coxa sobrecoxa frango kg", "unidade": "g",
        "ok": ["frango", "coxa", "sobrecoxa"],
        "nao": ["temperado", "empanado", "nuggets", "processado", "defumado"]},
    "Frango inteiro": {
        "busca": "frango inteiro kg", "unidade": "g",
        "ok": ["inteiro", "galeto"],
        "nao": ["temperado", "recheado", "peito", "empanado", "nuggets"]},
    "Peito de frango": {
        "busca": "peito de frango kg", "unidade": "g",
        "ok": ["peito"],
        "nao": ["temperado", "empanado", "recheado", "bovino", "suíno"]},

    # ── Proteína pescado ─────────────────────────────────────────────────────
    "Camarão fresco": {
        "busca": "camarão cinza fresco kg", "unidade": "g",
        "ok": ["camarão", "camarao"],
        "nao": ["seco", "empanado", "temperado", "tempurá"]},
    "Camarão seco": {
        "busca": "camarão seco kg", "unidade": "g",
        "ok": ["camarão", "camarao"],
        "nao": ["empanado", "tempurá", "fresco", "congelado"]},
    "Carne de siri": {
        "busca": "carne de siri kg", "unidade": "g",
        "ok": ["siri", "caranguejo"],
        "nao": ["casquinha pronta", "temperado"]},
    "Merluza (filé)": {
        "busca": "filé de merluza kg", "unidade": "g",
        "ok": ["merluza"],
        "nao": ["empanado", "temperado", "palito"]},
    "Pescada (peixe)": {
        "busca": "pescada peixe posta kg", "unidade": "g",
        "ok": ["pescada"],
        "nao": ["empanado", "lata", "patê"]},
    "Pintado (peixe)": {
        "busca": "pintado peixe posta kg", "unidade": "g",
        "ok": ["pintado", "cachara", "surubim"],
        "nao": ["empanado", "lata"]},
    "Tambaqui (peixe)": {
        "busca": "tambaqui posta kg", "unidade": "g",
        "ok": ["tambaqui"],
        "nao": ["ração", "racao", "isca", "empanado"]},
    "Pacu (peixe)": {
        "busca": "pacu peixe kg", "unidade": "g",
        "ok": ["pacu"],
        "nao": ["ração", "racao", "isca", "empanado"]},
    "Tainha (peixe)": {
        "busca": "tainha peixe kg", "unidade": "g",
        "ok": ["tainha"],
        "nao": ["ração", "racao", "isca", "empanado"]},
    "Cavala (peixe)": {
        "busca": "cavala peixe kg", "unidade": "g",
        "ok": ["cavala"],
        "nao": ["lata", "conserva", "ração", "racao", "isca"]},
    "Pirarucu seco": {
        "busca": "pirarucu seco salgado kg", "unidade": "g",
        "ok": ["pirarucu"],
        "nao": ["fresco", "óleo"]},
    "Sururu": {
        "busca": "sururu", "unidade": "g",
        "ok": ["sururu", "mexilhão", "mexilhao", "marisco"],
        "nao": ["temperado", "lata pronta"]},

    # ── Ovos ─────────────────────────────────────────────────────────────────
    "Ovo": {
        "busca": "ovos bandeja 30 unidades", "unidade": "unidade", "peso_ref_g": 55,
        "ok": ["ovo", "ovos"],
        "nao": ["codorna", "chocolate", "páscoa", "desidratado", "porta",
                "organizador", "kit", "cartela plástica", "suporte"]},

    # ── Gordura/Óleo ─────────────────────────────────────────────────────────
    "Óleo de soja": {
        "busca": "óleo de soja 900ml", "unidade": "ml",
        "ok": ["óleo", "oleo"],
        "nao": ["girassol", "canola", "milho", "coco", "azeite", "palma", "composto"]},
    "Azeite de oliva": {
        "busca": "azeite de oliva extra virgem 500ml", "unidade": "ml",
        "ok": ["azeite"],
        "nao": ["composto", "temperado", "aromatizado", "dendê", "soja"]},
    "Azeite de dendê": {
        "busca": "azeite de dendê 500ml", "unidade": "ml",
        "ok": ["dendê", "dende", "palma"],
        "nao": ["oliva", "soja"]},
    "Banha suína": {
        "busca": "banha suína 500g", "unidade": "g",
        "ok": ["banha"],
        "nao": ["vegetal", "creme"]},

    # ── Grão/Cereal ──────────────────────────────────────────────────────────
    "Arroz branco": {
        "busca": "arroz branco tipo 1", "unidade": "g",
        "ok": ["arroz"],
        "nao": ["integral", "parboilizado", "temperado", "japonês", "arbóreo"]},
    "Macarrão": {
        "busca": "macarrão espaguete 500g", "unidade": "g",
        "ok": ["macarrão", "espaguete", "spaghetti", "penne", "massa"],
        "nao": ["integral", "instantâneo", "miojo"]},
    "Fubá/Flocão de milho": {
        "busca": "fubá de milho 1kg", "unidade": "g",
        "ok": ["fubá", "fuba", "flocão", "flocao", "milho", "cuscuz"],
        "nao": ["pipoca", "amido"]},
    "Farinha de trigo": {
        "busca": "farinha de trigo 1kg", "unidade": "g",
        "ok": ["trigo"],
        "nao": ["mandioca", "rosca", "milho"]},
    "Farinha de rosca": {
        "busca": "farinha de rosca 500g", "unidade": "g",
        "ok": ["rosca", "panko"],
        "nao": ["mandioca", "trigo integral"]},
    "Farinha de mandioca": {
        "busca": "farinha de mandioca torrada kg", "unidade": "g",
        "ok": ["farinha", "mandioca"],
        "nao": ["trigo", "milho", "tapioca", "polvilho", "rosca"]},
    "Goma de tapioca": {
        "busca": "goma de tapioca hidratada kg", "unidade": "g",
        "ok": ["goma", "tapioca", "polvilho"],
        "nao": ["farinha de trigo", "rosca"]},
    "Pão francês": {
        "busca": "pão francês kg", "unidade": "g",
        "ok": ["pão", "pao"],
        "nao": ["forma", "bisnaga", "doce", "hambúrguer", "hot dog", "integral"]},
    "Pão de alho (bisnaga)": {
        "busca": "pão de alho bisnaga 300g", "unidade": "g",
        "ok": ["pão de alho", "pao de alho"],
        "nao": ["torrada"]},

    # ── Laticínio ────────────────────────────────────────────────────────────
    "Creme de leite": {
        "busca": "creme de leite 200g", "unidade": "g",
        "ok": ["creme de leite"],
        "nao": ["leite condensado", "azedo"]},
    "Leite": {
        "busca": "leite integral 1 litro", "unidade": "ml",
        "ok": ["leite"],
        "nao": ["condensado", "em pó", "coco", "creme"]},
    "Leite de coco": {
        "busca": "leite de coco 200ml", "unidade": "ml",
        "ok": ["coco"],
        "nao": ["óleo", "ralado", "água de coco"]},
    "Manteiga": {
        "busca": "manteiga com sal 200g", "unidade": "g",
        "ok": ["manteiga"],
        "nao": ["margarina", "amendoim", "cacau"]},
    "Queijo coalho": {
        "busca": "queijo coalho 500g", "unidade": "g",
        "ok": ["coalho"],
        "nao": ["ralado", "parmesão"]},
    "Queijo mussarela/prato": {
        "busca": "queijo mussarela kg", "unidade": "g",
        "ok": ["mussarela", "muçarela", "prato"],
        "nao": ["ralado", "parmesão", "coalho", "requeijão"]},
    "Queijo parmesão": {
        "busca": "queijo parmesão ralado 100g", "unidade": "g",
        "ok": ["parmesão", "parmesao", "grana"],
        "nao": ["fatiado"]},

    # ── Tubérculo/Raiz ───────────────────────────────────────────────────────
    "Batata inglesa": {
        "busca": "batata inglesa kg", "unidade": "g",
        "ok": ["batata"],
        "nao": ["frita", "chips", "palha", "doce", "baroa", "congelada", "mandioquinha"]},
    "Batata doce": {
        "busca": "batata doce kg", "unidade": "g",
        "ok": ["batata doce"],
        "nao": ["chips", "congelada", "palha"]},
    "Batata palha": {
        "busca": "batata palha 500g", "unidade": "g",
        "ok": ["batata palha"],
        "nao": ["frita congelada"]},
    "Mandioca": {
        "busca": "mandioca descascada kg", "unidade": "g",
        "ok": ["mandioca", "macaxeira", "aipim"],
        "nao": ["farinha", "polvilho", "tapioca", "chips", "congelada frita"]},

    # ── Legume/Verdura ───────────────────────────────────────────────────────
    "Tomate": {
        "busca": "tomate salada kg", "unidade": "g",
        "ok": ["tomate"],
        "nao": ["extrato", "molho", "pelado", "seco", "cereja", "lata"]},
    "Cebola": {
        "busca": "cebola kg", "unidade": "g",
        "ok": ["cebola"],
        "nao": ["desidratada", "em pó", "picada", "conserva", "frita", "flakes"]},
    "Cenoura": {
        "busca": "cenoura kg", "unidade": "g",
        "ok": ["cenoura"],
        "nao": ["desidratada", "baby", "congelada", "conserva"]},
    "Pimentão": {
        "busca": "pimentão verde kg", "unidade": "g",
        "ok": ["pimentão", "pimentao"],
        "nao": ["pimenta", "conserva", "seco", "pó"]},
    "Couve": {
        "busca": "couve manteiga maço", "unidade": "maco", "peso_ref_g": 250,
        "ok": ["couve"],
        "nao": ["flor", "bruxelas", "desidratada"]},
    "Repolho": {
        "busca": "repolho verde kg", "unidade": "g",
        "ok": ["repolho"],
        "nao": ["chucrute", "conserva"]},
    "Alface": {
        # rúcula/escarola saíram daqui na explosão de 12/07/2026 (bases próprias)
        "busca": "alface crespa unidade", "unidade": "maco", "peso_ref_g": 300,
        "ok": ["alface"],
        "nao": ["semente", "kit", "desidratada", "muda"]},
    "Abóbora": {
        "busca": "abóbora cabotiá kg", "unidade": "g",
        "ok": ["abóbora", "abobora", "moranga", "jerimum", "cabotiá"],
        "nao": ["semente", "doce em calda"]},
    "Quiabo": {
        "busca": "quiabo fresco kg", "unidade": "g",
        "ok": ["quiabo"],
        "nao": ["conserva", "semente", "sementes"]},
    "Milho verde": {
        "busca": "milho verde espiga kg", "unidade": "g",
        "ok": ["milho"],
        "nao": ["pipoca", "fubá", "farinha"]},
    "Palmito": {
        "busca": "palmito pupunha conserva kg", "unidade": "g",
        "ok": ["palmito"],
        "nao": ["guariroba", "temperado"]},
    "Guariroba": {
        "busca": "guariroba conserva kg", "unidade": "g",
        "ok": ["guariroba", "gueroba", "palmito amargo"],
        "nao": ["doce"]},
    "Champignon (conserva)": {
        "busca": "champignon conserva 200g", "unidade": "g",
        "ok": ["champignon", "cogumelo"],
        "nao": ["seco"]},
    "Jambu": {
        "busca": "jambu congelado", "unidade": "g", "preco_manual": 60.0,
        "ok": ["jambu"],
        "nao": ["desidrat", "extrato", "pomada", "creme", "flor", "semente",
                "cumaru", "cápsula", "capsula", "óleo", "oleo"]},
    "Maniva (folha de mandioca)": {
        "busca": "maniva maniçoba kg", "unidade": "g",
        "ok": ["maniva", "maniçoba", "manicoba"],
        "nao": ["farinha", "raiz"]},

    # ── Leguminosa ───────────────────────────────────────────────────────────
    "Feijão carioca": {
        "busca": "feijão carioca", "unidade": "g",
        "ok": ["feijão", "feijao"],
        "nao": ["preto", "fradinho", "verde", "branco", "rajado", "temperado", "lata"]},
    "Feijão preto": {
        "busca": "feijão preto kg", "unidade": "g",
        "ok": ["preto"],
        "nao": ["carioca", "fradinho", "lata", "temperado"]},
    "Feijão de corda": {
        "busca": "feijão de corda fradinho kg", "unidade": "g",
        "ok": ["corda", "fradinho", "caupi", "macassar", "verde"],
        "nao": ["preto", "carioca", "lata", "temperado"]},
    "Grão-de-bico": {
        "busca": "grão de bico kg", "unidade": "g",
        "ok": ["grão de bico", "grao de bico", "grão-de-bico"],
        "nao": ["lata", "conserva pronta"]},

    # ── Fruta ────────────────────────────────────────────────────────────────
    "Banana da terra": {
        "busca": "banana da terra kg", "unidade": "g",
        "ok": ["banana"],
        "nao": ["passa", "chips", "doce"]},
    "Limão": {
        "busca": "limão tahiti kg", "unidade": "g",
        "ok": ["limão", "limao"],
        "nao": ["suco", "desidratado", "siciliano", "cravo"]},
    "Laranja": {
        "busca": "laranja pera kg", "unidade": "g",
        "ok": ["laranja"],
        "nao": ["suco", "refresco", "essência"]},
    "Pequi": {
        "busca": "pequi conserva kg", "unidade": "g",
        "ok": ["pequi"],
        "nao": ["óleo", "licor", "castanha"]},

    # ── Outro ────────────────────────────────────────────────────────────────
    "Amendoim": {
        "busca": "amendoim cru kg", "unidade": "g",
        "ok": ["amendoim"],
        "nao": ["paçoca", "doce", "manteiga", "salgadinho"]},
    "Cachaça": {
        "busca": "cachaça 1 litro", "unidade": "ml",
        "ok": ["cachaça", "cachaca", "aguardente"],
        "nao": ["whisky", "vodka", "licor"]},

    # ── Líquido regional ─────────────────────────────────────────────────────
    "Tucupi": {
        "busca": "tucupi 500ml", "unidade": "ml",
        "ok": ["tucupi"],
        "nao": ["goma", "farinha"]},
    "Açaí (polpa)": {
        "busca": "polpa de açaí 1kg", "unidade": "g",
        "ok": ["açaí", "acai"],
        "nao": ["pó", "cápsula", "suplemento", "tigela pronta"]},

    # ── Tempero/Erva ─────────────────────────────────────────────────────────
    "Sal": {
        "busca": "sal refinado iodado 1kg", "unidade": "g",
        "ok": ["sal"],
        "nao": ["temperado", "light", "diet", "himalaia"]},
    "Alho": {
        "busca": "alho descascado", "unidade": "g",
        "ok": ["alho"],
        "nao": ["granulado", "desidratado", "em pó", "temperado", "aperitivo", "espanhol", "pasta"]},
    "Cheiro-verde": {
        "busca": "cheiro verde maço", "unidade": "maco", "peso_ref_g": 150,
        "ok": ["salsinha", "cebolinha", "cheiro", "tempero verde"],
        "nao": ["desidratado", "em pó", "congelado"]},
    "Coentro": {
        "busca": "coentro maço", "unidade": "maco", "peso_ref_g": 100,
        "ok": ["coentro"],
        "nao": ["em pó", "semente", "desidratado", "grão"]},
    "Pimenta": {
        "busca": "pimenta do reino 100g", "unidade": "g",
        "ok": ["pimenta"],
        "nao": ["pimentão", "calabresa", "biquinho conserva", "molho"]},
    "Colorau/Urucum": {
        "busca": "colorau colorífico 100g", "unidade": "g",
        "ok": ["colorau", "urucum", "colorífico", "colorifico"],
        "nao": ["páprica", "açafrão"]},
    "Açafrão da terra": {
        "busca": "açafrão da terra cúrcuma 100g", "unidade": "g",
        "ok": ["açafrão", "acafrao", "cúrcuma", "curcuma"],
        "nao": ["pistilo", "espanhol real"]},
    "Cominho": {
        "busca": "cominho em pó 50g", "unidade": "g",
        "ok": ["cominho"],
        "nao": ["molho"]},
    "Louro (folha)": {
        "busca": "folha de louro 10g", "unidade": "g",
        "ok": ["louro"],
        "nao": ["molho"]},
    "Orégano": {
        "busca": "orégano 50g", "unidade": "g",
        "ok": ["orégano", "oregano"],
        "nao": ["molho", "tempero misto"]},
    "Manjericão": {
        "busca": "manjericão maço", "unidade": "maco", "peso_ref_g": 40,
        "ok": ["manjericão", "manjericao", "basílico"],
        "nao": ["desidratado", "pesto", "essência"]},
    "Hortelã": {
        "busca": "hortelã maço", "unidade": "maco", "peso_ref_g": 40,
        "ok": ["hortelã", "hortela", "menta"],
        "nao": ["chá", "desidratada", "essência", "bala"]},

    # ── Condimento/Molho ─────────────────────────────────────────────────────
    "Vinagre": {
        "busca": "vinagre de álcool 750ml", "unidade": "ml",
        "ok": ["vinagre"],
        "nao": ["balsâmico", "maçã", "vinho tinto", "arroz"]},
    "Molho/extrato de tomate": {
        "busca": "extrato de tomate 340g", "unidade": "g",
        "ok": ["extrato", "molho", "tomate"],
        "nao": ["ketchup", "pelado"]},
    "Ketchup": {
        "busca": "ketchup 400g", "unidade": "g",
        "ok": ["ketchup", "catchup"],
        "nao": ["mostarda", "maionese"]},
    "Mostarda": {
        "busca": "mostarda 200g", "unidade": "g",
        "ok": ["mostarda"],
        "nao": ["ketchup", "maionese"]},
    "Maionese": {
        "busca": "maionese 500g", "unidade": "g",
        "ok": ["maionese"],
        "nao": ["ketchup", "mostarda", "sabor"]},
    "Caldo de carne (tablete)": {
        "busca": "caldo de carne tablete 114g", "unidade": "g",
        "ok": ["caldo", "carne"],
        "nao": ["galinha", "legumes", "camarão", "costela", "zero sal"]},

    # ── Explosão das consolidações (12/07/2026) ─────────────────────────────
    # Bases que estavam fundidas voltam a ter cotação própria. Palavras nao
    # cruzadas entre os pares separam os resultados (calabresa × toscana,
    # charque × carne de sol, fubá × flocão...). Complementam as palavras
    # negativas GLOBAIS do scraper (gourmet, premium, kit, cesta...).
    "Acém/Músculo bovino": {
        "busca": "acém bovino kg", "unidade": "g",
        "ok": ["acém", "acem", "músculo", "musculo", "paleta"],
        "nao": ["temperado", "moída", "moida", "hambúrguer", "almôndega", "caldo", "tablete", "defumado"]},
    "Peito bovino": {
        "busca": "peito bovino kg", "unidade": "g",
        "ok": ["peito"],
        "nao": ["frango", "suíno", "suino", "temperado", "defumado", "caldo"]},
    "Matambre bovino": {
        "busca": "matambre bovino kg", "unidade": "g",
        "ok": ["matambre"],
        "nao": ["recheado", "temperado", "enrolado"]},
    "Carne seca/Charque": {
        "busca": "charque carne seca kg", "unidade": "g",
        "ok": ["charque", "carne seca", "jerked"],
        "nao": ["carne de sol", "caldo", "tablete", "temperado pronto", "desfiada pronta"]},
    "Carne de sol": {
        "busca": "carne de sol kg", "unidade": "g",
        "ok": ["carne de sol"],
        "nao": ["charque", "carne seca", "caldo", "tablete", "desfiada pronta"]},
    "Linguiça calabresa": {
        "busca": "linguiça calabresa kg", "unidade": "g",
        "ok": ["calabresa"],
        "nao": ["toscana", "pizza", "sabor calabresa", "snack", "instantâneo", "instantaneo"]},
    "Linguiça defumada": {
        "busca": "linguiça defumada kg", "unidade": "g",
        "ok": ["defumada", "defumado", "paio"],
        "nao": ["toscana", "frescal", "sabor", "snack"]},
    "Linguiça toscana (suína)": {
        "busca": "linguiça toscana kg", "unidade": "g",
        "ok": ["toscana"],
        "nao": ["calabresa", "defumada", "sabor"]},
    "Lombo suíno": {
        "busca": "lombo suíno kg", "unidade": "g",
        "ok": ["lombo"],
        "nao": ["canadense", "defumado", "temperado", "atum", "bacalhau"]},
    "Pernil suíno": {
        "busca": "pernil suíno kg", "unidade": "g",
        "ok": ["pernil"],
        "nao": ["temperado", "defumado", "tender", "frango"]},
    "Panceta/Barriga suína": {
        "busca": "panceta suína kg", "unidade": "g",
        "ok": ["panceta", "barriga"],
        "nao": ["bacon", "defumada", "defumado", "frango"]},
    "Bacon": {
        "busca": "bacon defumado kg", "unidade": "g",
        "ok": ["bacon"],
        "nao": ["sabor", "aroma", "snack", "batata", "amendoim", "ração", "racao"]},
    "Queijo prato": {
        "busca": "queijo prato kg", "unidade": "g",
        "ok": ["queijo prato"],
        "nao": ["mussarela", "muçarela", "ralado", "sabor"]},
    "Queijo mussarela": {
        "busca": "queijo mussarela kg", "unidade": "g",
        "ok": ["mussarela", "muçarela", "mozarela"],
        "nao": ["búfala", "bufala", "ralado", "queijo prato", "sabor"]},
    "Fubá de milho": {
        "busca": "fubá mimoso kg", "unidade": "g",
        "ok": ["fubá", "fuba"],
        "nao": ["flocão", "flocao", "cuscuz", "canjica", "pipoca"]},
    "Flocão de milho (cuscuz)": {
        "busca": "flocão de milho cuscuz", "unidade": "g",
        "ok": ["flocão", "flocao", "flocos de milho"],
        "nao": ["fubá", "fuba", "canjica", "pipoca", "aveia"]},
    "Extrato de tomate": {
        "busca": "extrato de tomate", "unidade": "g",
        "ok": ["extrato"],
        "nao": ["molho", "ketchup", "polpa"]},
    "Molho de tomate (sachê)": {
        "busca": "molho de tomate sachê", "unidade": "g",
        "ok": ["molho de tomate"],
        "nao": ["extrato", "ketchup", "pizza", "pimenta"]},
    "Rúcula": {
        "busca": "rúcula maço", "unidade": "maco", "peso_ref_g": 100,
        "ok": ["rúcula", "rucula"],
        "nao": ["semente", "kit", "desidratada", "muda"]},
    "Escarola/Chicória": {
        "busca": "escarola maço", "unidade": "maco", "peso_ref_g": 250,
        "ok": ["escarola", "chicória", "chicoria"],
        "nao": ["semente", "kit", "desidratada", "muda"]},
    "Pimenta do reino": {
        "busca": "pimenta do reino moída", "unidade": "g",
        "ok": ["pimenta do reino", "reino"],
        "nao": ["moedor", "kit", "dedo de moça", "calabresa", "biquinho"]},
    "Pimenta (fresca)": {
        "busca": "pimenta dedo de moça kg", "unidade": "g",
        "ok": ["pimenta"],
        "nao": ["reino", "moedor", "molho", "kit", "semente", "calabresa seca", "biquinho em conserva"]},

    # ── Novo ingrediente (Dobradinha à Paulista, 12/07/2026) ─────────────────
    "Feijão branco": {
        "busca": "feijão branco kg", "unidade": "g",
        "ok": ["feijão branco", "feijao branco"],
        "nao": ["preto", "carioca", "fradinho", "corda", "verde", "lata", "temperado"]},

    # ── Preço fixo (não-scrapeável) ─────────────────────────────────────────
    # unidade='fixo' → o scraper PULA (não gasta SerpAPI); o custo por prato
    # usa 'custo_fixo' (R$ por prato).
    "Sangue suíno": {
        "busca": "", "unidade": "fixo", "custo_fixo": 0.50, "ok": [], "nao": []},
    "Sangue de aves": {
        "busca": "", "unidade": "fixo", "custo_fixo": 0.50, "ok": [], "nao": []},
}
