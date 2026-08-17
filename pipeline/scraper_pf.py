import requests
import re
import json
import os
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(".env.local")
except ImportError:
    pass

# ─── Configuração ─────────────────────────────────────────────────────────────
# Aceita até quatro contas SerpAPI (250 chamadas grátis cada = 1000/mês). Quando
# uma esgota a cota, o scraper passa automaticamente para a próxima na ordem.
SERP_API_KEYS = [k for k in (os.getenv("SERPAPI_KEY", ""),
                             os.getenv("SERPAPI_KEY_2", ""),
                             os.getenv("SERPAPI_KEY_3", ""),
                             os.getenv("SERPAPI_KEY_4", "")) if k]
_serp_idx     = 0
SUPABASE_URL  = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY", "")
# Artefatos de runtime ficam junto do script (pipeline/), independente do CWD.
_DIR          = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE    = os.path.join(_DIR, "cache_serpapi.json")
SNAPSHOT_FILE = os.path.join(_DIR, "snapshot_pf.json")

SUPA_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

# ─── Regras anti-inflação de preço ───────────────────────────────────────────
# Palavras que indicam produto premium/atípico → descarta o resultado.
PALAVRAS_NAO_GLOBAIS = ["gourmet", "premium", "luxo", "importado", "seleção especial",
                        "cesta", "kit presente", "trufado"]
# Descarta preços muito fora da mediana do lote (pega erro de vírgula: 40 → 40000).
LIMITE_RAZAO_MEDIANA = 4.0   # mantém só preços entre mediana/4 e mediana*4
# Quantas ofertas da busca processar. O crédito da SerpAPI é cobrado por CHAMADA,
# não por resultado — cortar a lista não economiza nada, só joga fora oferta já
# paga. Com o corte antigo (15), 89 dos 123 ingredientes da coleta de 10/08
# pararam exatamente em 15 ofertas, ou seja o limite era do código, não do Google.
MAX_OFERTAS = int(os.getenv("MAX_OFERTAS", "60"))
# Timeout de cada chamada à SerpAPI. 30s cortava respostas que chegariam.
TIMEOUT_SERP = 60
# Amostra mínima da coleta anterior para ela poder servir de teto no anti-alta.
AMOSTRA_MIN_REF = 4

# ─── Catálogo de ingredientes (vem da tabela 'ingredientes' do Supabase) ──────
# Cada ingrediente tem: id, nome, busca, unidade, peso_ref_g, palavras_ok, palavras_nao.
#   unidade:
#     'g' / 'ml'  → extrai peso/volume do título → R$/g (ou R$/ml)
#     'unidade'   → ovo: extrai nº de unidades, divide por peso_ref_g → R$/g
#     'maco'      → folhas/verduras por maço: divide por peso_ref_g → R$/g
# A normalização sempre resulta em R$/g (ml tratado como ≈g) para o custo por
# prato = preço × quantidade da receita.
def _ids_coletados_recentes(dias=6):
    """ingrediente_ids com coleta bem-sucedida (qtd_resultados>0) em algum
    snapshot dos últimos `dias` dias. Usado para pular a reraspagem: um rerun
    pega só o que faltou (manuais/não-encontrados). Desligado por FORCE_RESCRAPE=1."""
    corte = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")
    r = requests.get(f"{SUPABASE_URL}/rest/v1/snapshots?select=id&data=gte.{corte}",
                     headers=SUPA_HEADERS, timeout=30)
    r.raise_for_status()
    ids = [s["id"] for s in r.json()]
    if not ids:
        return set()
    ids_csv = ",".join(str(i) for i in ids)
    r = requests.get(f"{SUPABASE_URL}/rest/v1/precos"
                     f"?select=ingrediente_id&snapshot_id=in.({ids_csv})&qtd_resultados=gt.0",
                     headers=SUPA_HEADERS, timeout=30)
    r.raise_for_status()
    return {p["ingrediente_id"] for p in r.json() if p["ingrediente_id"] is not None}


