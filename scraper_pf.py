import requests
import re
import json
import os
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(".env.local")
except ImportError:
    pass

# ─── Configuração ─────────────────────────────────────────────────────────────
# Aceita até duas contas SerpAPI (250 chamadas grátis cada). Quando a primeira
# esgota a cota, o scraper passa automaticamente para a segunda.
SERP_API_KEYS = [k for k in (os.getenv("SERPAPI_KEY", ""), os.getenv("SERPAPI_KEY_2", "")) if k]
_serp_idx     = 0
SUPABASE_URL  = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY", "")
CACHE_FILE    = "cache_serpapi.json"
SNAPSHOT_FILE = "snapshot_pf.json"

SUPA_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

# ─── Regras anti-inflação de preço ───────────────────────────────────────────
# Palavras que indicam produto premium/atípico → descarta o resultado.
PALAVRAS_NAO_GLOBAIS = ["gourmet", "premium", "luxo", "importado", "seleção especial",
                        "cesta", "kit presente", "trufado"]
# Descarta preços muito fora da mediana do lote (pega erro de vírgula: 40 → 40000).
LIMITE_RAZAO_MEDIANA = 4.0   # mantém só preços entre mediana/4 e mediana*4

# ─── Catálogo de ingredientes (vem da tabela 'ingredientes' do Supabase) ──────
# Cada ingrediente tem: id, nome, busca, unidade, peso_ref_g, palavras_ok, palavras_nao.
#   unidade:
#     'g' / 'ml'  → extrai peso/volume do título → R$/g (ou R$/ml)
#     'unidade'   → ovo: extrai nº de unidades, divide por peso_ref_g → R$/g
#     'maco'      → folhas/verduras por maço: divide por peso_ref_g → R$/g
# A normalização sempre resulta em R$/g (ml tratado como ≈g) para o custo por
# prato = preço × quantidade da receita.
def carregar_catalogo():
    # ignora itens não-scrapeáveis: preço fixo (custo_fixo) e preço manual.
    url = (f"{SUPABASE_URL}/rest/v1/ingredientes"
           "?select=id,nome,busca,unidade,peso_ref_g,palavras_ok,palavras_nao"
           "&ativo=eq.true&unidade=neq.fixo&preco_manual=is.null&order=id")
    resp = requests.get(url, headers=SUPA_HEADERS, timeout=30)
    resp.raise_for_status()
    cat = resp.json()
    # scrape direcionado: SCRAPE_ONLY="Nome 1,Nome 2" raspa só esses (economiza API)
    apenas = [n.strip() for n in os.getenv("SCRAPE_ONLY", "").split(",") if n.strip()]
    if apenas:
        cat = [i for i in cat if i["nome"] in apenas]
        faltando = set(apenas) - {i["nome"] for i in cat}
        if faltando:
            print(f"⚠️  SCRAPE_ONLY não encontrou no catálogo: {sorted(faltando)}")
    for ing in cat:
        ing["palavras_ok"]  = [p for p in (ing.get("palavras_ok") or "").split("|") if p]
        ing["palavras_nao"] = [p for p in (ing.get("palavras_nao") or "").split("|") if p]
    return cat

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

# ─── Extrator de peso/volume (R$/g e R$/ml) ──────────────────────────────────
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

# ─── Extrator de contagem (ovo: unidades; maço: maços) ───────────────────────
def extrair_contagem(titulo):
    """Quantas unidades/maços o anúncio contém. Ex: 'ovos 30 unidades' → 30,
    'cheiro verde 2 maços' → 2. Sem contagem explícita, assume 1."""
    titulo_lower = titulo.lower()
    padroes = [
        r'(\d+)\s*unidades?', r'bandeja\s*com\s*(\d+)', r'caixa\s*com\s*(\d+)',
        r'(\d+)\s*ovos', r'c/\s*(\d+)', r'(\d+)\s*maços?', r'kit\s*(\d+)',
        r'(\d+)\s*d[úu]zias?',
    ]
    for padrao in padroes:
        m = re.search(padrao, titulo_lower)
        if m:
            n = int(m.group(1))
            if 'dúzia' in padrao or 'duzia' in padrao:
                n *= 12
            return n
    return 1

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
    except ValueError:
        return None

