"""Replay de coleta: reaplica os filtros do scraper às ofertas JÁ GRAVADAS.

Por que existe: toda oferta que a SerpAPI devolveu está no banco — as aceitas em
`resultados_brutos` e as rejeitadas em `price_observations` (com título, loja e
preço). Dá para medir o efeito de qualquer mudança de filtro sobre as coletas
passadas sem gastar um crédito de API, e comparar com a mediana que foi
publicada na época.

Usa `filtrar_ofertas` do próprio scraper — não uma cópia. Se o replay e a coleta
divergissem, o replay não provaria nada.

Uso:
    python3 scripts/replay_coleta.py 46
    python3 scripts/replay_coleta.py 38-46 --resumo
    python3 scripts/replay_coleta.py 46 --so "Feijão preto,Ovo"

Sem mudança de filtro, o replay tem de reproduzir a mediana publicada. É isso que
`--resumo` mede: divergência > 1% é regressão do instrumento, não do filtro.
"""
import os
import sys
import json
import argparse
import collections
import urllib.request
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline"))
from scraper_pf import filtrar_ofertas, mediana, AMOSTRA_MIN_REF  # noqa: E402

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(".env.local")
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def get_all(tabela, select, extra=""):
    """GET paginado (PostgREST devolve no máximo 1000 por página)."""
    linhas, ini = [], 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{tabela}?select={select}{extra}"
        req = urllib.request.Request(url, headers={**HEADERS, "Range-Unit": "items",
                                                   "Range": f"{ini}-{ini + 999}"})
        lote = json.load(urllib.request.urlopen(req))
        linhas.extend(lote)
        if len(lote) < 1000:
            return linhas
        ini += 1000


def carregar_catalogo():
    cat = {}
    for i in get_all("ingredientes", "id,nome,busca,unidade,peso_ref_g,palavras_ok,palavras_nao"):
        i["palavras_ok"] = [p for p in (i.get("palavras_ok") or "").split("|") if p]
        i["palavras_nao"] = [p for p in (i.get("palavras_nao") or "").split("|") if p]
        cat[i["id"]] = i
    return cat


def ofertas_do_snapshot(snap_id, runs=None):
    """Reconstrói a lista que a SerpAPI devolveu, no formato que o filtro espera.

    As aceitas vêm de `resultados_brutos` porque ele preserva ofertas repetidas;
    `price_observations` colapsa duplicata exata pelo dedup_hash (7 de 1.489 na
    coleta 46). As rejeitadas só existem em price_observations.

    `runs` limita as rejeitadas a certos run_id. Recoleta do mesmo dia reescreve
    `resultados_brutos` mas só ACRESCENTA em price_observations (append-only), e
    sem o filtro o replay misturaria as ofertas das duas execuções.
    """
    filtro_run = f"&run_id=in.({','.join(str(r) for r in runs)})" if runs else ""
    por_ing = collections.defaultdict(list)
    for r in get_all("resultados_brutos", "ingrediente_id,titulo,preco_bruto,loja,link",
                     f"&snapshot_id=eq.{snap_id}&ingrediente_id=not.is.null"):
        por_ing[r["ingrediente_id"]].append(r)
    for o in get_all("price_observations", "ingrediente_id,titulo,preco_bruto,loja,link",
                     f"&snapshot_id=eq.{snap_id}&status=eq.rejected"
                     f"&ingrediente_id=not.is.null{filtro_run}"):
        por_ing[o["ingrediente_id"]].append(o)
    return {iid: [{"title": r["titulo"] or "",
                   "price": "" if r["preco_bruto"] is None else str(r["preco_bruto"]),
                   "source": r["loja"] or "N/A",
                   "link": r["link"] or ""} for r in lst]
            for iid, lst in por_ing.items()}


def medianas_de(snap_id):
    """(mediana R$/g, qtd) por ingrediente — referência anti-alta do snapshot dado."""
    return {p["ingrediente_id"]: (float(p["mediana_normalizada"]), p.get("qtd_resultados") or 0)
            for p in get_all("precos", "ingrediente_id,mediana_normalizada,qtd_resultados",
                             f"&snapshot_id=eq.{snap_id}&mediana_normalizada=not.is.null"
                             "&ingrediente_id=not.is.null")}


