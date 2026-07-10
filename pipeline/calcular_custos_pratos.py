# -*- coding: utf-8 -*-
"""
Calcula o custo de cada prato para um snapshot e grava em custos_pratos.

custo_total(prato) = Σ (preço R$/g do ingrediente × qtd_g da receita)
                   + Σ (custo_fixo dos ingredientes de preço fixo)

Regras:
  - Ingrediente de preço fixo (custo_fixo not null): soma custo_fixo (flat).
  - Ingrediente cotado neste snapshot: usa mediana_normalizada (R$/g) × qtd_g.
  - Ingrediente sem cotação nesta semana: usa o ÚLTIMO preço online conhecido
    (mediana_normalizada da coleta anterior mais recente) × qtd_g. Vale também no
    blend: se só o online faltou nesta semana, usa o último online × o manual atual.
  - Sem cotação e sem histórico: não contribui (prato fica parcial).

Cobertura gravada: ingredientes_cobertos (fresco+fixo), ingredientes_estimados
(fallback), ingredientes_total (tamanho da receita).
Também atualiza snapshots.custo_total_pf = mediana dos custos dos pratos.

Uso:
    python calcular_custos_pratos.py [YYYY-MM-DD]   # default: snapshot mais recente
Requer env: SUPABASE_URL, SUPABASE_KEY.
"""
import os, sys, statistics
from collections import defaultdict
from datetime import datetime, timedelta
import requests

try:
    from dotenv import load_dotenv
    load_dotenv(); load_dotenv(".env.local")
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
H = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
     "Content-Type": "application/json"}

if not SUPABASE_KEY:
    print("ERRO: defina SUPABASE_KEY no ambiente."); sys.exit(1)


def get_all(tabela, select, extra=""):
    """GET paginado (PostgREST limita a 1000 por página)."""
    linhas, passo, ini = [], 1000, 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{tabela}?select={select}{extra}"
        r = requests.get(url, headers={**H, "Range-Unit": "items",
                                       "Range": f"{ini}-{ini+passo-1}"}, timeout=60)
        r.raise_for_status()
        lote = r.json()
        linhas.extend(lote)
        if len(lote) < passo:
            break
        ini += passo
    return linhas


