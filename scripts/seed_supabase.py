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
from mapa_canonico import BASE, consolidar, PRATO_ALIAS  # noqa
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

    # receitas consolidadas: (regiao, prato, base) -> qtd_g
    from collections import defaultdict
    consol = defaultdict(float)
    for l in linhas:
        if not l["canon"]:
            continue
        for b, prop in G.base_de(l["canon"]):
            if b in SENTINELAS:
                continue
            consol[(l["regiao"], l["prato"], b)] += (l["qtd_g"] or 0) * prop

    bases = sorted({b for (_, _, b) in consol})
    pratos = sorted({(r, p) for (r, p, _) in consol})
    print(f"ingredientes={len(bases)} pratos={len(pratos)} receitas={len(consol)}")

    # ── 1) ingredientes ──────────────────────────────────────────────────────
    ing_rows = []
    for b in bases:
        t = TRIPE[b]
        ing_rows.append({
            "nome": b, "categoria": BASE.get(b, ""),
            "busca": t["busca"], "unidade": t["unidade"],
            "peso_ref_g": t.get("peso_ref_g"), "custo_fixo": t.get("custo_fixo"),
            "preco_manual": t.get("preco_manual"),
            "palavras_ok": "|".join(t["ok"]), "palavras_nao": "|".join(t["nao"]),
            "ativo": True})
    upsert("ingredientes", ing_rows, "nome")
    print("  ✓ ingredientes")

    # ── 2) pratos ──────────────────────────────────────────────────────────
    upsert("pratos", [{"regiao": r, "nome": p} for (r, p) in pratos], "regiao,nome")
    print("  ✓ pratos")

    # mapeia nomes -> ids
    ing_id = {x["nome"]: x["id"] for x in get_all("ingredientes", "id,nome")}
    prato_id = {(x["regiao"], x["nome"]): x["id"] for x in get_all("pratos", "id,regiao,nome")}

    # ── 3) receitas ──────────────────────────────────────────────────────────
    rec_rows = [{
        "prato_id": prato_id[(r, p)],
        "ingrediente_id": ing_id[b],
        "qtd_g": round(q, 1),
    } for (r, p, b), q in consol.items()]
    # receitas é totalmente derivada: apaga tudo e reinsere (evita linhas órfãs
    # quando o mapeamento de um ingrediente muda — ex: des-consolidação).
    requests.delete(f"{SUPABASE_URL}/rest/v1/receitas?id=gte.0", headers=H)
    for i in range(0, len(rec_rows), 200):
        upsert("receitas", rec_rows[i:i+200], "prato_id,ingrediente_id")
    print("  ✓ receitas")

    print("Seed concluído.")


if __name__ == "__main__":
    main()
