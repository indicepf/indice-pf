# Testes do leitor de preço da fonte fixa. Rodar: python3 pipeline/test_fonte_fixa.py
# Sai com código 1 se qualquer caso falhar.
#
# Os fixtures reproduzem a marcação real das lojas que o responsável já usava à
# mão para os itens que a busca nunca acha (conferido em 18/09/2026).
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fonte_fixa import ler_preco  # noqa: E402

# JSON-LD de página de produto única (organiaorganicos / Jambu)
PRODUTO_UNICO = """<html><head><title>Jambu Maço</title>
<script type="application/ld+json">
{"@type":"Product","name":"Jambu Maço","offers":{"@type":"Offer","price":5.99}}
</script></head><body>R$ 5,99</body></html>"""

# vitrine com vários Product: só vale o que casa com o <title> da página
# (a fonte da Pescada trazia quatro, o primeiro era picanha suína)
VITRINE = """<html><head><title>Traíras 1 kg - Peixaria Votuporanga</title>
<script type="application/ld+json">
[{"@type":"Product","name":"Traíras 1 kg","offers":{"price":14}},
 {"@type":"Product","name":"Corvina P. Limpas","offers":{"price":19.9}},
 {"@type":"Product","name":"Sardinha Inteira Kg","offers":{"price":32}}]
</script></head><body></body></html>"""

VITRINE_SEM_CASAR = """<html><head><title>Filet Pescada Espalmada</title>
<script type="application/ld+json">
[{"@type":"Product","name":"Picanha Suína temperada","offers":{"price":26.68}},
 {"@type":"Product","name":"Sassami Frango bandeja","offers":{"price":18.68}}]
</script></head><body></body></html>"""

# microdado sem JSON-LD (casadatilapia / Sururu)
META = """<html><head><title>SURURU 01 Kg</title>
<meta property="product:price:amount" content="35.00">
</head><body><h2 class="price">R$ 35,00</h2></body></html>"""

# preço com unidade ao lado, separado por comentário HTML (vendaspajeu / bode)
POR_QUILO = """<html><head><title>Carne de Carneiro Kg</title></head><body>
<span class="preco">R$ 47,24<span class="unit"> /<!-- -->kg</span></span></body></html>"""

SEM_PRECO = """<html><head><title>Costela de cordeiro</title></head>
<body><div id="root"></div></body></html>"""

CASOS = [
    ("produto único",          PRODUTO_UNICO,     5.99,  "jsonld"),
    ("vitrine casa com título", VITRINE,          14.0,  "jsonld"),
    ("vitrine sem casar",      VITRINE_SEM_CASAR, None,  None),
    ("microdado meta",         META,              35.0,  "meta"),
    ("preço por quilo",        POR_QUILO,         47.24, "unidade"),
    ("página sem preço",       SEM_PRECO,         None,  None),
]


def main():
    falhas = 0
    for nome, html, esperado, fonte_esperada in CASOS:
        preco, fonte = ler_preco(html)
        ok = preco == esperado and (esperado is None or fonte == fonte_esperada)
        falhas += 0 if ok else 1
        print(f"  {'ok ' if ok else 'FALHA'} {nome:<24} -> {preco} [{fonte}] "
              f"(esperado {esperado} [{fonte_esperada}])")
    print(f"\n{len(CASOS) - falhas}/{len(CASOS)} casos passaram")
    if falhas:
        sys.exit(1)


if __name__ == "__main__":
    main()