# ─── Validação de produto ─────────────────────────────────────────────────────
def produto_valido(titulo, ingrediente):
    titulo_lower = titulo.lower()
    for palavra in PALAVRAS_NAO_GLOBAIS:
        if palavra in titulo_lower:
            return False, f"global '{palavra}'"
    if not any(p.lower() in titulo_lower for p in ingrediente["palavras_ok"]):
        return False, "produto fora do escopo"
    for palavra in ingrediente["palavras_nao"]:
        if palavra.lower() in titulo_lower:
            return False, f"contém '{palavra}'"
    return True, "ok"

# ─── Filtro de sanidade vs mediana (pega erro de vírgula/decimal) ────────────
def filtrar_sanidade(precos):
    if len(precos) < 3:
        return precos
    m = mediana(precos)
    if not m:
        return precos
    return [p for p in precos if m / LIMITE_RAZAO_MEDIANA <= p <= m * LIMITE_RAZAO_MEDIANA]

# ─── Normalização → R$/g (ou R$/ml) + texto de exibição ──────────────────────
def normalizar(preco, titulo, ing):
    u = ing["unidade"]
    if u in ("g", "ml"):
        qtd = extrair_quantidade(titulo)
        if not qtd:
            return None
        norm  = preco / qtd                       # R$/g ou R$/ml
        label = "kg" if u == "g" else "L"
        exib  = f"R$ {norm * 1000:.2f}/{label}"
        return norm, exib, label
    # 'unidade' (ovo) ou 'maco' (folhas): preço por unidade/maço ÷ peso de ref.
    peso = ing.get("peso_ref_g")
    if not peso:
        return None
    cont       = extrair_contagem(titulo)
    preco_unit = preco / cont
    norm       = preco_unit / peso                # R$/g
    exib       = f"R$ {preco_unit:.2f}/un (≈R$ {norm * 1000:.2f}/kg)"
    return norm, exib, "kg"

