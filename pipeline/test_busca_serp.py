# Testes da rotação de contas da SerpAPI. Rodar: python3 pipeline/test_busca_serp.py
# Sai com código 1 se qualquer caso falhar.
#
# O que está sendo travado aqui: "Google hasn't returned any results" só pode
# virar qtd_resultados=0 (leia-se "não existe no mercado") quando TODAS as contas
# chegaram a responder. Na coleta de 14/09 a conta #1 ficou esgotada (429) o run
# inteiro, o vazio das outras três foi gravado como fato de mercado e 6
# ingredientes que na semana anterior tinham de 27 a 40 ofertas saíram do índice.
import os
import sys

os.environ.setdefault("SERPAPI_KEY", "k1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scraper_pf as S  # noqa: E402


class _Resp:
    def __init__(self, code, js):
        self.status_code, self._js = code, js

    def json(self):
        return self._js


VAZIO = {"error": "Google hasn't returned any results for this query."}
COTA  = {"error": "Your account has run out of searches."}
OK    = {"shopping_results": [{"title": "Arroz 5kg", "price": "R$ 20,00"}]}

# (nome, respostas por chamada, retorno esperado)
CASOS = [
    ("conta esgotada + 3 vazias", [VAZIO, VAZIO, VAZIO, COTA], "None"),
    ("4 contas vazias",           [VAZIO, VAZIO, VAZIO, VAZIO], "vazio"),
    ("vazio na 1a, ok na 2a",     [VAZIO, OK], "dados"),
    ("timeout na 1a, ok na 2a",   ["timeout", "timeout", OK], "dados"),
    ("timeout em todas",          ["timeout"] * 8, "None"),
]


def _rodar(respostas):
    S.SERP_API_KEYS = ["k1", "k2", "k3", "k4"]
    S._serp_idx = 0
    seq = list(respostas)
    original = S.requests.get

    def fake_get(url, params=None, timeout=None):
        r = seq.pop(0)
        if r == "timeout":
            raise S.requests.RequestException("read timed out")
        return _Resp(429 if r is COTA else 200, r)

    S.requests.get = fake_get
    try:
        obtido = S._buscar_serp("teste")
    finally:
        S.requests.get = original
    if obtido is None:
        return "None"
    return "vazio" if "error" in obtido else "dados"


# Ofertas lidas da resposta: lista principal + blocos categorizados ("Opções
# populares"), sem repetir a oferta que aparece nas duas. (nome, resposta, títulos)
_A = {"title": "Frango Inteiro Swift Kg", "source": "SS", "price": "R$ 8,50"}
_B = {"title": "Frango Seara Inteiro Congelado kg", "source": "Muffato", "price": "R$ 11,30"}
_C = {"title": "Big Chicken 1kg", "source": "Prezunic", "price": "R$ 31,99"}
CASOS_LISTAS = [
    ("só lista principal",   {"shopping_results": [_C]}, ["Big Chicken 1kg"]),
    ("principal + blocos",   {"shopping_results": [_C],
                              "categorized_shopping_results": [{"shopping_results": [_A]},
                                                               {"shopping_results": [_B]}]},
     ["Big Chicken 1kg", _A["title"], _B["title"]]),
    ("repetida entra 1 vez", {"shopping_results": [_A],
                              "categorized_shopping_results": [{"shopping_results": [_A, _B]}]},
     [_A["title"], _B["title"]]),
    ("só blocos",            {"categorized_shopping_results": [{"shopping_results": [_B]}]}, [_B["title"]]),
]


def main():
    falhas = 0
    for nome, respostas, esperado in CASOS:
        obtido = _rodar(respostas)
        ok = obtido == esperado
        falhas += 0 if ok else 1
        print(f"  {'ok ' if ok else 'FALHA'} {nome} -> {obtido} (esperado {esperado})")
    for nome, dados, esperado in CASOS_LISTAS:
        obtido = [i["title"] for i in S.ofertas_da_resposta(dados)]
        ok = obtido == esperado
        falhas += 0 if ok else 1
        print(f"  {'ok ' if ok else 'FALHA'} {nome} -> {len(obtido)} oferta(s)")
    total = len(CASOS) + len(CASOS_LISTAS)
    print(f"\n{total - falhas}/{total} casos passaram")
    if falhas:
        sys.exit(1)


if __name__ == "__main__":
    main()
