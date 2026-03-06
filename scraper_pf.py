import requests
import re
import json
import os
from datetime import datetime

# ─── Configuração ─────────────────────────────────────────────────────────────
SERP_API_KEY  = "de201d8a519e3dd1bfc66d55868f9fe119f00dd1eeaf1ace77663b4cc7ccb6ae"
CACHE_FILE    = "cache_serpapi.json"
SNAPSHOT_FILE = "snapshot_pf.json"

# ─── 27 Ingredientes do PF ───────────────────────────────────────────────────
# Cada ingrediente tem:
#   busca         → termo enviado ao Google Shopping
#   unidade_base  → "g" ou "ml" (para normalização)
#   palavras_ok   → pelo menos UMA deve estar no título (garante produto certo)
#   palavras_nao  → NENHUMA pode estar no título (evita produtos errados)
#   qtd_porcao_g  → gramas usados em 1 porção de PF (para calcular custo)

INGREDIENTES = [
    # BASE
    {
        "nome": "Arroz Branco", "busca": "arroz branco tipo 1",
        "unidade_base": "g",
        "palavras_ok":  ["arroz"],
        "palavras_nao": ["integral", "parboilizado", "temperado", "japonês", "arbóreo"],
        "qtd_porcao_g": 80,
    },
    {
        "nome": "Feijão Carioca", "busca": "feijão carioca",
        "unidade_base": "g",
        "palavras_ok":  ["feijão"],
        "palavras_nao": ["preto", "fradinho", "verde", "branco", "rajado", "temperado", "lata"],
        "qtd_porcao_g": 80,
    },
    {
        "nome": "Óleo de Soja", "busca": "óleo de soja",
        "unidade_base": "ml",
        "palavras_ok":  ["óleo", "oleo"],
        "palavras_nao": ["girassol", "canola", "milho", "coco", "azeite", "palma"],
        "qtd_porcao_g": 10,
    },

    # PROTEÍNAS
    {
        "nome": "Frango (coxa/sobrecoxa)", "busca": "coxa sobrecoxa frango kg",
        "unidade_base": "g",
        "palavras_ok":  ["frango", "coxa", "sobrecoxa"],
        "palavras_nao": ["temperado", "empanado", "nuggets", "processado", "defumado"],
        "qtd_porcao_g": 200,
    },
    {
        "nome": "Carne Bovina", "busca": "acém bovino kg congelado",
        "unidade_base": "g",
        "palavras_ok":  ["acém", "músculo", "carne bovina", "bovino"],
        "palavras_nao": ["temperado", "hamburguer", "almôndega", "moída", "fatiado"],
        "qtd_porcao_g": 150,
    },
    {
        "nome": "Ovo", "busca": "ovos bandeja 30 unidades",
        "unidade_base": "unidade",
        "palavras_ok":  ["ovo", "ovos"],
        "palavras_nao": ["codorna", "chocolate", "páscoa", "desidratado", "caipira", "porta", "organizador", "kit", "cartela plástica", "suporte"],
        "qtd_porcao_g": None,
        "qtd_bandeja": 30,
        "qtd_porcao_unid": 2,  # 2 ovos por porção
    },
    {
        "nome": "Bisteca Suína", "busca": "bisteca suína kg",
        "unidade_base": "g",
        "palavras_ok":  ["bisteca", "suína", "suino", "porco"],
        "palavras_nao": ["temperada", "defumada", "embutido"],
        "qtd_porcao_g": 180,
    },

    # GUARNIÇÕES
    {
        "nome": "Macarrão Espaguete", "busca": "macarrão espaguete 500g",
        "unidade_base": "g",
        "palavras_ok":  ["macarrão", "espaguete", "spaghetti"],
        "palavras_nao": ["integral", "sem glúten", "instantâneo", "miojo"],
        "qtd_porcao_g": 80,
    },
    {
        "nome": "Farinha de Mandioca", "busca": "farinha de mandioca torrada",
        "unidade_base": "g",
        "palavras_ok":  ["farinha", "mandioca"],
        "palavras_nao": ["trigo", "milho", "tapioca", "polvilho"],
        "qtd_porcao_g": 30,
    },
    {
        "nome": "Batata Inglesa", "busca": "batata inglesa kg",
        "unidade_base": "g",
        "palavras_ok":  ["batata"],
        "palavras_nao": ["frita", "chips", "palha", "doce", "baroa", "congelada"],
        "qtd_porcao_g": 150,
    },
    {
        "nome": "Mandioca", "busca": "mandioca descascada kg",
        "unidade_base": "g",
        "palavras_ok":  ["mandioca", "macaxeira", "aipim"],
        "palavras_nao": ["farinha", "polvilho", "tapioca", "chips"],
        "qtd_porcao_g": 150,
    },

    # SALADA
    {
        "nome": "Alface", "busca": "alface unidade preço",
        "unidade_base": "unid_peso_fixo",
        "palavras_ok":  ["alface"],
        "palavras_nao": ["desidratada", "molho", "mix", "semente", "kit", "orgânica"],
        "peso_fixo_g":  300,  # 1 pé de alface ~300g
        "qtd_porcao_g": 30,
    },
    {
        "nome": "Tomate", "busca": "tomate salada kg",
        "unidade_base": "g",
        "palavras_ok":  ["tomate"],
        "palavras_nao": ["extrato", "molho", "pelado", "seco", "cereja", "lata"],
        "qtd_porcao_g": 50,
    },
    {
        "nome": "Pepino", "busca": "pepino japonês kg",
        "unidade_base": "g",
        "palavras_ok":  ["pepino"],
        "palavras_nao": ["conserva", "picles", "em fatias"],
        "qtd_porcao_g": 40,
    },
    {
        "nome": "Cenoura", "busca": "cenoura kg",
        "unidade_base": "g",
        "palavras_ok":  ["cenoura"],
        "palavras_nao": ["desidratada", "baby", "congelada", "em lata"],
        "qtd_porcao_g": 40,
    },
    {
        "nome": "Beterraba", "busca": "beterraba kg",
        "unidade_base": "g",
        "palavras_ok":  ["beterraba"],
        "palavras_nao": ["em conserva", "em lata", "desidratada", "suco"],
        "qtd_porcao_g": 40,
    },

    # TEMPEROS
    {
        "nome": "Alho", "busca": "alho descascado",
        "unidade_base": "g",
        "palavras_ok":  ["alho"],
        "palavras_nao": ["granulado", "desidratado", "em pó", "temperado", "aperitivo", "espanhol"],
        "qtd_porcao_g": 5,
    },
    {
        "nome": "Cebola", "busca": "cebola kg",
        "unidade_base": "g",
        "palavras_ok":  ["cebola"],
        "palavras_nao": ["desidratada", "em pó", "picada", "conserva", "frita"],
        "qtd_porcao_g": 30,
    },
    {
        "nome": "Sal", "busca": "sal refinado iodado 1kg",
        "unidade_base": "g",
        "palavras_ok":  ["sal"],
        "palavras_nao": ["marinho", "grosso", "rosa", "temperado", "light", "diet"],
        "qtd_porcao_g": 2,
    },
    {
        "nome": "Colorau", "busca": "colorau colorífico 100g",
        "unidade_base": "g",
        "palavras_ok":  ["colorau", "urucum", "colorífico"],
        "palavras_nao": ["páprica", "açafrão"],
        "qtd_porcao_g": 2,
    },
    {
        "nome": "Pimenta do Reino", "busca": "pimenta do reino granel 100g",
        "unidade_base": "g",
        "palavras_ok":  ["pimenta"],
        "palavras_nao": ["vermelha", "dedo de moça", "malagueta", "calabresa", "biquinho"],
        "qtd_porcao_g": 1,
    },
    {
        "nome": "Extrato de Tomate", "busca": "extrato de tomate 340g",
        "unidade_base": "g",
        "palavras_ok":  ["extrato", "tomate"],
        "palavras_nao": ["molho", "ketchup", "polpa"],
        "qtd_porcao_g": 20,
    },
    {
        "nome": "Caldo de Galinha", "busca": "caldo de galinha tablete 114g",
        "unidade_base": "g",
        "palavras_ok":  ["caldo", "galinha"],
        "palavras_nao": ["carne", "legumes", "camarão", "costela", "kit", "bag", "c/ 2", "c/2", "zero sal"],
        "qtd_porcao_g": 5,
    },
    {
        "nome": "Cheiro-verde", "busca": "cheiro verde maço 100g",
        "unidade_base": "g",
        "palavras_ok":  ["salsinha", "cebolinha", "cheiro", "tempero verde"],
        "palavras_nao": ["desidratado", "em pó", "congelado"],
        "qtd_porcao_g": 5,
    },

    # COMPLEMENTOS
    {
        "nome": "Azeite de Oliva", "busca": "azeite de oliva extra virgem 500ml",
        "unidade_base": "ml",
        "palavras_ok":  ["azeite"],
        "palavras_nao": ["composto", "temperado", "aromatizado"],
        "qtd_porcao_g": 5,
    },
    {
        "nome": "Limão", "busca": "limão tahiti kg",
        "unidade_base": "g",
        "palavras_ok":  ["limão"],
        "palavras_nao": ["suco", "desidratado", "siciliano", "cravo"],
        "qtd_porcao_g": 10,
    },
    {
        "nome": "Vinagre", "busca": "vinagre de álcool 750ml",
        "unidade_base": "ml",
        "palavras_ok":  ["vinagre"],
        "palavras_nao": ["balsâmico", "maçã", "vinho tinto", "arroz"],
        "qtd_porcao_g": 5,
    },
]