def medianas_coleta_anterior():
    """(mediana normalizada em R$/g, qtd_resultados) por ingrediente na coleta
    mais recente. Referência do filtro anti-alta. O qtd_resultados vem junto
    porque mediana apurada sobre 1–2 anúncios não é confiável o bastante para
    virar teto da coleta seguinte (ver AMOSTRA_MIN_REF)."""
    r = requests.get(f"{SUPABASE_URL}/rest/v1/snapshots?select=id&order=data.desc&limit=1",
                     headers=SUPA_HEADERS, timeout=30)
    r.raise_for_status()
    snaps = r.json()
    if not snaps:
        return {}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/precos"
                     f"?select=ingrediente_id,mediana_normalizada,qtd_resultados&snapshot_id=eq.{snaps[0]['id']}",
                     headers=SUPA_HEADERS, timeout=30)
    r.raise_for_status()
    return {p["ingrediente_id"]: (float(p["mediana_normalizada"]), p.get("qtd_resultados") or 0)
            for p in r.json()
            if p["ingrediente_id"] is not None and p["mediana_normalizada"] not in (None, 0)}


def carregar_catalogo():
    # ignora só itens de preço fixo (custo_fixo). Itens com preço manual TAMBÉM
    # são raspados: precisamos do preço online para o blend manual×online.
    url = (f"{SUPABASE_URL}/rest/v1/ingredientes"
           "?select=id,nome,busca,unidade,peso_ref_g,palavras_ok,palavras_nao"
           "&ativo=eq.true&unidade=neq.fixo&order=id")
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
    # pula itens já coletados com sucesso nos últimos 6 dias — assim um rerun pega
    # só o que faltou (manuais/não-encontrados). FORCE_RESCRAPE=1 força o full run.
    if os.getenv("FORCE_RESCRAPE") != "1":
        recentes = _ids_coletados_recentes(6)
        antes = len(cat)
        cat = [i for i in cat if i["id"] not in recentes]
        if antes != len(cat):
            print(f"⏭️  Pulando {antes - len(cat)} item(ns) com coleta nos últimos 6 dias "
                  f"(use FORCE_RESCRAPE=1 para raspar tudo)")
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
# Unidades reconhecidas e seus fatores para g/ml (ordem importa: kg antes de g).
_UNIDADES_QTD = [
    (r'kg',      1000),
    (r'litros?', 1000),
    (r'l\b',     1000),
    (r'ml\b',    1),
    (r'g\b',     1),
]
# Conector de multipack: "2x500g", "2 × 500 ml", "kit 3 pacotes de 500 g",
# "6 garrafas de 900 ml". O total é n × quantidade — usar só a quantidade da
# embalagem subcontava o anúncio e inflava o preço normalizado (COL-002).
_MULTIPACK = r'(\d+)\s*(?:[x×]|(?:pacotes?|garrafas?|latas?|caixas?|potes?|unidades?)\s+de)\s*'
# Açougue e hortifruti cotam o quilo SEM escrever o número: "Matambre bovino kg",
# "Cebola Nacional Kg", "CARNE DE SIRI LIMPA R$ / KG", "Costela cordeiro kg".
# O preço do anúncio já é o preço do quilo. Sem esta regra o título não tinha
# quantidade e a oferta era descartada: 244 das 550 rejeições por
# "sem_quantidade_no_titulo" da coleta de 10/08 eram deste formato, e é o que
# zerava o Matambre bovino em todas as coletas desde que ele entrou no catálogo.
_UNIDADE_SOZINHA = re.compile(r'\b(?:kg|quilos?|kilos?|litros?)\b')

def extrair_quantidade(titulo):
    titulo_lower = titulo.lower()
    for unidade, multiplicador in _UNIDADES_QTD:
        m = re.search(_MULTIPACK + r'(\d+[\.,]?\d*)\s*' + unidade, titulo_lower)
        if m:
            n = int(m.group(1))
            valor = float(m.group(2).replace(',', '.'))
            return n * valor * multiplicador
    for unidade, multiplicador in _UNIDADES_QTD:
        m = re.search(r'(\d+[\.,]?\d*)\s*' + unidade, titulo_lower)
        if m:
            valor = float(m.group(1).replace(',', '.'))
            return valor * multiplicador
    # último recurso, só depois de falharem todos os padrões COM número
    if _UNIDADE_SOZINHA.search(titulo_lower):
        return 1000.0
    return None