def main():
    # ── snapshot alvo ────────────────────────────────────────────────────────
    snaps = get_all("snapshots", "id,data", "&order=data.desc")
    if not snaps:
        print("Nenhum snapshot encontrado."); return
    if len(sys.argv) > 1:
        alvo = next((s for s in snaps if s["data"] == sys.argv[1]), None)
        if not alvo:
            print(f"Snapshot {sys.argv[1]} não encontrado."); return
    else:
        alvo = snaps[0]
    snap_id, snap_data = alvo["id"], alvo["data"]
    print(f"📅 Calculando custos do snapshot {snap_data} (id={snap_id})")

    # atualiza os preços manuais (mediana das leituras dos últimos 5 dias) antes de calcular
    try:
        requests.post(f"{SUPABASE_URL}/rest/v1/rpc/refresh_precos_manuais", headers=H, timeout=30)
    except requests.RequestException:
        pass

    data_por_snap = {s["id"]: s["data"] for s in snaps}

    # ── dados ──────────────────────────────────────────────────────────────
    ingredientes = {i["id"]: i for i in get_all("ingredientes", "id,nome,custo_fixo,preco_manual")}
    receitas     = get_all("receitas", "prato_id,ingrediente_id,qtd_g")
    pratos       = {p["id"]: p for p in get_all("pratos", "id,regiao,nome")}

    # preços do snapshot atual: ingrediente_id -> R$/g
    preco_atual = {}
    for p in get_all("precos", "ingrediente_id,mediana_normalizada",
                     f"&snapshot_id=eq.{snap_id}&mediana_normalizada=not.is.null"
                     "&ingrediente_id=not.is.null"):
        preco_atual[p["ingrediente_id"]] = float(p["mediana_normalizada"])

    # histórico p/ fallback: ingrediente_id -> [(data, R$/g)] de snapshots anteriores
    hist = defaultdict(list)
    for p in get_all("precos", "ingrediente_id,snapshot_id,mediana_normalizada",
                     "&mediana_normalizada=not.is.null&ingrediente_id=not.is.null"):
        d = data_por_snap.get(p["snapshot_id"])
        if d and d < snap_data:
            hist[p["ingrediente_id"]].append((d, float(p["mediana_normalizada"])))

    def ultimo_online(ing_id):
        # preço online da coleta ANTERIOR mais recente que teve o dado (último conhecido)
        h = sorted(hist.get(ing_id, []), reverse=True)
        return h[0][1] if h else None

    # manual da JANELA do snapshot: leituras de [data-10d, data+10d] por ingrediente → R$/g.
    # Só o manual dessa janela conta como "manual atual" (entra no blend / tag). Fora
    # dela NÃO é misturado com o online; serve só de fallback p/ itens de nicho sem
    # cotação online (via ingredientes.preco_manual).
    _d = datetime.strptime(snap_data, "%Y-%m-%d")
    _ini = (_d - timedelta(days=10)).strftime("%Y-%m-%dT00:00:00Z")
    _fim = (_d + timedelta(days=10)).strftime("%Y-%m-%dT23:59:59Z")
    man_rec = defaultdict(list)
    for h in get_all("precos_manuais_hist", "ingrediente_id,preco_manual,criado_em",
                     f"&preco_manual=not.is.null&ingrediente_id=not.is.null"
                     f"&criado_em=gte.{_ini}&criado_em=lte.{_fim}"):
        man_rec[h["ingrediente_id"]].append(float(h["preco_manual"]))

    def manual_recente(ing_id):
        vals = man_rec.get(ing_id)
        return statistics.median(vals) / 1000 if vals else None   # R$/g

    # ── custo por prato ──────────────────────────────────────────────────────
    por_prato = defaultdict(list)
    for r in receitas:
        por_prato[r["prato_id"]].append((r["ingrediente_id"], float(r["qtd_g"])))

    linhas, custos = [], []
    for prato_id, itens in por_prato.items():
        custo, cobertos, estimados = 0.0, 0, 0
        for ing_id, qtd in itens:
            ing = ingredientes.get(ing_id, {})
            cfixo = ing.get("custo_fixo")
            pman  = ing.get("preco_manual")
            m_rec  = manual_recente(ing_id)                          # manual da janela ±10d, R$/g
            m_last = float(pman) / 1000 if pman is not None else None # último manual conhecido (fallback)
            o_now = preco_atual.get(ing_id)                          # R$/g online desta coleta
            o_g   = o_now if o_now is not None else ultimo_online(ing_id)  # senão, último online conhecido
            o_fresco = o_now is not None
            if cfixo is not None:
                custo += float(cfixo); cobertos += 1                  # R$ flat por prato
            elif m_rec is not None and o_g is not None:
                custo += (m_rec + o_g) / 2 * qtd; cobertos += 1       # blend manual recente × online
            elif m_rec is not None:
                custo += m_rec * qtd; cobertos += 1                   # só manual recente
            elif o_g is not None:
                custo += o_g * qtd                                    # online (manual antigo não conta)
                cobertos += 1 if o_fresco else 0
                estimados += 0 if o_fresco else 1                     # online carregado da última coleta
            elif m_last is not None:
                custo += m_last * qtd; estimados += 1                 # último manual (nicho sem online)
            # sem preço algum: não contribui (parcial)
        linhas.append({
            "snapshot_id": snap_id, "prato_id": prato_id,
            "custo_total": round(custo, 2),
            "ingredientes_cobertos": cobertos,
            "ingredientes_estimados": estimados,
            "ingredientes_total": len(itens),
        })
        custos.append(custo)

    # ── grava (DELETE + INSERT idempotente) ───────────────────────────────────
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/custos_pratos?snapshot_id=eq.{snap_id}",
                        headers=H, timeout=60)
    if r.status_code not in (200, 204):
        print(f"  ❌ limpeza de custos_pratos falhou ({r.status_code}) — abortado para não duplicar"); return
    for i in range(0, len(linhas), 100):
        r = requests.post(f"{SUPABASE_URL}/rest/v1/custos_pratos",
                          headers={**H, "Prefer": "return=minimal"}, json=linhas[i:i+100], timeout=60)
        if r.status_code not in (200, 201, 204):
            print(f"  ❌ erro ao gravar custos_pratos: {r.status_code} {r.text[:200]}"); return

    # ── índice nacional: mediana dos custos dos pratos ────────────────────────
    indice = round(statistics.median(custos), 2) if custos else None
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/snapshots?id=eq.{snap_id}",
                       headers={**H, "Prefer": "return=minimal"},
                       json={"custo_total_pf": indice}, timeout=60)
    if r.status_code not in (200, 204):
        print(f"  ❌ falha ao gravar o índice no snapshot ({r.status_code})"); return

    completos = sum(1 for l in linhas if l["ingredientes_cobertos"] + l["ingredientes_estimados"] == l["ingredientes_total"])
    print(f"  ✅ {len(linhas)} pratos calculados | {completos} completos")
    print(f"  📊 índice (mediana dos pratos): R$ {indice}")
    print(f"  custo mín/máx: R$ {min(custos):.2f} / R$ {max(custos):.2f}")


if __name__ == "__main__":
    main()