# ─── Cache local ──────────────────────────────────────────────────────────────
def carregar_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def salvar_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def chave_cache(ingrediente):
    hoje = datetime.now().strftime("%Y-%m-%d")
    return f"{hoje}_{ingrediente['nome']}"

# ─── Extrator de quantidade ───────────────────────────────────────────────────
def extrair_quantidade(titulo):
    titulo_lower = titulo.lower()
    padroes = [
        (r'(\d+[\.,]?\d*)\s*kg',       1000),
        (r'(\d+[\.,]?\d*)\s*litros?',  1000),
        (r'(\d+[\.,]?\d*)\s*l\b',      1000),
        (r'(\d+[\.,]?\d*)\s*ml\b',     1),
        (r'(\d+[\.,]?\d*)\s*g\b',      1),
    ]
    for padrao, multiplicador in padroes:
        match = re.search(padrao, titulo_lower)
        if match:
            valor = float(match.group(1).replace(',', '.'))
            return valor * multiplicador
    return None

# ─── Limpa preço ──────────────────────────────────────────────────────────────
def limpar_preco(preco_txt):
    if not preco_txt:
        return None
    limpo = re.sub(r'[^\d,\.]', '', str(preco_txt))
    if not limpo:
        return None
    if ',' in limpo and '.' not in limpo:
        limpo = limpo.replace(',', '.')
    elif ',' in limpo and '.' in limpo:
        limpo = limpo.replace('.', '').replace(',', '.')
    try:
        return float(limpo)
    except:
        return None