# ─── Extrator de contagem (ovo: unidades; maço: maços) ───────────────────────
def extrair_contagem(titulo):
    """Quantas unidades/maços o anúncio contém. Ex: 'ovos 30 unidades' → 30,
    '2 dúzias' → 24, 'cheiro verde 2 maços' → 2. Sem contagem explícita, 1."""
    titulo_lower = titulo.lower()
    # multiplicador explícito por padrão — o teste por substring no regex nunca
    # casava ('dúzia' não é substring de 'd[úu]zias?') e '2 dúzias' virava 2 (COL-001)
    padroes = [
        (r'(\d+)\s*d[úu]zias?', 12),
        (r'(\d+)\s*unidades?', 1), (r'bandeja\s*com\s*(\d+)', 1), (r'caixa\s*com\s*(\d+)', 1),
        (r'(\d+)\s*ovos', 1), (r'c/\s*(\d+)', 1), (r'(\d+)\s*maços?', 1), (r'kit\s*(\d+)', 1),
    ]
    for padrao, mult in padroes:
        m = re.search(padrao, titulo_lower)
        if m:
            return int(m.group(1)) * mult
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
def _casa_palavra(termo, texto):
    """Casamento por palavra inteira. Com substring pura, palavra_nao curta
    derrubava produto certo por coincidência de letras na coleta de 10/08:
    'kit' casava Kitano (a marca líder da Pimenta do reino, 3 ofertas),
    'pimenta' casava Pimentao, 'suco' casava 'Sucos Limão', 'sabor' casava
    Kisabor. Só o filtro de exclusão usa isto — palavras_ok segue por
    substring, que é o lado permissivo."""
    return re.search(rf'(?<![0-9a-zà-ÿ]){re.escape(termo.lower())}(?![0-9a-zà-ÿ])', texto) is not None


def produto_valido(titulo, ingrediente):
    titulo_lower = titulo.lower()
    for palavra in PALAVRAS_NAO_GLOBAIS:
        if _casa_palavra(palavra, titulo_lower):
            return False, f"global '{palavra}'"
    if not any(p.lower() in titulo_lower for p in ingrediente["palavras_ok"]):
        return False, "produto fora do escopo"
    for palavra in ingrediente["palavras_nao"]:
        if _casa_palavra(palavra, titulo_lower):
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
    vazio = None
    for _ in range(len(SERP_API_KEYS)):
        key = SERP_API_KEYS[_serp_idx]
        params = {
            "engine": "google_shopping", "q": query, "num": MAX_OFERTAS,
            "gl": "br", "hl": "pt", "location": "Brazil", "api_key": key,
        }
        # timeout de leitura da SerpAPI é intermitente e tirava o ingrediente do
        # snapshot na primeira falha (3 itens em 17/08). 60s + 1 retentativa na
        # MESMA conta: gasta no máximo 1 chamada extra por ingrediente afetado.
        resp = None
        for tentativa in (1, 2):
            try:
                resp = requests.get("https://serpapi.com/search", params=params, timeout=TIMEOUT_SERP)
                break
            except requests.RequestException as e:
                print(f"  ⏳ erro de rede ({tentativa}/2): {e}")
        if resp is None:
            print("  ❌ rede fora depois de 2 tentativas")
            return None
        try:
            dados = resp.json()
        except ValueError:
            dados = {}
        erro = dados.get("error", "")
        if resp.status_code == 200 and not erro:
            return dados
        # "Google hasn't returned any results" é intermitente no Google Shopping:
        # re-tentar a mesma busca em outra conta resgata a maioria (na coleta de
        # 01/07 o retry zerou os não-encontrados; em 09/07, sem retry, foram 22).
        if "returned any results" in erro:
            vazio = dados
            print(f"  ↻ sem resultados na conta #{_serp_idx + 1}; re-tentando na próxima")
            _serp_idx = (_serp_idx + 1) % len(SERP_API_KEYS)
            continue
        # 401/429 ou erro de cota → tenta a próxima conta
        print(f"  ⚠️  chave #{_serp_idx + 1} falhou ({resp.status_code} {erro}); tentando próxima")
        _serp_idx = (_serp_idx + 1) % len(SERP_API_KEYS)
    if vazio is not None:
        return vazio   # todas as contas devolveram vazio: sem resultados mesmo
    print("  ❌ Todas as chaves SerpAPI falharam/esgotaram")
    return None


