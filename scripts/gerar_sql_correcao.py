# -*- coding: utf-8 -*-
"""
Coleta (SerpAPI) os 6 ingredientes corrigidos pela migration_13 e gera um .sql
com os INSERTs de precos + resultados_brutos no ÚLTIMO snapshot.

Usa subqueries por NOME para ingrediente_id e (select max(id)) para snapshot_id,
então roda depois da migration_13 sem depender dos ids serial.

Uso:  SERPAPI_KEY=... python scripts/gerar_sql_correcao.py
Saída: correcao_pratos.sql
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline"))

from scraper_pf import buscar_ingrediente, mediana
from salvar_supabase import calcular_stats, normalizado_para_exibicao

# nomes IDÊNTICOS aos da migration_13
ITENS = [
    {"id": 0, "nome": "Matambre bovino", "busca": "matambre bovino", "unidade": "g",
     "peso_ref_g": None, "palavras_ok": ["matambre"], "palavras_nao": []},
    {"id": 0, "nome": "Coxão duro bovino", "busca": "coxão duro", "unidade": "g",
     "peso_ref_g": None, "palavras_ok": ["coxão duro", "coxao duro"],
     "palavras_nao": ["coxão mole", "coxao mole", "moído", "moido"]},
    {"id": 0, "nome": "Filhote/Piraíba (peixe)", "busca": "piraíba peixe posta", "unidade": "g",
     "peso_ref_g": None, "palavras_ok": ["piraíba", "piraiba", "filhote"],
     "palavras_nao": ["ração", "racao", "cachorro", "gato", "cão", "cao", "pet"]},
    {"id": 0, "nome": "Lambari/Traíra (peixe)", "busca": "traíra peixe", "unidade": "g",
     "peso_ref_g": None, "palavras_ok": ["traíra", "traira", "lambari"],
     "palavras_nao": ["isca", "artificial", "silicone", "anzol", "chumbada", "conserva", "sardinha"]},
    {"id": 0, "nome": "Piranha (peixe)", "busca": "piranha peixe", "unidade": "g",
     "peso_ref_g": None, "palavras_ok": ["piranha"],
     "palavras_nao": ["cabelo", "prendedor", "alicate", "brinquedo", "pelúcia", "pelucia",
                      "tesoura", "grampo", "presilha"]},
    {"id": 0, "nome": "Radite (almeirão)", "busca": "almeirão maço", "unidade": "maco",
     "peso_ref_g": 300, "palavras_ok": ["almeirão", "almeirao", "radite", "radicchio",
                                        "chicória", "chicoria"], "palavras_nao": []},
]

SNAP = "(select max(id) from snapshots)"


def q(s):
    return "'" + (s or "").replace("'", "''") + "'"


def ing_id(nome):
    return f"(select id from ingredientes where nome = {q(nome)})"


def num(v):
    return "NULL" if v is None else repr(round(float(v), 6))


def main():
    linhas = ["-- Correção dos 6 pratos — preços coletados via SerpAPI.",
              "-- Rode DEPOIS da supabase_migration_13.sql, no SQL Editor.",
              "-- Idempotente: limpa os preços desses ingredientes no último snapshot antes de inserir.",
              ""]
    cache = {}
    for ing in ITENS:
        resultados = buscar_ingrediente(ing, cache)
        norm = [r["preco_normalizado"] for r in resultados if r["preco_normalizado"]]
        med = mediana(norm)
        label = "L" if ing["unidade"] == "ml" else "kg"
        n = ing["nome"]
        iid = ing_id(n)

        linhas.append(f"-- {n}: {len(resultados)} resultados válidos")
        linhas.append(f"delete from precos where snapshot_id = {SNAP} and ingrediente_id = {iid};")
        linhas.append(f"delete from resultados_brutos where snapshot_id = {SNAP} and ingrediente_id = {iid};")

        if not med:
            linhas.append(f"-- ATENÇÃO: 0 resultados para '{n}'. Considere preco_manual (R$/kg).")
            linhas.append("")
            continue

        media_n, min_n, max_n, dp_n = calcular_stats(norm)
        linhas.append(
            "insert into precos (snapshot_id, ingrediente_id, nome_ingrediente, mediana_normalizada, "
            "mediana_exibicao, media_exibicao, minimo_exibicao, maximo_exibicao, desvio_padrao, label, qtd_resultados) values ("
            f"{SNAP}, {iid}, {q(n)}, {num(med)}, {num(round(med*1000,2))}, "
            f"{num(normalizado_para_exibicao(media_n,label))}, {num(normalizado_para_exibicao(min_n,label))}, "
            f"{num(normalizado_para_exibicao(max_n,label))}, {num(normalizado_para_exibicao(dp_n,label))}, "
            f"{q(label)}, {len(resultados)});")

        vals = []
        for r in resultados:
            vals.append(
                f"  ({SNAP}, {iid}, {q(n)}, {q(r['titulo'])}, {r['preco_bruto']}, "
                f"{num(r['preco_normalizado'])}, {q(r['exibicao'])}, {q(r['loja'])}, {q(r.get('link',''))})")
        linhas.append(
            "insert into resultados_brutos (snapshot_id, ingrediente_id, nome_ingrediente, titulo, "
            "preco_bruto, preco_normalizado, exibicao, loja, link) values\n" + ",\n".join(vals) + ";")
        linhas.append("")

    out = "\n".join(linhas) + "\n"
    with open("correcao_pratos.sql", "w", encoding="utf-8") as f:
        f.write(out)
    print("\n" + "=" * 60)
    print("✅ SQL gerado em correcao_pratos.sql")


if __name__ == "__main__":
    main()
