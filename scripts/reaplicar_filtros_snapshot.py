# -*- coding: utf-8 -*-
"""
Reaplica os filtros de exclusão do scraper a uma coleta JÁ GRAVADA: remove de
resultados_brutos as ofertas que as regras novas descartariam (palavras globais,
palavras_nao do ingrediente, decis extremos de preço) e recalcula a estatística
de `precos`. Nenhuma chamada à SerpAPI — trabalha só com o que está no banco.

As regras vêm de pipeline/scraper_pf.py (mesma implementação da coleta), exceto
palavras_ok: um item aceito não é reavaliado quanto a estar "fora do escopo".

    python scripts/reaplicar_filtros_snapshot.py 41            # simulação
    python scripts/reaplicar_filtros_snapshot.py 41 --aplicar  # grava

Depois de aplicar, recalcule os custos do snapshot (rpc integrar_snapshot).
"""
import os, sys, statistics
from collections import defaultdict
import requests

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline"))
from scraper_pf import (PALAVRAS_NAO_GLOBAIS, RADICAIS_NAO_GLOBAIS,  # noqa: E402
                        _casa_palavra, _casa_radical, _sem_acento, cortar_decis)
from salvar_supabase import calcular_stats, normalizado_para_exibicao  # noqa: E402

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


def get_all(tabela, query):
    linhas, off = [], 0
    while True:
        r = requests.get(f"{URL}/rest/v1/{tabela}?{query}&limit=1000&offset={off}", headers=H, timeout=60)
        r.raise_for_status()
        lote = r.json()
        linhas.extend(lote)
        if len(lote) < 1000:
            return linhas
        off += 1000


