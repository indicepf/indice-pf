"""Releitura da fonte fixa dos ingredientes que a coleta não achou.

Roda DEPOIS de salvar_supabase.py. Para cada ingrediente ativo que tem
`fonte_fixa_url` e fechou o último snapshot sem nenhuma oferta
(qtd_resultados = 0 ou sem linha em precos), abre a página, lê o preço,
converte para R$/kg com `fonte_fixa_qtd_g` e grava uma LEITURA MANUAL em
precos_manuais_hist com origem 'link'.

Não escreve em precos nem em resultados_brutos: isso aqui não é oferta de
mercado, é a mesma leitura que o admin faria à mão, feita pelo robô. O blend
manual×online e a janela de ±10 dias de calcular_custos_pratos.py seguem
valendo sem alteração.

FONTE_FIXA_DRY=1 lê e imprime sem gravar nada.
"""
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta
from urllib.parse import urlparse

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(".env.local")
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
           "Content-Type": "application/json"}
DRY = os.getenv("FONTE_FIXA_DRY") == "1"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9"}
# Loja de nicho é lenta e irregular: a fonte da Carne de bode respondeu em 1s,
# 19s e 27s em três tentativas seguidas. 45s + 1 retentativa, pelo mesmo motivo
# que a busca da SerpAPI tem: página fora do ar por um momento não é preço novo.
TIMEOUT = 45
# Guarda contra gravar lixo: o preço lido só vale se ficar entre 1/3 e 3x o
# preço manual que já está no cadastro. Fonte fixa é loja que o responsável já
# conhece — se o número saiu dessa faixa, ou a página mudou de produto ou o
# extrator pegou o campo errado, e nos dois casos é caso de olhar, não de gravar.
RAZAO_MIN, RAZAO_MAX = 1 / 3, 3.0


def _get(caminho):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{caminho}", headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


# ─── Extração do preço na página ─────────────────────────────────────────────
def _sem_acento(txt):
    return "".join(c for c in unicodedata.normalize("NFD", txt.lower())
                   if unicodedata.category(c) != "Mn")


def _titulo(html):
    m = re.search(r'<title[^>]*>(.*?)</title>', html, re.S | re.I)
    return _sem_acento(re.sub(r'\s+', ' ', m.group(1))) if m else ""


def _produtos_jsonld(html):
    """(nome, preço) de cada nó Product do JSON-LD (schema.org), que é o campo
    que a maioria das plataformas publica e o único que diz explicitamente que
    aquele número é o preço de um produto."""
    achados = []
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            dados = json.loads(m.group(1).strip())
        except ValueError:
            continue
        pilha = [dados]
        while pilha:
            no = pilha.pop()
            if isinstance(no, list):
                pilha.extend(no)
            elif isinstance(no, dict):
                tipo = no.get("@type")
                tipos = tipo if isinstance(tipo, list) else [tipo]
                if "Product" in tipos:
                    ofertas = no.get("offers")
                    if isinstance(ofertas, list):
                        ofertas = ofertas[0] if ofertas else None
                    preco = (ofertas or {}).get("price") if isinstance(ofertas, dict) else no.get("price")
                    if isinstance(preco, (str, int, float)):
                        achados.append((str(no.get("name") or ""), preco))
                for valor in no.values():
                    if isinstance(valor, (dict, list)):
                        pilha.append(valor)
    return achados


def _precos_jsonld(html):
    """Preço do produto DESTA página. Loja que lista vitrine ("veja também")
    publica um Product por item — a fonte da Pescada trazia quatro, sendo o
    primeiro uma picanha suína. Com mais de um preço, só vale o Product cujo
    nome aparece no <title> da página; sem casar nenhum, o JSON-LD é ambíguo e
    não serve."""
    produtos = _produtos_jsonld(html)
    if len({p for _, p in produtos}) <= 1:
        return [p for _, p in produtos]
    titulo = _titulo(html)
    return [p for nome, p in produtos if nome and _sem_acento(nome) in titulo]


def _precos_meta(html):
    """<meta itemprop="price"> e product:price:amount — o microdado que sobra
    quando a loja não publica JSON-LD."""
    padroes = [r'<meta[^>]+itemprop=["\']price["\'][^>]+content=["\']([^"\']+)',
               r'<meta[^>]+property=["\']product:price:amount["\'][^>]+content=["\']([^"\']+)',
               r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']product:price:amount["\']']
    return [v for p in padroes for v in re.findall(p, html, re.I)]


def _precos_por_unidade(html):
    """"R$ 47,24 <span class="unit">/kg</span>" — açougue e hortifruti que cotam
    o quilo costumam marcar a unidade ao lado do preço e não publicar microdado
    nenhum. É o caso da fonte da Carne de bode."""
    return re.findall(r'R\$\s*([\d.]{1,9},\d{2})(?:\s*<[^>]*>)*\s*/\s*(?:<[^>]*>\s*)*(?:kg|quilo)',
                      html, re.I)


def _para_float(valor):
    txt = str(valor).strip()
    if re.fullmatch(r'\d+[.,]\d{3,}', txt):      # "1.99000" / "0,00199"
        return float(txt.replace(',', '.'))
    if ',' in txt:
        txt = txt.replace('.', '').replace(',', '.')
    try:
        preco = float(re.sub(r'[^\d.]', '', txt))
    except ValueError:
        return None
    return preco if preco > 0 else None


def ler_preco(html):
    """Primeiro preço utilizável da página, na ordem de confiabilidade.
    Retorna (preço, de onde veio) ou (None, motivo)."""
    # comentário HTML no meio da marcação é comum e separava o preço da unidade
    # ("R$ 47,24<span class=unit> /<!-- -->kg</span>" na fonte da Carne de bode)
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    for nome, brutos in (("jsonld", _precos_jsonld(html)),
                         ("meta", _precos_meta(html)),
                         ("unidade", _precos_por_unidade(html))):
        for bruto in brutos:
            preco = _para_float(bruto)
            if preco:
                return preco, nome
    return None, "sem preço legível na página"


