# -*- coding: utf-8 -*-
"""
Popula (idempotente) as tabelas do modelo por prato a partir da tabela canônica:
  - ingredientes : 99 ingredientes-base (nome, categoria, busca, unidade, palavras_ok/nao)
  - pratos       : 100 pratos regionais
  - receitas     : prato × ingrediente × qtd_g (porção), exceto sentinelas

Pré-requisito: rodar supabase_migration.sql antes.
Requer env: SUPABASE_URL e SUPABASE_KEY (service_role).
Usa upsert (on_conflict) — pode rodar mais de uma vez sem duplicar.

    SUPABASE_URL=... SUPABASE_KEY=... python scripts/seed_supabase.py
"""
import os, sys
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(".env.local")
except ImportError:
    pass

sys.path.insert(0, os.path.dirname(__file__))
from mapa_canonico import BASE, consolidar, PRATO_ALIAS, PRATOS_INATIVOS  # noqa
from tripe_scraping import TRIPE
import gerar_tabela_canonica as G

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SENTINELAS = {"Água/Subproduto (sem custo)", "SEM COTAÇÃO (revisar)"}

if not SUPABASE_KEY:
    print("ERRO: defina SUPABASE_KEY (service_role) no ambiente."); sys.exit(1)

H = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
     "Content-Type": "application/json"}


def upsert(tabela, linhas, on_conflict):
    if not linhas:
        return
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{tabela}?on_conflict={on_conflict}",
        headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=linhas)
    if r.status_code not in (200, 201, 204):
        print(f"  ERRO upsert {tabela}: {r.status_code} {r.text[:300]}"); sys.exit(1)


def get_all(tabela, select):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{tabela}?select={select}", headers=H)
    r.raise_for_status()
    return r.json()


def main():
    # ── dados da tabela canônica ─────────────────────────────────────────────
    var2 = G.carregar_var2canon()
    linhas = G.carregar_linhas(var2)

    # receitas consolidadas: (regiao, prato, base) -> compra (qtd_g), PB, PC e meta
    from collections import defaultdict
    CAMPOS = ("qtd_g", "qtd_pb_g", "qtd_cozida_g", "qtd_meta_g")
    consol = {c: defaultdict(float) for c in CAMPOS}
    for l in linhas:
        for b, prop in G.bases_da_linha(l):
            if b in SENTINELAS:
                continue
            for c in CAMPOS:
                consol[c][(l["regiao"], l["prato"], b)] += (l[c] or 0) * prop

    chaves = consol["qtd_g"]
    bases = sorted({b for (_, _, b) in chaves})
    pratos = sorted({(r, p) for (r, p, _) in chaves})
    print(f"ingredientes={len(bases)} pratos={len(pratos)} receitas={len(chaves)}")

    # ── 1) ingredientes ──────────────────────────────────────────────────────
    # NUNCA enviar preco_manual/custo_fixo com None no upsert: o merge-duplicates
    # sobrescreve e APAGA os valores definidos pelo admin (foi a causa do bug de
    # 12/07 — pratos com item manual perderam o preço e o custo desabou). As
    # colunas só entram nas linhas em que o TRIPE define um valor.
    ing_rows, ing_rows_fx = [], []
    for b in bases:
        t = TRIPE[b]
        row = {
            "nome": b, "categoria": BASE.get(b, ""),
            "busca": t["busca"], "unidade": t["unidade"],
            "peso_ref_g": t.get("peso_ref_g"),
            "palavras_ok": "|".join(t["ok"]), "palavras_nao": "|".join(t["nao"]),
            "ativo": True}
        extra = {}
        if t.get("custo_fixo") is not None: extra["custo_fixo"] = t["custo_fixo"]
        if t.get("preco_manual") is not None: extra["preco_manual"] = t["preco_manual"]
        (ing_rows_fx if extra else ing_rows).append({**row, **extra} if extra else row)
    upsert("ingredientes", ing_rows, "nome")
    for r in ing_rows_fx:   # 1 a 1: chaves diferentes por linha
        upsert("ingredientes", [r], "nome")
    # desativa ingredientes que saíram do catálogo (ex.: bases consolidadas
    # desfeitas na explosão) — o scraper só coleta ativo=true
    todos = get_all("ingredientes", "id,nome,ativo")
    fora = [x for x in todos if x["nome"] not in set(bases) and x.get("ativo")]
    for x in fora:
        requests.patch(f"{SUPABASE_URL}/rest/v1/ingredientes?id=eq.{x['id']}",
                       headers={**H, "Prefer": "return=minimal"}, json={"ativo": False})
    if fora:
        print(f"  ✓ ingredientes desativados (fora do catálogo): {[x['nome'] for x in fora]}")
    print("  ✓ ingredientes")

    # ── 2) pratos ──────────────────────────────────────────────────────────
    upsert("pratos", [{"regiao": r, "nome": p, "ativo": True} for (r, p) in pratos], "regiao,nome")
    # pratos substituídos ficam no banco com ativo=false (fora de tudo)
    for r, p in PRATOS_INATIVOS:
        requests.patch(f"{SUPABASE_URL}/rest/v1/pratos?regiao=eq.{requests.utils.quote(r)}&nome=eq.{requests.utils.quote(p)}",
                       headers={**H, "Prefer": "return=minimal"}, json={"ativo": False})
    print("  ✓ pratos")

    # mapeia nomes -> ids
    ing_id = {x["nome"]: x["id"] for x in get_all("ingredientes", "id,nome")}
    prato_id = {(x["regiao"], x["nome"]): x["id"] for x in get_all("pratos", "id,regiao,nome")}

    # ── 3) receitas ──────────────────────────────────────────────────────────
    rec_rows = [{
        "prato_id": prato_id[(r, p)],
        "ingrediente_id": ing_id[b],
        "qtd_g": round(q, 1),                                        # compra (base do custo)
        "qtd_pb_g": round(consol["qtd_pb_g"][(r, p, b)], 1) or None,
        "qtd_cozida_g": round(consol["qtd_cozida_g"][(r, p, b)], 1) or None,
        "qtd_meta_g": round(consol["qtd_meta_g"][(r, p, b)], 1) or None,
    } for (r, p, b), q in chaves.items()]
    # receitas é totalmente derivada: apaga tudo e reinsere (evita linhas órfãs
    # quando o mapeamento de um ingrediente muda — ex: des-consolidação).
    requests.delete(f"{SUPABASE_URL}/rest/v1/receitas?id=gte.0", headers=H)
    for i in range(0, len(rec_rows), 200):
        upsert("receitas", rec_rows[i:i+200], "prato_id,ingrediente_id")
    print("  ✓ receitas")

    print("Seed concluído.")


if __name__ == "__main__":
    main()