def _registrar_descarte(saida, ingrediente, titulo, loja, link, preco_bruto, preco_normalizado, motivo):
    """Evidência de descarte (Fase 2, docs/021): oferta rejeitada vira registro
    com motivo no snapshot, em vez de sumir num print."""
    if saida is None:
        return
    saida.append({
        "ingrediente_id":    ingrediente["id"],
        "ingrediente":       ingrediente["nome"],
        "titulo":            titulo,
        "loja":              loja,
        "link":              link,
        "preco_bruto":       preco_bruto,
        "preco_normalizado": preco_normalizado,
        "motivo":            motivo,
    })


def buscar_ingrediente(ingrediente, cache, medianas_ant=None, descartados_out=None):
    chave = chave_cache(ingrediente)
    if chave in cache:
        # cache guarda só os aceitos; num rerun do mesmo dia os descartes não
        # são reavaliados (a coleta original já os registrou)
        print(f"\n💾 {ingrediente['nome']} → cache de hoje")
        return cache[chave]

    print(f"\n🔍 {ingrediente['nome']} → '{ingrediente['busca']}'")
    dados = _buscar_serp(ingrediente["busca"])
    if dados is None:
        # falha de infraestrutura (cota esgotada/rede), não fato de mercado:
        # None faz o main() deixar o ingrediente FORA do snapshot, em vez de
        # gravar qtd_resultados=0 e mandá-lo para a fila de leitura manual
        print("  ❌ busca falhou (cota/rede) — ingrediente fica FORA deste snapshot")
        return None
    itens = dados.get("shopping_results", [])
    if not itens:
        print("  ⚠️  Sem resultados")
        return []
    print(f"  📥 {len(itens)} ofertas devolvidas pela busca (processando até {MAX_OFERTAS})")

    resultados, rejeitados, motivos = [], 0, []
    for item in itens[:MAX_OFERTAS]:
        titulo    = item.get("title", "")
        preco_txt = item.get("price", "")
        loja      = item.get("source", "N/A")
        link      = item.get("product_link") or item.get("link") or item.get("url") or ""
        if not link:
            import urllib.parse
            qs = urllib.parse.urlencode({"q": ingrediente["busca"], "tbm": "shop"})
            link = f"https://www.google.com/search?{qs}"

        valido, motivo = produto_valido(titulo, ingrediente)
        if not valido:
            rejeitados += 1
            motivos.append((titulo, motivo))
            _registrar_descarte(descartados_out, ingrediente, titulo, loja, link,
                                limpar_preco(preco_txt), None, f"produto_invalido: {motivo}")
            continue
        preco = limpar_preco(preco_txt)
        if not preco:
            _registrar_descarte(descartados_out, ingrediente, titulo, loja, link, None, None, "preco_ilegivel")
            continue
        norm = normalizar(preco, titulo, ingrediente)
        if not norm:
            _registrar_descarte(descartados_out, ingrediente, titulo, loja, link, preco, None, "sem_quantidade_no_titulo")
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

    # anti-alta: descarta preço >50% acima da mediana do ingrediente na coleta
    # anterior (provável produto errado/embalagem menor inflando o preço).
    # Duas travas contra o laço de realimentação que matou a Pimenta do reino:
    # em 13/07 sobrou 1 anúncio a R$37,98/kg (o preço real é ~R$200/kg), esse
    # n=1 virou teto de R$56,97 e passou a descartar todas as ofertas boas das
    # coletas seguintes, congelando a série em 37,98 por 4 coletas até zerar.
    #   1. referência apurada sobre amostra pequena não vira teto;
    #   2. o filtro nunca zera o ingrediente — se ele cortaria TUDO, quem está
    #      errada é a referência, não o mercado.
    ref = (medianas_ant or {}).get(ingrediente["id"])
    med_ant, n_ant = ref if ref else (None, 0)
    inflados = 0
    if med_ant and n_ant >= AMOSTRA_MIN_REF:
        teto = med_ant * 1.5
        sobreviventes = [r for r in resultados if r["preco_normalizado"] <= teto]
        if resultados and not sobreviventes:
            print(f"  ⚠️  anti-alta cortaria TODAS as {len(resultados)} ofertas "
                  f"(teto R${teto * 1000:.2f}/kg vindo da coleta anterior) — "
                  f"referência provavelmente errada, filtro ignorado nesta rodada")
        else:
            for r in resultados:
                if r["preco_normalizado"] > teto:
                    _registrar_descarte(descartados_out, ingrediente, r["titulo"], r["loja"], r["link"],
                                        r["preco_bruto"], r["preco_normalizado"], f"alta_50pct: teto R${teto * 1000:.2f}/kg")
            inflados = len(resultados) - len(sobreviventes)
            resultados = sobreviventes
            if inflados:
                print(f"  🚫 {inflados} descartado(s) por preço >50% acima da coleta anterior "
                      f"(teto R${teto * 1000:.2f}/kg)")
    elif med_ant:
        print(f"  ℹ️  anti-alta desligado: coleta anterior teve só {n_ant} resultado(s) "
              f"(mínimo {AMOSTRA_MIN_REF} para servir de teto)")

    # sanidade (erro de vírgula) → depois outliers (dispersão)
    antes = len(resultados)
    norm = [r["preco_normalizado"] for r in resultados]
    norm = filtrar_sanidade(norm)
    norm = filtrar_outliers(norm)
    for r in resultados:
        if r["preco_normalizado"] not in norm:
            _registrar_descarte(descartados_out, ingrediente, r["titulo"], r["loja"], r["link"],
                                r["preco_bruto"], r["preco_normalizado"], "sanidade_ou_outlier")
    resultados = [r for r in resultados if r["preco_normalizado"] in norm]
    print(f"  ✅ {len(resultados)} válidos | {rejeitados} produto errado | "
          f"{antes - len(resultados)} descartados (sanidade/outlier)")
    # diagnóstico: se nada passou mas vieram produtos, mostra o que foi rejeitado e por quê
    if not resultados and motivos:
        print("  🔎 nenhum válido — títulos rejeitados:")
        for t, m in motivos[:8]:
            print(f"       - [{m}] {t}")

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

    # referência anti-alta: mediana de cada ingrediente na coleta anterior
    # (lida ANTES desta coleta gravar o snapshot novo)
    try:
        medianas_ant = medianas_coleta_anterior()
        print(f"🛡️  Filtro anti-alta ativo: referência de {len(medianas_ant)} ingredientes da coleta anterior (+50% = descarte)")
    except Exception as e:
        medianas_ant = {}
        print(f"⚠️  Filtro anti-alta desativado (falha ao ler a coleta anterior: {e})")

    cache, todos, resumo, descartados, falhas_busca = carregar_cache(), [], [], [], []
    for ing in catalogo:
        resultados = buscar_ingrediente(ing, cache, medianas_ant, descartados)
        # None = a busca não chegou a rodar (cota/rede). Fica fora do resumo:
        # sem linha em `precos`, o recálculo mantém o preço da coleta anterior
        # por carry-forward, em vez de registrar um zero que o admin lê como
        # "não encontrado" e sai cotando na mão à toa.
        if resultados is None:
            falhas_busca.append(ing["nome"])
            continue
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
    if falhas_busca:
        print(f"\n  ⚠️  {len(falhas_busca)} ingrediente(s) fora do snapshot por FALHA DE BUSCA "
              f"(cota/rede), não por ausência no mercado:")
        print(f"      {', '.join(falhas_busca)}")

    snapshot = {
        "data":          datetime.now().strftime("%Y-%m-%d"),
        "fonte":         "Google Shopping via SerpAPI",
        "resumo":        resumo,
        "resultados":    todos,
        "descartados":   descartados,
        "falhas_busca":  falhas_busca,
    }
    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Snapshot salvo em {SNAPSHOT_FILE}")
    print("✅ Concluído!")

if __name__ == "__main__":
    main()
