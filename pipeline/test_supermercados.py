# Testes da leitura direta dos supermercados (VTEX). Rodar: python3 pipeline/test_supermercados.py
# Sai com código 1 se qualquer caso falhar. Não faz rede.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import supermercados as M  # noqa: E402
from scraper_pf import normalizar, limpar_preco, _junta_lojas  # noqa: E402

CEBOLA = {"nome": "Cebola", "unidade": "g", "palavras_ok": ["cebola"], "palavras_nao": []}
RUCULA = {"nome": "Rúcula", "unidade": "maco", "peso_ref_g": 100, "palavras_ok": ["rúcula"], "palavras_nao": []}


def _produto(nome, preco, mu="un", mult=1, disp=10):
    return {"productName": nome, "link": "/x/p",
            "items": [{"measurementUnit": mu, "unitMultiplier": mult,
                       "sellers": [{"commertialOffer": {"Price": preco, "AvailableQuantity": disp}}]}]}


def _kg(oferta, ing):
    """R$/kg que o normalizador do scraper tira da oferta convertida."""
    norm = normalizar(limpar_preco(oferta["price"]), oferta["title"], ing)
    return round(norm[0] * 1000, 2) if norm else None


CASOS_TERMO = [
    ("patinho bovino kg", "patinho bovino"),
    ("sururu limpo congelado", "sururu"),
    ("arroz branco tipo 1 5kg", "arroz branco"),
    ("cebola nacional kg", "cebola nacional"),
    ("ovo branco 30 unidades", "ovo branco"),
    ("kg", "kg"),                       # nada sobra: usa a busca original
]

# (nome, produto, ingrediente, R$/kg esperado ou None = oferta descartada)
CASOS_CONVERSAO = [
    # vendido a peso: o preço é o do quilo, o peso do nome não conta (Savegnago, 15/10)
    ("bandeja a peso",     _produto("Cebola Miuda Bandeja 320g", 8.37, "kg", 0.32), CEBOLA, 8.37),
    ("kg com passo 0,25",  _produto("Cebola Kg", 6.2, "kg", 0.25), CEBOLA, 6.2),
    # vendido por unidade: vale o peso do nome
    ("pacote de 1 kg",     _produto("Cebola Fugita 1kg", 14.49), CEBOLA, 14.49),
    ("pacote de 400 g",    _produto("Cebola Roxa 400g", 10.0), CEBOLA, 25.0),
    ("indisponível",       _produto("Cebola Kg", 6.2, "kg", 1, disp=0), CEBOLA, None),
    ("sem preço",          _produto("Cebola Kg", 0, "kg", 1), CEBOLA, None),
    ("fora de palavras_ok", _produto("Detergente Limão 500ml", 3.0), CEBOLA, None),
    # maço: preço do kg não é preço do maço
    ("maço vendido a peso", _produto("Rúcula kg", 40.0, "kg", 1), RUCULA, None),
    ("maço por unidade",   _produto("Rúcula Unidade", 3.99), RUCULA, 39.9),
]


def main():
    falhas = 0
    for busca, esperado in CASOS_TERMO:
        obtido = M.termo_busca(busca)
        ok = obtido == esperado
        falhas += 0 if ok else 1
        print(f"  {'ok ' if ok else 'FALHA'} termo '{busca}' -> '{obtido}' (esperado '{esperado}')")
    for nome, prod, ing, esperado in CASOS_CONVERSAO:
        oferta = M.converter(prod, "Loja", "www.loja.com.br", ing)
        obtido = _kg(oferta, ing) if oferta else None
        ok = obtido == esperado
        falhas += 0 if ok else 1
        print(f"  {'ok ' if ok else 'FALHA'} {nome} -> {obtido} (esperado {esperado})")
    # a mesma oferta no Google e na loja entra uma vez só
    google = [{"title": "Cebola Fugita 1kg", "price": "R$ 14,49", "source": "Mambo Supermercados"}]
    lojas = [{"title": "Cebola Fugita 1kg", "price": "14.49", "source": "Mambo"},
             {"title": "Cebola Kg (preço do kg)", "price": "6.20", "source": "Super Muffato"}]
    n = len(_junta_lojas(google, lojas))
    ok = n == 2
    falhas += 0 if ok else 1
    print(f"  {'ok ' if ok else 'FALHA'} repetida Google x loja -> {n} oferta(s) (esperado 2)")
    total = len(CASOS_TERMO) + len(CASOS_CONVERSAO) + 1
    print(f"\n{total - falhas}/{total} casos passaram")
    if falhas:
        sys.exit(1)


if __name__ == "__main__":
    main()