def publicado(snap_id):
    return {p["ingrediente_id"]: (p["mediana_exibicao"], p["qtd_resultados"] or 0)
            for p in get_all("precos", "ingrediente_id,mediana_exibicao,qtd_resultados",
                             f"&snapshot_id=eq.{snap_id}&ingrediente_id=not.is.null")}


def replay(snap_id, snap_anterior, catalogo, apenas=None, runs=None):
    ofertas = ofertas_do_snapshot(snap_id, runs)
    med_ant = medianas_de(snap_anterior) if snap_anterior else {}
    antes = publicado(snap_id)
    linhas = []
    for iid, itens in ofertas.items():
        ing = catalogo.get(iid)
        if not ing or (apenas and ing["nome"] not in apenas):
            continue
        resultados = filtrar_ofertas(ing, itens, med_ant, None)
        norm = [r["preco_normalizado"] for r in resultados if r["preco_normalizado"]]
        m = mediana(norm)
        pub_med, pub_n = antes.get(iid, (None, 0))
        linhas.append({
            "ingrediente": ing["nome"],
            "n_publicado": pub_n,
            "med_publicada": float(pub_med) if pub_med is not None else None,
            "n_replay": len(resultados),
            "med_replay": round(m * 1000, 2) if m else None,
        })
    return sorted(linhas, key=lambda x: x["ingrediente"])


def imprimir(snap_id, data, linhas, resumo):
    div = []
    for l in linhas:
        a, b = l["med_publicada"], l["med_replay"]
        if a is None and b is None:
            continue
        if a is None or b is None or abs(b - a) / a > 0.01:
            div.append(l)
    if not resumo:
        print(f"{'ingrediente':<34}{'n_pub':>6}{'med_pub':>10}{'n_new':>6}{'med_new':>10}")
        for l in linhas:
            print(f"{l['ingrediente'][:33]:<34}{l['n_publicado']:>6}"
                  f"{(l['med_publicada'] or 0):>10.2f}{l['n_replay']:>6}"
                  f"{(l['med_replay'] or 0):>10.2f}")
    print(f"\nsnapshot {snap_id} ({data}): {len(linhas)} ingredientes | "
          f"{len(div)} divergem do publicado em mais de 1%")
    for l in div[:20]:
        print(f"   {l['ingrediente'][:31]:<32} publicado {l['med_publicada']} (n={l['n_publicado']})"
              f"  ->  replay {l['med_replay']} (n={l['n_replay']})")
    if len(div) > 20:
        print(f"   ... e mais {len(div) - 20}")
    return div


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshots", help="id, lista (38,42) ou faixa (38-46)")
    ap.add_argument("--so", default="", help="só estes ingredientes, separados por vírgula")
    ap.add_argument("--resumo", action="store_true", help="só a contagem de divergências")
    ap.add_argument("--runs", default="", help="limita as rejeitadas a estes run_id (ex: 437,438,439)")
    args = ap.parse_args()

    if "-" in args.snapshots:
        a, b = args.snapshots.split("-")
        ids = list(range(int(a), int(b) + 1))
    else:
        ids = [int(x) for x in args.snapshots.split(",")]
    apenas = {n.strip() for n in args.so.split(",") if n.strip()} or None
    runs = [int(r) for r in args.runs.split(",") if r.strip()] or None

    snaps = {s["id"]: s["data"] for s in get_all("snapshots", "id,data", "&order=id")}
    ordenados = sorted(snaps)
    catalogo = carregar_catalogo()

    total_div = 0
    for sid in ids:
        if sid not in snaps:
            print(f"snapshot {sid} não existe"); continue
        i = ordenados.index(sid)
        anterior = ordenados[i - 1] if i > 0 else None
        linhas = replay(sid, anterior, catalogo, apenas, runs)
        total_div += len(imprimir(sid, snaps[sid], linhas, args.resumo))
    print(f"\ntotal de divergências: {total_div}")


if __name__ == "__main__":
    main()
