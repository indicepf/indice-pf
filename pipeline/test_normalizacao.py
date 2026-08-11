# Testes do normalizador de embalagem/quantidade (Fase 0D, COL-001/COL-002).
# Matriz de fixtures da auditoria docs/014 §8.1. Rodar: python3 pipeline/test_normalizacao.py
# Sai com código 1 se qualquer caso falhar.
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper_pf import extrair_quantidade, extrair_contagem, produto_valido  # noqa: E402

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
    # quilo cotado sem número (açougue/hortifruti) — títulos reais do snapshot 40
    ("Matambre bovino kg", 1000.0),
    ("Matambre Best Beef Bb kg", 1000.0),
    ("Cebola Nacional Kg", 1000.0),
    ("CARNE DE SIRI LIMPA R$ / KG", 1000.0),
    ("Costela cordeiro cong kg carneiro sul", 1000.0),
    ("Camarão Cinza sem Cabeça M Resfriado Mambo Kg", 1000.0),
    # o número continua tendo precedência sobre o quilo solto
    ("Frango congelado 2,5 kg", 2500.0),
    ("Arroz 5kg tipo 1 preço por kg", 5000.0),
    # sem unidade nenhuma segue sem quantidade
    ("Matambre - 1953 (374453)", None),
    ("Camarão Cinza Fresco", None),
    ("Cenoura Extra Oba", None),
]

# (título, palavras_ok, palavras_nao, esperado_valido) — casos de casamento
# parcial que descartavam produto certo na coleta de 10/08
CASOS_PALAVRA = [
    ("Pimenta do Reino Kitano Preta Moída 50g", ["pimenta do reino"], ["kit"], True),
    ("Kitano Pimenta-do-reino preta moída 50g", ["reino"], ["kit"], True),
    ("Pimentao Verde kg", ["pimentão", "pimentao"], ["pimenta"], True),
    ("Limão Tahiti Fresco 1kg - Sucos Limão Taiti", ["limão"], ["suco"], True),
    ("Kisabor Maionese Tradicional", ["maionese"], ["sabor"], True),
    # o bloqueio de palavra inteira continua valendo
    ("Kit 3 Pimenta do Reino 50g", ["pimenta do reino"], ["kit"], False),
    ("Pimenta do Reino Smart com Moedor 50g", ["pimenta do reino"], ["moedor"], False),
    ("Óleo de Girassol Soya 900ml", ["óleo"], ["girassol"], False),
    ("Filé Mignon Gourmet", ["filé mignon"], [], False),   # palavra global
]

def main():
    falhas = 0
    for titulo, ok, nao, esperado in CASOS_PALAVRA:
        ing = {"palavras_ok": ok, "palavras_nao": nao}
        obtido, motivo = produto_valido(titulo, ing)
        passou = obtido == esperado
        falhas += 0 if passou else 1
        print(f"  {'ok ' if passou else 'FALHA'} palavra    {titulo!r} -> {obtido} ({motivo})")
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
    total = len(CASOS_CONTAGEM) + len(CASOS_QUANTIDADE) + len(CASOS_PALAVRA)
    print(f"\n{total - falhas}/{total} casos passaram")
    if falhas:
        sys.exit(1)

if __name__ == "__main__":
    main()
