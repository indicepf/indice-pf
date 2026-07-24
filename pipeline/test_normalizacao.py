# Testes do normalizador de embalagem/quantidade (Fase 0D, COL-001/COL-002).
# Matriz de fixtures da auditoria docs/014 §8.1. Rodar: python3 pipeline/test_normalizacao.py
# Sai com código 1 se qualquer caso falhar.
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper_pf import extrair_quantidade, extrair_contagem  # noqa: E402

CASOS_CONTAGEM = [
    ("1 dúzia", 12),
    ("2 dúzias", 24),
    ("2 duzias", 24),
    ("ovos 30 unidades", 30),
    ("bandeja com 30", 30),
    ("caixa com 12", 12),
    ("cheiro verde 2 maços", 2),
    ("kit 3", 3),
    ("ovos brancos", 1),          # sem contagem explícita
]

CASOS_QUANTIDADE = [
    ("2x500 g", 1000.0),
    ("2x500g", 1000.0),
    ("2 × 500 ml", 1000.0),
    ("kit 3 pacotes de 500 g", 1500.0),
    ("1,5 kg", 1500.0),
    ("6 garrafas de 900 ml", 5400.0),
    ("arroz 5 kg", 5000.0),       # embalagem simples segue igual
    ("azeite 500 ml", 500.0),
    ("farinha de trigo 1kg", 1000.0),
    ("leite 2x1l", 2000.0),
    ("sem quantidade no título", None),
]

def main():
    falhas = 0
    for titulo, esperado in CASOS_CONTAGEM:
        obtido = extrair_contagem(titulo)
        ok = obtido == esperado
        falhas += 0 if ok else 1
        print(f"  {'ok ' if ok else 'FALHA'} contagem   {titulo!r} -> {obtido} (esperado {esperado})")
    for titulo, esperado in CASOS_QUANTIDADE:
        obtido = extrair_quantidade(titulo)
        ok = obtido == esperado
        falhas += 0 if ok else 1
        print(f"  {'ok ' if ok else 'FALHA'} quantidade {titulo!r} -> {obtido} (esperado {esperado})")
    total = len(CASOS_CONTAGEM) + len(CASOS_QUANTIDADE)
    print(f"\n{total - falhas}/{total} casos passaram")
    if falhas:
        sys.exit(1)

if __name__ == "__main__":
    main()
