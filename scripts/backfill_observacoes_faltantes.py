# -*- coding: utf-8 -*-
"""
Repõe em price_observations as observações status='included' que faltam,
lendo APENAS resultados_brutos do próprio banco — nenhuma chamada à SerpAPI.

Buracos identificados em 17/08/2026:
  - snapshot 38 (27/07): o dual-write ainda não estava na main quando a coleta
    rodou, e o backfill da migração 46 já havia passado → 657 observações.
  - snapshots 39/40/41: o lote que cruzava a fronteira aceitos↔descartes era
    rejeitado com PGRST102 (corrigido em salvar_supabase._salvar_observacoes)
    → 61, 13 e 104 observações.

Só os ACEITOS são recuperáveis: eles são o próprio resultados_brutos. Os
descartes perdidos no mesmo lote (139/187/96) só existiam no snapshot_pf.json
do runner do GitHub Actions e não têm cópia no banco — reraspar não os traria
de volta (as ofertas de hoje são outras) e gastaria cota, então ficam como
lacuna conhecida da trilha de rejeições.

Idempotente: o unique (fonte, dedup_hash) + resolution=ignore-duplicates faz o
banco aceitar só o que falta. Rodar duas vezes insere 0 na segunda.

    python scripts/backfill_observacoes_faltantes.py --dry   # só o diagnóstico
    python scripts/backfill_observacoes_faltantes.py         # repõe
Requer env: SUPABASE_URL, SUPABASE_KEY.
"""
import os, sys
import requests

try:
    from dotenv import load_dotenv
    load_dotenv(); load_dotenv(".env.local")
except ImportError:
    pass

URL = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
KEY = os.getenv("SUPABASE_KEY", "")
if not KEY:
    print("ERRO: defina SUPABASE_KEY."); sys.exit(1)
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
DRY = "--dry" in sys.argv
LOTE = 200


def contar(tabela, filtro):
    r = requests.get(f"{URL}/rest/v1/{tabela}?select=id&{filtro}",
                     headers={**H, "Prefer": "count=exact", "Range": "0-0"}, timeout=60)
    r.raise_for_status()
    return int(r.headers["content-range"].split("/")[1])


def ler_brutos(snapshot_id):
    linhas, ini = [], 0
    while True:
        r = requests.get(f"{URL}/rest/v1/resultados_brutos"
                         f"?select=id,ingrediente_id,titulo,loja,link,preco_bruto,"
                         f"preco_normalizado,exibicao,criado_em&snapshot_id=eq.{snapshot_id}",
                         headers={**H, "Range-Unit": "items", "Range": f"{ini}-{ini + 999}"},
                         timeout=60)
        r.raise_for_status()
        lote = r.json()
        linhas.extend(lote)
        if len(lote) < 1000:
            return linhas
        ini += 1000


def repor(snapshot_id, brutos):
    """Insere as observações e devolve quantas linhas o banco realmente criou."""
    payload = [{
        "fonte":             "online_scrape",
        "snapshot_id":       snapshot_id,
        "ingrediente_id":    b["ingrediente_id"],
        "titulo":            b["titulo"],
        "loja":              b["loja"],
        "link":              b.get("link") or "",
        "preco_bruto":       b["preco_bruto"],
        "preco_normalizado": b["preco_normalizado"],
        "exibicao":          b["exibicao"],
        "status":            "included",
        "motivo":            None,
        # mesma marcação do backfill da migração 46: a linha vem do legado, não
        # de uma execução do pipeline (run_id fica nulo).
        "observed_at":       b["criado_em"],
        "legacy_table":      "resultados_brutos",
        "legacy_id":         b["id"],
    } for b in brutos]
    headers = {**H, "Prefer": "return=representation,resolution=ignore-duplicates"}
    inseridas = 0
    for i in range(0, len(payload), LOTE):
        r = requests.post(f"{URL}/rest/v1/price_observations?on_conflict=fonte,dedup_hash"
                          "&select=id", headers=headers, json=payload[i:i + LOTE], timeout=120)
        if r.status_code not in (200, 201):
            print(f"    ❌ lote {i // LOTE + 1}: {r.status_code} - {r.text[:200]}")
            continue
        inseridas += len(r.json())
    return inseridas


def main():
    snaps = requests.get(f"{URL}/rest/v1/snapshots?select=id,data&order=id.asc",
                         headers=H, timeout=60).json()
    total_falta = total_inserido = 0
    for s in snaps:
        rb = contar("resultados_brutos", f"snapshot_id=eq.{s['id']}")
        ob = contar("price_observations", f"snapshot_id=eq.{s['id']}&status=eq.included")
        if rb <= ob:
            continue
        print(f"snapshot {s['id']} ({s['data']}): brutos={rb} observações={ob} → faltam até {rb - ob}")
        total_falta += rb - ob
        if DRY:
            continue
        n = repor(s["id"], ler_brutos(s["id"]))
        total_inserido += n
        print(f"    ✅ {n} observações repostas "
              f"({rb - ob - n} eram ofertas idênticas que colapsam no dedup)")
    if DRY:
        print(f"\n[dry] lacuna total: {total_falta} observações (nenhuma escrita feita)")
    else:
        print(f"\n{total_inserido} observações repostas (lacuna aparente: {total_falta})")


if __name__ == "__main__":
    main()
