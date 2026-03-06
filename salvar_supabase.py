import json
import requests
from datetime import datetime

# ─── Credenciais Supabase ─────────────────────────────────────────────────────
SUPABASE_URL = "https://zaeycrsfdrbdqiycmhuf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZXljcnNmZHJiZHFpeWNtaHVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTY0MzYsImV4cCI6MjA4ODIzMjQzNn0.NGzvAP25CghEFmmixfGia6qa6Uvfe3K_EQt6PaDyGKk"
SNAPSHOT_FILE = "snapshot_pf.json"

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

def supabase_post(tabela, dados):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}"
    resp = requests.post(url, headers=HEADERS, json=dados)
    if resp.status_code not in (200, 201):
        print(f"  ❌ Erro ao salvar em '{tabela}': {resp.status_code} - {resp.text[:200]}")
        return None
    return resp.json()

def supabase_get(tabela, filtro=""):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}?{filtro}"
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        return []
    return resp.json()

def main():
    # ── Carrega snapshot local ────────────────────────────────────────────────
    try:
        with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
            snapshot = json.load(f)
    except FileNotFoundError:
        print(f"❌ Arquivo {SNAPSHOT_FILE} não encontrado. Rode o scraper primeiro.")
        return

    data      = snapshot["data"]
    resumo    = snapshot["resumo"]
    resultados = snapshot["resultados"]

    print(f"📅 Salvando snapshot de {data} no Supabase...")
    print(f"   {len(resumo)} ingredientes | {len(resultados)} resultados brutos")

    # ── 1. Cria o snapshot ────────────────────────────────────────────────────
    existente = supabase_get("snapshots", f"data=eq.{data}")
    if existente:
        snapshot_id = existente[0]["id"]
        print(f"\n⚠️  Snapshot de {data} já existe (id={snapshot_id}). Pulando criação.")
    else:
        snap_resp = supabase_post("snapshots", {
            "data":           data,
            "fonte":          snapshot.get("fonte", "Google Shopping via SerpAPI"),
            "custo_total_pf": snapshot.get("custo_total_pf"),
        })
        if not snap_resp:
            return
        snapshot_id = snap_resp[0]["id"]
        print(f"\n✅ Snapshot criado (id={snapshot_id})")

    # ── 2. Salva preços por ingrediente ──────────────────────────────────────
    print(f"\n💾 Salvando preços dos ingredientes...")
    for r in resumo:
        dados = {
            "snapshot_id":         snapshot_id,
            "nome_ingrediente":    r["ingrediente"],
            "mediana_exibicao":    r["mediana_por_1000"],
            "label":               r["label"],
            "custo_porcao":        r["custo_porcao_r"],
            "qtd_resultados":      r["qtd_resultados"],
        }
        resp = supabase_post("precos", dados)
        status = "✅" if resp else "❌"
        print(f"  {status} {r['ingrediente']:<25} {r['mediana_por_1000'] or 'N/A'} {r['label'] or ''}")

    # ── 3. Salva resultados brutos ────────────────────────────────────────────
    print(f"\n💾 Salvando {len(resultados)} resultados brutos...")
    brutos_payload = []
    for r in resultados:
        brutos_payload.append({
            "snapshot_id":       snapshot_id,
            "nome_ingrediente":  r["ingrediente"],
            "titulo":            r["titulo"],
            "preco_bruto":       r["preco_bruto"],
            "preco_normalizado": r["preco_normalizado"],
            "exibicao":          r["exibicao"],
            "loja":              r["loja"],
            "link":              r.get("link", ""),
        })

    # Salva em lotes de 50
    LOTE = 50
    for i in range(0, len(brutos_payload), LOTE):
        lote = brutos_payload[i:i+LOTE]
        resp = supabase_post("resultados_brutos", lote)
        status = "✅" if resp else "❌"
        print(f"  {status} Lote {i//LOTE + 1}: {len(lote)} registros")

    # ── Resumo final ──────────────────────────────────────────────────────────
    print(f"\n{'='*50}")
    print(f"✅ Snapshot de {data} salvo com sucesso!")
    print(f"   Acesse: {SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
