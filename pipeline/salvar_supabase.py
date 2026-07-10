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
SUPABASE_URL  = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY", "")
SNAPSHOT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snapshot_pf.json")

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

def supabase_post(tabela, dados):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}"
    resp = requests.post(url, headers=HEADERS, json=dados, timeout=60)
    if resp.status_code not in (200, 201):
        print(f"  ❌ Erro ao salvar em '{tabela}': {resp.status_code} - {resp.text[:200]}")
        return None
    return resp.json()

def supabase_get(tabela, filtro=""):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}?{filtro}"
    resp = requests.get(url, headers=HEADERS, timeout=60)
    if resp.status_code != 200:
        return []
    return resp.json()

def supabase_delete(url_relativa):
    """DELETE verificado: se a limpeza falhar (rede/permissão), aborta em vez de
    seguir para o INSERT — senão os dados antigos duplicam com os novos."""
    resp = requests.delete(f"{SUPABASE_URL}/rest/v1/{url_relativa}", headers=HEADERS, timeout=60)
    if resp.status_code not in (200, 204):
        print(f"  ❌ DELETE falhou ({resp.status_code}): {url_relativa} - {resp.text[:200]}")
        return False
    return True

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

    # guarda anti-sobrescrita: se a coleta veio TODA vazia (chave morta / sem rede),
    # aborta antes de apagar — não troca dados bons por nada.
    com_preco = sum(1 for r in resumo if r.get("mediana_normalizada") is not None)
    if resumo and com_preco == 0:
        print("🛑 Abortado: nenhum ingrediente veio com preço (falha de API/rede?). "
              "Nada foi apagado nem gravado.")
        return

    # modo merge: atualiza só os ingredientes raspados no ÚLTIMO snapshot,
    # sem apagar os demais preços (usado com SCRAPE_ONLY para correções pontuais).
    MERGE = os.getenv("SCRAPE_MERGE") == "1"

    # ── 1. Cria ou recupera snapshot ─────────────────────────────────────────
    if MERGE:
        ult = supabase_get("snapshots", "select=id,data&order=id.desc&limit=1")
        if not ult:
            print("❌ Nenhum snapshot existente para fazer merge."); return
        snapshot_id = ult[0]["id"]
        print(f"\n🔀 Modo merge: atualizando {len(resumo)} ingrediente(s) no snapshot id={snapshot_id} ({ult[0]['data']})")
        ids_csv = ",".join(str(r["ingrediente_id"]) for r in resumo)
        if not supabase_delete(f"precos?snapshot_id=eq.{snapshot_id}&ingrediente_id=in.({ids_csv})"):
            print("🛑 Abortado: limpeza dos preços do merge falhou."); return
        if not supabase_delete(f"resultados_brutos?snapshot_id=eq.{snapshot_id}&ingrediente_id=in.({ids_csv})"):
            print("🛑 Abortado: limpeza dos resultados brutos do merge falhou."); return
        _salvar_precos(snapshot_id, resumo, resultados)
        print(f"\n✅ Merge concluído. Rode calcular_custos_pratos.py para recalcular os custos.")
        return

    existente = supabase_get("snapshots", f"data=eq.{data}")
    if existente:
        snapshot_id = existente[0]["id"]
        print(f"\n⚠️  Snapshot de {data} já existe (id={snapshot_id}). Reescrevendo preços...")
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

    # ── 2-4. Limpa tudo do snapshot e regrava (run completo) ──────────────────
    print(f"\n🗑️  Limpando preços e resultados anteriores do snapshot {snapshot_id}...")
    if not supabase_delete(f"precos?snapshot_id=eq.{snapshot_id}"):
        print("🛑 Abortado: limpeza dos preços falhou."); return
    if not supabase_delete(f"resultados_brutos?snapshot_id=eq.{snapshot_id}"):
        print("🛑 Abortado: limpeza dos resultados brutos falhou."); return
    _salvar_precos(snapshot_id, resumo, resultados)

    print(f"\n{'='*50}")
    print(f"✅ Snapshot de {data} salvo com sucesso!")
    print(f"{'='*50}")


def _salvar_precos(snapshot_id, resumo, resultados):
    """Insere preços (resumo) e resultados brutos no snapshot. Não apaga nada —
    a limpeza (total ou por ingrediente) é responsabilidade do chamador."""
    brutos = {}
    for r in resultados:
        iid = r.get("ingrediente_id")
        pn  = r.get("preco_normalizado")
        if iid is not None and pn is not None:
            brutos.setdefault(iid, []).append(pn)

    print(f"💾 Salvando preços (INSERT)...")
    for r in resumo:
        iid     = r["ingrediente_id"]
        label   = r["label"]
        precos  = brutos.get(iid, [])
        media_n, minimo_n, maximo_n, dp_n = calcular_stats(precos)

        dados = {
            "snapshot_id":         snapshot_id,
            "ingrediente_id":      iid,
            "nome_ingrediente":    r["ingrediente"],
            "mediana_normalizada": r["mediana_normalizada"],   # R$/g (base do custo por prato)
            "mediana_exibicao":    r["mediana_exibicao"],       # R$/kg ou R$/L
            "media_exibicao":      normalizado_para_exibicao(media_n, label),
            "minimo_exibicao":     normalizado_para_exibicao(minimo_n, label),
            "maximo_exibicao":     normalizado_para_exibicao(maximo_n, label),
            "desvio_padrao":       normalizado_para_exibicao(dp_n, label),
            "label":               label,
            "qtd_resultados":      r["qtd_resultados"],
        }
        resp   = supabase_post("precos", dados)
        status = "✅" if (resp is not None) else "❌"
        print(f"  {status} {r['ingrediente']:<30} mediana={dados['mediana_exibicao']}/{label} "
              f"n={r['qtd_resultados']}")

    print(f"💾 Salvando {len(resultados)} resultados brutos...")
    payload = [{
        "snapshot_id":       snapshot_id,
        "ingrediente_id":    r.get("ingrediente_id"),
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


if __name__ == "__main__":
    main()