# ─── Filtro de outliers (IQR) ─────────────────────────────────────────────────
def filtrar_outliers(precos):
    if len(precos) < 4:
        return precos
    p = sorted(precos)
    q1 = p[len(p) // 4]
    q3 = p[(len(p) * 3) // 4]
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return [x for x in precos if lo <= x <= hi]

# ─── Mediana ──────────────────────────────────────────────────────────────────
def mediana(valores):
    v = sorted([x for x in valores if x is not None])
    if not v:
        return None
    meio = len(v) // 2
    return v[meio] if len(v) % 2 != 0 else (v[meio - 1] + v[meio]) / 2

# ─── Busca via SerpAPI ────────────────────────────────────────────────────────
def _buscar_serp(query):
    """Consulta a SerpAPI, alternando entre as contas quando a cota esgota.
    Retorna o JSON da resposta ou None em caso de falha em todas as chaves."""
    global _serp_idx
    if not SERP_API_KEYS:
        print("  ❌ Nenhuma SERPAPI_KEY configurada")
        return None
    for _ in range(len(SERP_API_KEYS)):
        key = SERP_API_KEYS[_serp_idx]
        params = {
            "engine": "google_shopping", "q": query,
            "gl": "br", "hl": "pt", "location": "Brazil", "api_key": key,
        }
        try:
            resp = requests.get("https://serpapi.com/search", params=params, timeout=30)
        except requests.RequestException as e:
            print(f"  ❌ erro de rede: {e}")
            return None
        try:
            dados = resp.json()
        except ValueError:
            dados = {}
        erro = dados.get("error", "")
        if resp.status_code == 200 and not erro:
            return dados
        # 401/429 ou erro de cota → tenta a próxima conta
        print(f"  ⚠️  chave #{_serp_idx + 1} falhou ({resp.status_code} {erro}); tentando próxima")
        _serp_idx = (_serp_idx + 1) % len(SERP_API_KEYS)
    print("  ❌ Todas as chaves SerpAPI falharam/esgotaram")
    return None


def buscar_ingrediente(ingrediente, cache):
    chave = chave_cache(ingrediente)
    if chave in cache:
        print(f"\n💾 {ingrediente['nome']} → cache de hoje")
        return cache[chave]

    print(f"\n🔍 {ingrediente['nome']} → '{ingrediente['busca']}'")
    dados = _buscar_serp(ingrediente["busca"])
    if dados is None:
        return []
    itens = dados.get("shopping_results", [])
    if not itens:
        print("  ⚠️  Sem resultados")
        return []

    resultados, rejeitados = [], 0
    for item in itens[:15]:
        titulo    = item.get("title", "")
        preco_txt = item.get("price", "")
        loja      = item.get("source", "N/A")
        link      = item.get("product_link") or item.get("link") or item.get("url") or ""
        if not link:
            import urllib.parse
            qs = urllib.parse.urlencode({"q": ingrediente["busca"], "tbm": "shop"})
            link = f"https://www.google.com/search?{qs}"

        valido, _ = produto_valido(titulo, ingrediente)
        if not valido:
            rejeitados += 1
            continue
        preco = limpar_preco(preco_txt)
        if not preco:
            continue
        norm = normalizar(preco, titulo, ingrediente)
        if not norm:
            continue
        preco_norm, exibicao, _label = norm

        resultados.append({
            "ingrediente_id":    ingrediente["id"],
            "ingrediente":       ingrediente["nome"],
            "titulo":            titulo,
            "preco_bruto":       preco,
            "preco_normalizado": preco_norm,
            "exibicao":          exibicao,
            "loja":              loja,
            "link":              link,
        })

    # sanidade (erro de vírgula) → depois outliers (dispersão)
    antes = len(resultados)
    norm = [r["preco_normalizado"] for r in resultados]
    norm = filtrar_sanidade(norm)
    norm = filtrar_outliers(norm)
    resultados = [r for r in resultados if r["preco_normalizado"] in norm]
    print(f"  ✅ {len(resultados)} válidos | {rejeitados} produto errado | "
          f"{antes - len(resultados)} descartados (sanidade/outlier)")

    cache[chave] = resultados
    salvar_cache(cache)
    return resultados

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("🍽️  ÍNDICE PF — Scraper (catálogo dinâmico, modelo por prato)")
    print(f"📅 {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 60)

    catalogo = carregar_catalogo()
    print(f"📦 {len(catalogo)} ingredientes ativos no catálogo")

    cache, todos, resumo = carregar_cache(), [], []
    for ing in catalogo:
        resultados = buscar_ingrediente(ing, cache)
        todos.extend(resultados)

        norm = [r["preco_normalizado"] for r in resultados if r["preco_normalizado"]]
        med  = mediana(norm)
        label = "L" if ing["unidade"] == "ml" else "kg"
        resumo.append({
            "ingrediente_id":      ing["id"],
            "ingrediente":         ing["nome"],
            "mediana_normalizada": round(med, 6) if med else None,   # R$/g
            "mediana_exibicao":    round(med * 1000, 2) if med else None,  # R$/kg ou R$/L
            "label":               label,
            "qtd_resultados":      len(resultados),
        })

    # ─── Tabela final ────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"  {'INGREDIENTE':<30} {'PREÇO MEDIANO':>15} {'RESULTADOS':>10}")
    print("=" * 60)
    for r in resumo:
        preco = f"R$ {r['mediana_exibicao']:.2f}/{r['label']}" if r["mediana_exibicao"] else "N/A"
        print(f"  {r['ingrediente']:<30} {preco:>15} {r['qtd_resultados']:>10}")
    com_preco = sum(1 for r in resumo if r["mediana_exibicao"])
    print("=" * 60)
    print(f"  {com_preco}/{len(resumo)} ingredientes com preço")

    snapshot = {
        "data":       datetime.now().strftime("%Y-%m-%d"),
        "fonte":      "Google Shopping via SerpAPI",
        "resumo":     resumo,
        "resultados": todos,
    }
    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Snapshot salvo em {SNAPSHOT_FILE}")
    print("✅ Concluído!")

if __name__ == "__main__":
    main()
