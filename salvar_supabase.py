import json
import os
import math
import requests
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(".env.local")
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
    resp = requests.patch(url, headers=HEADERS, json=dados)
    if resp.status_code not in (200, 204):
        print(f"  ❌ Erro ao atualizar '{tabela}': {resp.status_code} - {resp.text[:200]}")
        return None
    return True

def supabase_get(tabela, filtro=""):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}?{filtro}"
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        return []
    return resp.json()

def calcular_stats(precos_norm):
    if not precos_norm:
        return None, None, None, None
    n   = len(precos_norm)
    med = sum(precos_norm) / n
    mn  = min(precos_norm)
    mx  = max(precos_norm)
    dp  = math.sqrt(sum((x - med) ** 2 for x in precos_norm) / n) if n > 1 else 0
    return round(med, 6), round(mn, 6), round(mx, 6), round(dp, 6)

def normalizado_para_exibicao(val, label):
    if val is None:
        return None
    if label in ("kg", "kg*", "L"):
        return round(val * 1000, 2)
    if label == "bdj30":
        return round(val, 2)
    return round(val * 1000, 2)

def main():
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

    # ── 1. Cria ou recupera snapshot ─────────────────────────────────────────
    existente = supabase_get("snapshots", f"data=eq.{data}")
    if existente:
        snapshot_id = existente[0]["id"]
        print(f"\n⚠️  Snapshot de {data} já existe (id={snapshot_id}).")
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

    # ── 2. Calcula stats e salva/atualiza preços ──────────────────────────────
    brutos_por_ingrediente = {}
    for r in resultados:
        brutos_por_ingrediente.setdefault(r["ingrediente"], []).append(r["preco_normalizado"])

    precos_existentes = supabase_get("precos", f"snapshot_id=eq.{snapshot_id}&select=nome_ingrediente")
    usar_update = len(precos_existentes) > 0
    print(f"\n💾 Salvando preços ({'PATCH' if usar_update else 'POST'})...")

    for r in resumo:
        nome    = r["ingrediente"]
        label   = r["label"]
        precos  = brutos_por_ingrediente.get(nome, [])
        media_n, minimo_n, maximo_n, dp_n = calcular_stats(precos)

        dados = {
            "snapshot_id":      snapshot_id,
            "nome_ingrediente": nome,
            "mediana_exibicao": r["mediana_por_1000"],
            "media_exibicao":   normalizado_para_exibicao(media_n, label),
            "minimo_exibicao":  normalizado_para_exibicao(minimo_n, label),
            "maximo_exibicao":  normalizado_para_exibicao(maximo_n, label),
            "desvio_padrao":    normalizado_para_exibicao(dp_n, label),
            "label":            label,
            "custo_porcao":     r["custo_porcao_r"],
            "qtd_resultados":   r["qtd_resultados"],
        }

        if usar_update:
            nome_enc = requests.utils.quote(nome)
            resp = supabase_patch("precos", f"snapshot_id=eq.{snapshot_id}&nome_ingrediente=eq.{nome_enc}", dados)
        else:
            resp = supabase_post("precos", dados)

        status = "✅" if (resp is not None) else "❌"
        med = dados["media_exibicao"]; mn = dados["minimo_exibicao"]; mx = dados["maximo_exibicao"]; dp = dados["desvio_padrao"]
        print(f"  {status} {nome:<28} med={med} min={mn} max={mx} dp=±{dp}")

    # ── 3. Salva resultados brutos (só se não existirem) ──────────────────────
    brutos_existentes = supabase_get("resultados_brutos", f"snapshot_id=eq.{snapshot_id}&select=id&limit=1")
    if brutos_existentes:
        print(f"\n⚠️  Resultados brutos já existem, pulando.")
    else:
        print(f"\n💾 Salvando {len(resultados)} resultados brutos...")
        payload = [{
            "snapshot_id":       snapshot_id,
            "nome_ingrediente":  r["ingrediente"],
            "titulo":            r["titulo"],
            "preco_bruto":       r["preco_bruto"],
            "preco_normalizado": r["preco_normalizado"],
            "exibicao":          r["exibicao"],
            "loja":              r["loja"],
            "link":              r.get("link", ""),
        } for r in resultados]

        LOTE = 50
        for i in range(0, len(payload), LOTE):
            lote = payload[i:i+LOTE]
            resp = supabase_post("resultados_brutos", lote)
            print(f"  {'✅' if resp else '❌'} Lote {i//LOTE + 1}: {len(lote)} registros")

    print(f"\n{'='*50}")
    print(f"✅ Snapshot de {data} salvo com sucesso!")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