# ─── Gravação da leitura ─────────────────────────────────────────────────────
def _efetivo(ingrediente_id, novo):
    """Mesma regra do salvar_leitura_manual (migração 55/57): mediana das
    leituras dos últimos 5 dias, já contando a que acabou de entrar."""
    corte = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%S")
    linhas = _get(f"precos_manuais_hist?select=preco_manual&ingrediente_id=eq.{ingrediente_id}"
                  f"&preco_manual=not.is.null&criado_em=gte.{corte}")
    valores = sorted([float(x["preco_manual"]) for x in linhas] + [novo])
    meio = len(valores) // 2
    return valores[meio] if len(valores) % 2 else (valores[meio - 1] + valores[meio]) / 2


def gravar(ing, preco_kg, loja):
    hist = {"ingrediente_id": ing["id"], "nome": ing["nome"], "preco_manual": round(preco_kg, 2),
            "loja": loja, "link": ing["fonte_fixa_url"], "origem": "link"}
    r = requests.post(f"{SUPABASE_URL}/rest/v1/precos_manuais_hist", headers=HEADERS,
                      json=hist, timeout=30)
    if r.status_code not in (200, 201):
        return f"histórico: {r.status_code} {r.text[:120]}"
    efetivo = _efetivo(ing["id"], round(preco_kg, 2))
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/ingredientes?id=eq.{ing['id']}", headers=HEADERS,
                       json={"preco_manual": round(efetivo, 2), "preco_manual_loja": loja,
                             "preco_manual_link": ing["fonte_fixa_url"],
                             "preco_manual_em": datetime.now().astimezone().isoformat()},
                       timeout=30)
    if r.status_code not in (200, 204):
        return f"ingrediente: {r.status_code} {r.text[:120]}"
    return None


def main():
    try:
        fontes = _get("ingredientes?select=id,nome,fonte_fixa_url,fonte_fixa_qtd_g,preco_manual"
                      "&ativo=eq.true&fonte_fixa_url=not.is.null&order=id")
    except requests.HTTPError as e:
        # coluna inexistente = migração 58 ainda não rodou no SQL Editor. Não é
        # erro de coleta: sai em silêncio e os itens seguem na fila manual.
        if e.response is not None and e.response.status_code == 400:
            print("Colunas de fonte fixa ausentes — rode a migração 58 no SQL Editor. Nada a fazer.")
            return
        raise
    if not fontes:
        print("Nenhum ingrediente com fonte fixa cadastrada — nada a fazer.")
        return
    snaps = _get("snapshots?select=id,data&order=data.desc&limit=1")
    if not snaps:
        print("Nenhum snapshot no banco — nada a fazer.")
        return
    snapshot_id, data = snaps[0]["id"], snaps[0]["data"]
    com_oferta = {p["ingrediente_id"] for p in
                  _get(f"precos?select=ingrediente_id&snapshot_id=eq.{snapshot_id}&qtd_resultados=gt.0")}

    print(f"Fonte fixa — coleta de {data} (snapshot {snapshot_id}){' [DRY RUN]' if DRY else ''}")
    lidos = pulados = falhas = 0
    for ing in fontes:
        if ing["id"] in com_oferta:
            pulados += 1
            continue
        loja = urlparse(ing["fonte_fixa_url"]).netloc
        resp = erro_rede = None
        for tentativa in (1, 2):
            try:
                resp = requests.get(ing["fonte_fixa_url"], headers=UA, timeout=TIMEOUT, allow_redirects=True)
                resp.raise_for_status()
                break
            except requests.RequestException as e:
                resp, erro_rede = None, e
        if resp is None:
            print(f"  FALHA  {ing['nome']:<26} página fora do ar (2 tentativas): {str(erro_rede)[:60]}")
            falhas += 1
            continue

        preco, origem = ler_preco(resp.text)
        if not preco:
            print(f"  FALHA  {ing['nome']:<26} {origem} ({loja})")
            falhas += 1
            continue

        qtd = float(ing.get("fonte_fixa_qtd_g") or 1000)
        preco_kg = preco / (qtd / 1000)
        atual = float(ing["preco_manual"]) if ing["preco_manual"] is not None else None
        if atual and not (RAZAO_MIN <= preco_kg / atual <= RAZAO_MAX):
            print(f"  PULADO {ing['nome']:<26} R$ {preco_kg:.2f}/kg [{origem}] destoa do "
                  f"manual atual (R$ {atual:.2f}/kg) — página mudou? não gravei")
            falhas += 1
            continue

        alvo = f"(manual atual R$ {atual:.2f})" if atual else "(sem manual anterior)"
        if DRY:
            print(f"  leria  {ing['nome']:<26} R$ {preco_kg:.2f}/kg [{origem}] {alvo} {loja}")
            lidos += 1
            continue
        erro = gravar(ing, preco_kg, loja)
        if erro:
            print(f"  FALHA  {ing['nome']:<26} não gravou — {erro}")
            falhas += 1
        else:
            print(f"  OK     {ing['nome']:<26} R$ {preco_kg:.2f}/kg [{origem}] {alvo} {loja}")
            lidos += 1

    print(f"\n{lidos} leitura(s) de fonte fixa | {pulados} com oferta na coleta (não precisou) "
          f"| {falhas} sem leitura")
    # falha aqui não derruba a coleta: o ingrediente fica como estava, com o
    # preço manual anterior, e aparece na fila de leitura manual do admin.


if __name__ == "__main__":
    main()