def motivo_exclusao(titulo, palavras_nao):
    """Por que a oferta seria descartada hoje, ou None se ela passa."""
    t = (titulo or "").lower()
    for palavra in PALAVRAS_NAO_GLOBAIS:
        if _casa_palavra(palavra, t):
            return f"produto_invalido: global '{palavra}'"
    t_simples = _sem_acento(t)
    for radical in RADICAIS_NAO_GLOBAIS:
        if _casa_radical(radical, t_simples):
            return f"produto_invalido: global '{radical}*'"
    for palavra in palavras_nao:
        if _casa_palavra(palavra, t):
            return f"produto_invalido: contém '{palavra}'"
    return None


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    sid = int(sys.argv[1])
    aplicar = "--aplicar" in sys.argv

    ings = {i["id"]: [p for p in (i.get("palavras_nao") or "").split("|") if p]
            for i in get_all("ingredientes", "select=id,palavras_nao")}
    brutos = get_all("resultados_brutos",
                     f"select=id,ingrediente_id,nome_ingrediente,titulo,loja,link,preco_bruto,"
                     f"preco_normalizado,exibicao&snapshot_id=eq.{sid}")
    precos = {p["ingrediente_id"]: p for p in
              get_all("precos", f"select=ingrediente_id,label,mediana_exibicao,qtd_resultados&snapshot_id=eq.{sid}")}
    print(f"snapshot {sid}: {len(brutos)} resultados brutos, {len(precos)} ingredientes")

    # 1. palavras (globais + palavras_nao do ingrediente)
    manter, cortar = defaultdict(list), []
    for r in brutos:
        motivo = motivo_exclusao(r["titulo"], ings.get(r["ingrediente_id"], []))
        if motivo:
            cortar.append((r, motivo))
        else:
            manter[r["ingrediente_id"]].append(r)
    print(f"  {len(cortar)} cortados por palavra")

    # 2. decis extremos, por ingrediente, sobre o que sobrou
    n_decil = 0
    for iid, linhas in manter.items():
        com_preco = [r for r in linhas if r["preco_normalizado"] is not None]
        mantidos, cortados = cortar_decis(sorted(com_preco, key=lambda r: float(r["preco_normalizado"])))
        for r in cortados:
            cortar.append((r, "decil_extremo"))
        n_decil += len(cortados)
        manter[iid] = mantidos + [r for r in linhas if r["preco_normalizado"] is None]
    print(f"  {n_decil} cortados pelos decis extremos")

    # 3. novas estatísticas
    mudancas = []
    for iid, p in precos.items():
        vals = sorted(float(r["preco_normalizado"]) for r in manter.get(iid, [])
                      if r["preco_normalizado"] is not None)
        med = statistics.median(vals) if vals else None
        antes = float(p["mediana_exibicao"]) if p["mediana_exibicao"] is not None else None
        depois = round(med * 1000, 2) if med is not None else None
        # a estatística é reescrita também quando só o n muda (mediana igual,
        # mas mínimo/máximo/desvio e qtd_resultados não são mais os gravados)
        if antes != depois or (p["qtd_resultados"] or 0) != len(vals):
            mudancas.append((iid, p["label"], antes, depois, len(vals), med, vals))
    print(f"  {len(mudancas)} ingredientes com estatística alterada")
    nomes = {r["ingrediente_id"]: r["nome_ingrediente"] for r in brutos}
    for iid, _label, antes, depois, n, _m, _v in sorted(
            mudancas, key=lambda x: -abs(((x[3] or 0) - (x[2] or 0)) / (x[2] or 1))):
        delta = f"{((depois - antes) / antes * 100):+.1f}%" if antes and depois and antes != depois else "="
        print(f"    {nomes.get(iid, iid)[:26]:<27} {antes} → {depois} ({delta})  "
              f"n={precos[iid]['qtd_resultados']}→{n}")

    if not aplicar:
        print("\nSIMULAÇÃO — nada gravado. Repita com --aplicar.")
        return

    # 4. evidência do descarte (append-only) antes de apagar o bruto
    obs = [{
        "fonte": "online_scrape", "snapshot_id": sid, "ingrediente_id": r["ingrediente_id"],
        "titulo": r["titulo"], "loja": r["loja"], "link": r.get("link", ""),
        "preco_bruto": r["preco_bruto"], "preco_normalizado": r["preco_normalizado"],
        "exibicao": None, "status": "rejected", "motivo": motivo,
    } for r, motivo in cortar]
    headers_obs = {**H, "Prefer": "return=minimal,resolution=ignore-duplicates"}
    for i in range(0, len(obs), 200):
        r = requests.post(f"{URL}/rest/v1/price_observations?on_conflict=fonte,dedup_hash",
                          headers=headers_obs, json=obs[i:i+200], timeout=60)
        if r.status_code not in (200, 201, 204):
            print(f"  ❌ observações lote {i//200 + 1}: {r.status_code} {r.text[:200]}"); sys.exit(1)
    print(f"  ✅ {len(obs)} observações gravadas como 'rejected'")

    # 5. apaga os brutos cortados
    ids = [r["id"] for r, _ in cortar]
    for i in range(0, len(ids), 100):
        lote = ",".join(str(x) for x in ids[i:i+100])
        r = requests.delete(f"{URL}/rest/v1/resultados_brutos?id=in.({lote})", headers=H, timeout=60)
        if r.status_code not in (200, 204):
            print(f"  ❌ delete lote {i//100 + 1}: {r.status_code} {r.text[:200]}"); sys.exit(1)
    print(f"  ✅ {len(ids)} resultados brutos removidos")

    # 6. reescreve a estatística de cada ingrediente afetado
    for iid, label, _antes, _depois, _n, med, vals in mudancas:
        media, mn, mx, dp = calcular_stats(vals)
        corpo = {
            "mediana_normalizada": round(med, 6) if med is not None else None,
            "mediana_exibicao":    normalizado_para_exibicao(med, label),
            "media_exibicao":      normalizado_para_exibicao(media, label),
            "minimo_exibicao":     normalizado_para_exibicao(mn, label),
            "maximo_exibicao":     normalizado_para_exibicao(mx, label),
            "desvio_padrao":       normalizado_para_exibicao(dp, label),
            "qtd_resultados":      len(vals),
        }
        r = requests.patch(f"{URL}/rest/v1/precos?snapshot_id=eq.{sid}&ingrediente_id=eq.{iid}",
                           headers={**H, "Prefer": "return=minimal"}, json=corpo, timeout=60)
        if r.status_code not in (200, 204):
            print(f"  ❌ precos ingrediente {iid}: {r.status_code} {r.text[:200]}"); sys.exit(1)
    print(f"  ✅ {len(mudancas)} linhas de precos atualizadas")
    print("\nFalta recalcular os custos: rpc integrar_snapshot(%d)." % sid)


if __name__ == "__main__":
    main()
