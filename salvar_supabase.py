import json
import os
import math
import requests
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─── Credenciais Supabase ─────────────────────────────────────────────────────
SUPABASE_URL  = os.getenv("SUPABASE_URL", "https://zaeycrsfdrbdqiycmhuf.supabase.co")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY", "")
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

def supabase_patch(tabela, filtro, dados):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}?{filtro}"
    hdrs = {**HEADERS, "Prefer": "return=representation"}
    resp = requests.patch(url, headers=hdrs, json=dados)
    if resp.status_code not in (200, 204):
        print(f"  ❌ Erro ao atualizar '{tabela}': {resp.status_code} - {resp.text[:200]}")
        return None
    return resp.json() if resp.text else []

def supabase_get(tabela, filtro=""):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}?{filtro}"
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        return []
    return resp.json()

# ─── Estatísticas dos resultados brutos ───────────────────────────────────────
def calcular_stats(precos_norm):
    """Calcula média, min, max, desvio padrão de uma lista de preços normalizados."""
    if not precos_norm:
        return None, None, None, None
    n    = len(precos_norm)
    med  = sum(precos_norm) / n
    mn   = min(precos_norm)
    mx   = max(precos_norm)
    dp   = math.sqrt(sum((x - med) ** 2 for x in precos_norm) / n) if n > 1 else 0
    return round(med, 6), round(mn, 6), round(mx, 6), round(dp, 6)

def normalizado_para_exibicao(val, label):
    """Converte preco_normalizado (R$/g ou R$/ml) para exibição (R$/kg ou R$/L)."""
    if val is None:
        return None
    if label in ("kg", "kg*", "L"):
        return round(val * 1000, 2)
    if label == "bdj30":
        return round(val, 2)  # já é R$/bandeja
    return round(val * 1000, 2)

def main():
    # ── Carrega snapshot local ────────────────────────────────────────────────
    try:
        with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
            snapshot = json.load(f)
    except FileNotFoundError:
        print(f"❌ Arquivo {SNAPSHOT_FILE} não encontrado. Rode o scraper primeiro.")
        return

    data       = snapshot["data"]
    resumo     = snapshot["resumo"]
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

    # ── 2. Salva preços por ingrediente com estatísticas ─────────────────────
    print(f"\n💾 Salvando preços dos ingredientes...")

    # Agrupa resultados brutos por ingrediente para calcular stats
    brutos_por_ingrediente: dict = {}
    for r in resultados:
        nome = r["ingrediente"]
        if nome not in brutos_por_ingrediente:
            brutos_por_ingrediente[nome] = []
        brutos_por_ingrediente[nome].append(r["preco_normalizado"])

    for r in resumo:
        nome    = r["ingrediente"]
        label   = r["label"]
        precos  = brutos_por_ingrediente.get(nome, [])
        media_n, minimo_n, maximo_n, dp_n = calcular_stats(precos)

        # Converte para exibição (R$/kg ou R$/L)
        media_exib  = normalizado_para_exibicao(media_n, label)
        minimo_exib = normalizado_para_exibicao(minimo_n, label)
        maximo_exib = normalizado_para_exibicao(maximo_n, label)
        dp_exib     = normalizado_para_exibicao(dp_n, label)

        dados = {
            "snapshot_id":      snapshot_id,
            "nome_ingrediente": nome,
            "mediana_exibicao": r["mediana_por_1000"],
            "media_exibicao":   media_exib,
            "minimo_exibicao":  minimo_exib,
            "maximo_exibicao":  maximo_exib,
            "desvio_padrao":    dp_exib,
            "label":            label,
            "custo_porcao":     r["custo_porcao_r"],
            "qtd_resultados":   r["qtd_resultados"],
        }
        resp   = supabase_post("precos", dados)
        status = "✅" if resp else "❌"
        stats  = f"med={media_exib} min={minimo_exib} max={maximo_exib} dp=±{dp_exib}"
        print(f"  {status} {nome:<28} {r['mediana_por_1000'] or 'N/A':<8} {label:<6} | {stats}")

    # ── 3. Salva resultados brutos com links ──────────────────────────────────
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

    LOTE = 50
    for i in range(0, len(brutos_payload), LOTE):
        lote   = brutos_payload[i:i+LOTE]
        resp   = supabase_post("resultados_brutos", lote)
        status = "✅" if resp else "❌"
        print(f"  {status} Lote {i//LOTE + 1}: {len(lote)} registros")

    # ── Resumo final ──────────────────────────────────────────────────────────
    print(f"\n{'='*50}")
    print(f"✅ Snapshot de {data} salvo com sucesso!")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
