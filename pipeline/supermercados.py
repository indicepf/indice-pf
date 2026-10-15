"""Ofertas lidas direto do catálogo dos supermercados (plataforma VTEX).

O Google Shopping devolve ~40 cartões por busca, com composição que muda de
semana a semana e muito marketplace. Na coleta 49 (12/10/2026), de 4.917
ofertas, 1.196 saíram por marketplace, 1.090 por produto errado e 636 por
título sem peso. Estas lojas publicam o catálogo numa API pública da VTEX
(sem chave, sem crédito): nome do produto, preço, disponibilidade e unidade de
venda. As ofertas entram no MESMO filtro da SerpAPI (filtrar_ofertas), então
palavras_ok/palavras_nao, faixa de embalagem, teto anti-alta e outliers valem
igual.

Lojas testadas em 15/10/2026 (respondem sem cookie de região):
RJ Zona Sul, Prezunic · PR Super Muffato · SC Giassi, Bistek ·
SP Savegnago, Covabra, Mambo, Santa Luzia · MG Supernosso · SE/BA GBarbosa.
Sem resposta: Angeloni, Condor, Carrefour, Atacadão, Pão de Açúcar, Nordestão,
Koch, Comper e outras. Norte e Centro-Oeste ainda sem loja.
"""
import re
from concurrent.futures import ThreadPoolExecutor

import requests

LOJAS = [
    ("Zona Sul",      "www.zonasul.com.br"),
    ("Prezunic",      "www.prezunic.com.br"),
    ("Super Muffato", "www.supermuffato.com.br"),
    ("Giassi",        "www.giassi.com.br"),
    ("Bistek",        "www.bistek.com.br"),
    ("Savegnago",     "www.savegnago.com.br"),
    ("Covabra",       "www.covabra.com.br"),
    ("Mambo",         "www.mambo.com.br"),
    ("Santa Luzia",   "www.santaluzia.com.br"),
    ("Supernosso",    "www.supernosso.com"),
    ("GBarbosa",      "www.gbarbosa.com.br"),
]
POR_LOJA = 30
TIMEOUT = 20
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}

# Palavras da `busca` que servem ao Google e atrapalham a busca da loja: quando
# a frase não casa, a VTEX devolve produto qualquer ("sururu limpo congelado"
# trouxe detergente e açaí em 11 de 11 lojas). Peso e embalagem
# vêm do próprio catálogo, não precisam estar na frase.
_FORA_DA_BUSCA = {"kg", "g", "ml", "l", "un", "und", "unid", "unidade", "unidades", "maço", "maco",
                  "pacote", "pct", "lata", "pote", "garrafa", "peça", "peca", "bandeja", "padaria",
                  "congelado", "congelada", "resfriado", "resfriada", "fresco", "fresca",
                  "limpo", "limpa", "tradicional", "tipo"}
_QTD = re.compile(r'\d+[.,]?\d*\s*(?:kg|gr?s?|gramas?|ml|lts?|l)\b', re.I)


def termo_busca(busca):
    sem_qtd = _QTD.sub(" ", busca)
    palavras = [p for p in sem_qtd.split() if p.lower() not in _FORA_DA_BUSCA and not p.isdigit()]
    return " ".join(palavras) or busca


def titulo_preco_do_kg(nome):
    """Produto vendido a peso: na VTEX o `Price` é o do QUILO, qualquer que seja
    o peso escrito no nome. Conferido em 15/10/2026 pela simulação de carrinho
    em 5 lojas: "Cebola Miuda Bandeja 320g" no Savegnago custa 8,37 o kg (a
    bandeja sai 2,67); "Cebola Kg" no Muffato, passo de 0,25 kg, 5,10 o kg.
    Tira o peso do nome para o normalizador ler 1 kg."""
    return re.sub(r'\s+', ' ', _QTD.sub(" ", nome)).strip() + " (preço do kg)"


def _produtos(dominio, termo):
    r = requests.get(f"https://{dominio}/api/io/_v/api/intelligent-search/product_search/",
                     params={"query": termo, "count": POR_LOJA}, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json().get("products", [])


def converter(produto, nome_loja, dominio, ingrediente):
    """Produto da VTEX → oferta no formato da SerpAPI (title, price, source,
    link), ou None se não serve: indisponível, sem preço, fora de palavras_ok
    (a busca da loja devolve qualquer coisa quando não casa, e gravar isso como
    descarte só incharia price_observations), ou vendido a peso num ingrediente
    cotado por maço/unidade (preço do kg não é preço do maço)."""
    itens = produto.get("items") or []
    if not itens or not itens[0].get("sellers"):
        return None
    item = itens[0]
    oferta = item["sellers"][0].get("commertialOffer") or {}
    preco = oferta.get("Price") or 0
    if preco <= 0 or (oferta.get("AvailableQuantity") or 0) <= 0:
        return None
    nome = produto.get("productName") or ""
    if not any(p.lower() in nome.lower() for p in ingrediente["palavras_ok"]):
        return None
    if item.get("measurementUnit") == "kg":
        if ingrediente["unidade"] not in ("g", "ml"):
            return None
        nome = titulo_preco_do_kg(nome)
    return {"title": nome, "price": f"{preco:.2f}", "source": nome_loja,
            "link": f"https://{dominio}{produto.get('link', '')}"}


def ofertas_lojas(ingrediente):
    """Ofertas de todas as lojas para o ingrediente. Loja fora do ar é pulada:
    as outras e a SerpAPI seguem valendo."""
    termo = termo_busca(ingrediente["busca"])

    def uma(loja):
        nome_loja, dominio = loja
        try:
            return [o for o in (converter(p, nome_loja, dominio, ingrediente)
                                for p in _produtos(dominio, termo)) if o], None
        except (requests.RequestException, ValueError) as e:
            return [], f"{nome_loja} ({type(e).__name__})"

    with ThreadPoolExecutor(max_workers=len(LOJAS)) as ex:
        respostas = list(ex.map(uma, LOJAS))
    ofertas = [o for lista, _ in respostas for o in lista]
    falhas = [f for _, f in respostas if f]
    print(f"  🏪 {len(ofertas)} ofertas de supermercado ('{termo}')"
          + (f" — sem resposta: {', '.join(falhas)}" if falhas else ""))
    return ofertas