# ─── Validação de produto ─────────────────────────────────────────────────────
def produto_valido(titulo, ingrediente):
    """
    Retorna True se o título bate com o ingrediente esperado.
    - Pelo menos 1 palavra_ok deve estar no título
    - Nenhuma palavra_nao pode estar no título
    """
    titulo_lower = titulo.lower()

    tem_palavra_ok = any(p.lower() in titulo_lower for p in ingrediente["palavras_ok"])
    if not tem_palavra_ok:
        return False, "produto fora do escopo"

    for palavra in ingrediente["palavras_nao"]:
        if palavra.lower() in titulo_lower:
            return False, f"contém '{palavra}'"

    return True, "ok"

# ─── Filtro de outliers (IQR) ─────────────────────────────────────────────────
def filtrar_outliers(precos):
    """
    Remove outliers usando o método IQR (Interquartile Range).
    Elimina preços absurdamente altos ou baixos.
    """
    if len(precos) < 4:
        return precos
    precos_sorted = sorted(precos)
    q1 = precos_sorted[len(precos_sorted) // 4]
    q3 = precos_sorted[(len(precos_sorted) * 3) // 4]
    iqr = q3 - q1
    limite_min = q1 - 1.5 * iqr
    limite_max = q3 + 1.5 * iqr
    return [p for p in precos if limite_min <= p <= limite_max]

# ─── Mediana ──────────────────────────────────────────────────────────────────
def mediana(valores):
    v = sorted([x for x in valores if x is not None])
    if not v:
        return None
    meio = len(v) // 2
    return v[meio] if len(v) % 2 != 0 else (v[meio - 1] + v[meio]) / 2


# ─── Extrator de unidades (para ovos) ────────────────────────────────────────
def extrair_unidades(titulo):
    """Extrai quantidade de unidades do título. Ex: 'Ovos 30 unidades' → 30"""
    titulo_lower = titulo.lower()
    padroes = [
        r'(\d+)\s*unidades?',
        r'bandeja\s*com\s*(\d+)',
        r'caixa\s*com\s*(\d+)',
        r'(\d+)\s*ovos',
        r'c/(\d+)',
    ]
    for padrao in padroes:
        match = re.search(padrao, titulo_lower)
        if match:
            return int(match.group(1))
    return None

# ─── Extrator de maços (para cheiro-verde) ───────────────────────────────────
def extrair_macos(titulo):
    """Extrai quantidade de maços do título. Ex: 'Cheiro verde 2 maços' → 2"""
    titulo_lower = titulo.lower()
    padroes = [
        r'(\d+)\s*maços?',
        r'kit\s*(\d+)',
        r'(\d+)\s*unidades?',
    ]
    for padrao in padroes:
        match = re.search(padrao, titulo_lower)
        if match:
            return int(match.group(1))
    return None

# ─── Busca via SerpAPI ────────────────────────────────────────────────────────
def buscar_ingrediente(ingrediente, cache):
    chave = chave_cache(ingrediente)

    # Usa cache se já buscou hoje
    if chave in cache:
        print(f"\n💾 {ingrediente['nome']} → usando cache de hoje")
        return cache[chave]

    print(f"\n🔍 {ingrediente['nome']} → '{ingrediente['busca']}'")

    params = {
        "engine":   "google_shopping",
        "q":        ingrediente["busca"],
        "gl":       "br",
        "hl":       "pt",
        "location": "Brazil",
        "api_key":  SERP_API_KEY,
    }

    resp = requests.get("https://serpapi.com/search", params=params)
    if resp.status_code != 200:
        print(f"  ❌ Erro: {resp.status_code}")
        return []

    itens = resp.json().get("shopping_results", [])
    if not itens:
        print(f"  ⚠️  Sem resultados")
        return []

    resultados = []
    rejeitados = 0

    for item in itens[:15]:
        titulo    = item.get("title", "")
        preco_txt = item.get("price", "")
        loja      = item.get("source", "N/A")
        link      = item.get("link", "")

        # Valida se é o produto certo
        valido, motivo = produto_valido(titulo, ingrediente)
        if not valido:
            rejeitados += 1
            continue

        preco = limpar_preco(preco_txt)
        if not preco:
            continue

        # ── Casos especiais de normalização ──────────────────────────────
        if ingrediente["unidade_base"] == "unidade":
            # OVO: extrai qtd de unidades do título e normaliza por bandeja de 30
            qtd_unid = extrair_unidades(titulo)
            if not qtd_unid:
                continue
            preco_por_unidade  = preco / qtd_unid
            preco_por_bandeja  = preco_por_unidade * ingrediente["qtd_bandeja"]
            preco_normalizado  = preco_por_bandeja  # referência: 1 bandeja de 30
            exibicao = f"R$ {preco_por_bandeja:.2f}/bdj30"

        elif ingrediente["unidade_base"] == "unid_peso_fixo":
            # ALFACE e similares: vendidos por unidade, peso estimado fixo
            preco_normalizado = preco / ingrediente["peso_fixo_g"]  # R$/g
            exibicao = f"R$ {preco:.2f}/un (R$ {preco_normalizado*1000:.2f}/kg)"

        elif ingrediente["unidade_base"] == "maco":
            # CHEIRO-VERDE: extrai qtd de maços e usa peso fixo para normalizar
            qtd_maco = extrair_macos(titulo)
            if not qtd_maco:
                qtd_maco = 1  # assume 1 maço se não encontrar
            preco_por_maco    = preco / qtd_maco
            peso_total_g      = qtd_maco * ingrediente["peso_maco_g"]
            preco_normalizado = preco / peso_total_g  # R$/g
            exibicao = f"R$ {preco_por_maco:.2f}/maço (R$ {preco_normalizado*1000:.2f}/kg)"

        else:
            # PADRÃO: extrai peso/volume do título
            qtd_base = extrair_quantidade(titulo)
            if not qtd_base:
                continue  # pula se não encontrou quantidade
            preco_normalizado = preco / qtd_base
            label = "kg" if ingrediente["unidade_base"] == "g" else "L"
            exibicao = f"R$ {preco_normalizado * 1000:.2f}/{label}"

        resultados.append({
            "ingrediente":       ingrediente["nome"],
            "titulo":            titulo,
            "preco_bruto":       preco,
            "preco_normalizado": preco_normalizado,
            "exibicao":          exibicao,
            "loja":              loja,
            "link":              link,
        })

    # Remove outliers de preço normalizado
    precos_norm = [r["preco_normalizado"] for r in resultados]
    precos_validos = filtrar_outliers(precos_norm)
    antes = len(resultados)
    resultados = [r for r in resultados if r["preco_normalizado"] in precos_validos]
    outliers_removidos = antes - len(resultados)

    print(f"  ✅ {len(resultados)} válidos | {rejeitados} produto errado | {outliers_removidos} outliers removidos")
    for r in resultados:
        print(f"     → {r['exibicao']:<18} | {r['titulo'][:40]:<40} | {r['loja'][:20]:<20} | {r['link'][:60]}")

    # Salva no cache
    cache[chave] = resultados
    salvar_cache(cache)

    return resultados

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("🍽️  ÍNDICE PF — Scraper Completo")
    print(f"📅 Data: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("="*60)

    cache            = carregar_cache()
    todos_resultados = []
    resumo           = []

    for ingrediente in INGREDIENTES:
        resultados = buscar_ingrediente(ingrediente, cache)
        todos_resultados.extend(resultados)

        precos_norm = [r["preco_normalizado"] for r in resultados if r["preco_normalizado"]]
        med = mediana(precos_norm)

        # Exibição e custo dependem da unidade base
        if ingrediente["unidade_base"] == "unidade":
            # Ovo: preco_normalizado já é R$/bandeja de 30
            mediana_exib  = round(med, 2) if med else None
            label         = "bdj30"
            custo_porcao  = round(med / ingrediente["qtd_bandeja"] * ingrediente["qtd_porcao_unid"], 4) if med else None

        elif ingrediente["unidade_base"] == "unid_peso_fixo":
            # Alface: preco_normalizado é R$/g com peso fixo estimado
            mediana_exib  = round(med * 1000, 2) if med else None
            label         = "kg*"  # * indica peso estimado
            custo_porcao  = round(med * ingrediente["qtd_porcao_g"], 4) if med else None

        elif ingrediente["unidade_base"] == "maco":
            # Cheiro-verde: preco_normalizado é R$/g, exibe R$/kg
            mediana_exib  = round(med * 1000, 2) if med else None
            label         = "kg"
            custo_porcao  = round(med * ingrediente["qtd_porcao_g"], 4) if med else None

        else:
            # Padrão: R$/g ou R$/ml → exibe R$/kg ou R$/L
            mediana_exib  = round(med * 1000, 2) if med else None
            label         = "kg" if ingrediente["unidade_base"] == "g" else "L"
            custo_porcao  = round(med * ingrediente.get("qtd_porcao_g", 0), 4) if med and ingrediente.get("qtd_porcao_g") else None

        resumo.append({
            "ingrediente":      ingrediente["nome"],
            "mediana_por_1000": mediana_exib,
            "label":            label,
            "custo_porcao_r":   custo_porcao,
            "qtd_resultados":   len(resultados),
        })

    # ─── Tabela final ────────────────────────────────────────────────────────
    print("\n" + "="*70)
    print(f"  {'INGREDIENTE':<22} {'PREÇO MEDIANO':>15} {'CUSTO/PORÇÃO':>13} {'RESULTADOS':>10}")
    print("="*70)

    custo_total_pf = 0
    for r in resumo:
        preco_fmt  = f"R$ {r['mediana_por_1000']:.2f}/{r['label']}" if r["mediana_por_1000"] else "N/A"
        porcao_fmt = f"R$ {r['custo_porcao_r']:.3f}" if r["custo_porcao_r"] else "N/A"
        if r["custo_porcao_r"]:
            custo_total_pf += r["custo_porcao_r"]
        print(f"  {r['ingrediente']:<22} {preco_fmt:>15} {porcao_fmt:>13} {r['qtd_resultados']:>10}")

    print("="*70)
    print(f"  {'CUSTO ESTIMADO DO PF (1 porção)':<38} R$ {custo_total_pf:.2f}")
    print("="*70)

    # ─── Salva snapshot ──────────────────────────────────────────────────────
    snapshot = {
        "data":            datetime.now().strftime("%Y-%m-%d"),
        "fonte":           "Google Shopping via SerpAPI",
        "custo_total_pf":  round(custo_total_pf, 2),
        "resumo":          resumo,
        "resultados":      todos_resultados,
    }
    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Snapshot salvo em {SNAPSHOT_FILE}")
    print("✅ Concluído!")

if __name__ == "__main__":
    main()
