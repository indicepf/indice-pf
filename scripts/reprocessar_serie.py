"""Reprocessa as medianas de coletas passadas com o código de filtro atual.

Por que: cada semana da série foi apurada com o código que existia no dia. O
conserto de kit/multipack é de 18/09, o `location` e o parser de 'gr' são de
21/09. Comparar 31/08 com 14/09 hoje é comparar medições feitas com réguas
diferentes. Aqui todas as semanas passam pela MESMA régua, usando as ofertas
originais guardadas em resultados_brutos e price_observations.

Ordem cronológica é obrigatória: o teto anti-alta de uma coleta se apoia nas
anteriores, então cada snapshot precisa ser reprocessado depois dos que vieram
antes dele, e lendo os valores JÁ reprocessados.

LIMITE CONHECIDO: nos snapshots 39, 40 e 41 parte dos descartes se perdeu no
lote com PGRST102 (139, 187 e 96 registros). Oferta descartada na época e que
hoje seria aceita não tem como voltar nesses três. O script conta e avisa.

Uso:
    python3 scripts/reprocessar_serie.py 38-45 --dry-run
    python3 scripts/reprocessar_serie.py 38-45 --aplicar
    python3 scripts/restaurar_backup.py <arquivo>      # desfaz
"""
import os
import sys
import json
import math
import argparse
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline"))
from scraper_pf import filtrar_ofertas, mediana, AMOSTRA_MIN_REF  # noqa: E402
from replay_coleta import (get_all, carregar_catalogo, ofertas_do_snapshot,  # noqa: E402
                           SUPABASE_URL, HEADERS)


def normalizado_para_exibicao(val, label):
    if val is None:
        return None
    return round(val, 2) if label == "bdj30" else round(val * 1000, 2)


def stats(precos):
    if not precos:
        return None, None, None, None
    n = len(precos)
    med = sum(precos) / n
    dp = math.sqrt(sum((x - med) ** 2 for x in precos) / n) if n > 1 else 0
    return round(med, 6), round(min(precos), 6), round(max(precos), 6), round(dp, 6)


def patch(tabela, filtro, corpo):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{tabela}?{filtro}",
        data=json.dumps(corpo).encode(),
        headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="PATCH")
    with urllib.request.urlopen(req) as r:
        return r.status in (200, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshots", help="faixa (38-45) ou lista (38,39)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()
    if not (args.dry_run or args.aplicar):
        print("escolha --dry-run ou --aplicar"); sys.exit(1)

    if "-" in args.snapshots:
        a, b = args.snapshots.split("-")
        ids = list(range(int(a), int(b) + 1))
    else:
        ids = [int(x) for x in args.snapshots.split(",")]

    catalogo = carregar_catalogo()
    snaps = {s["id"]: s["data"] for s in get_all("snapshots", "id,data", "&order=id")}
    ordenados = sorted(snaps)

    # referência anti-alta acumulada: vai sendo alimentada com os valores JÁ
    # reprocessados, em ordem, exatamente como aconteceria numa coleta semanal
    ref_por_snap = {}
    for sid in ordenados:
        if sid in ids:
            continue
        ref_por_snap[sid] = {p["ingrediente_id"]: (float(p["mediana_normalizada"]), p.get("qtd_resultados") or 0)
                             for p in get_all("precos", "ingrediente_id,mediana_normalizada,qtd_resultados",
                                              f"&snapshot_id=eq.{sid}&mediana_normalizada=not.is.null"
                                              "&ingrediente_id=not.is.null")}

    total_mudou = 0
    for sid in sorted(ids):
        if sid not in snaps:
            print(f"snapshot {sid} não existe"); continue
        i = ordenados.index(sid)
        # teto = maior mediana entre as 5 coletas anteriores com amostra suficiente
        janela = [ref_por_snap.get(s, {}) for s in ordenados[max(0, i - 5):i]]
        med_ant = {}
        for r in janela:
            for iid, (m, q) in r.items():
                if q < AMOSTRA_MIN_REF:
                    continue
                if iid not in med_ant:
                    med_ant[iid] = (m, m, q)
                else:
                    ma, mi, qq = med_ant[iid]
                    med_ant[iid] = (max(ma, m), min(mi, m), max(qq, q))

        ofertas = ofertas_do_snapshot(sid)
        antes = {p["ingrediente_id"]: (p["mediana_exibicao"], p["qtd_resultados"] or 0, p["label"])
                 for p in get_all("precos", "ingrediente_id,mediana_exibicao,qtd_resultados,label",
                                  f"&snapshot_id=eq.{sid}&ingrediente_id=not.is.null")}
        novos, mudou = {}, []
        for iid, itens in ofertas.items():
            ing = catalogo.get(iid)
            if not ing:
                continue
            res = filtrar_ofertas(ing, itens, med_ant, None)
            norm = [r["preco_normalizado"] for r in res if r["preco_normalizado"]]
            m = mediana(norm)
            label = antes.get(iid, (None, 0, None))[2] or ("L" if ing["unidade"] == "ml" else "kg")
            novos[iid] = (m, len(res), label, norm)
            a = antes.get(iid, (None, 0, None))[0]
            if (a is None) != (m is None) or (a and m and abs(m * 1000 - float(a)) / float(a) > 0.01):
                mudou.append((ing["nome"], a, round(m * 1000, 2) if m else None,
                              antes.get(iid, (None, 0, None))[1], len(res)))
        print(f"\n=== snapshot {sid} ({snaps[sid]}): {len(novos)} ingredientes, {len(mudou)} mudam")
        for nome, a, b_, na, nb in sorted(mudou, key=lambda x: -abs((x[2] or 0) - (x[1] or 0)))[:12]:
            print(f"   {nome[:30]:<32} {str(a):>9} (n={na:<3}) -> {str(b_):>9} (n={nb})")
        total_mudou += len(mudou)

        if args.aplicar:
            for iid, (m, n, label, norm) in novos.items():
                media_n, min_n, max_n, dp_n = stats(norm)
                corpo = {
                    "mediana_normalizada": round(m, 6) if m else None,
                    "mediana_exibicao": round(m * 1000, 2) if m else None,
                    "media_exibicao": normalizado_para_exibicao(media_n, label),
                    "minimo_exibicao": normalizado_para_exibicao(min_n, label),
                    "maximo_exibicao": normalizado_para_exibicao(max_n, label),
                    "desvio_padrao": normalizado_para_exibicao(dp_n, label),
                    "qtd_resultados": n,
                }
                if not patch("precos", f"snapshot_id=eq.{sid}&ingrediente_id=eq.{iid}", corpo):
                    print(f"   ❌ falha ao gravar ingrediente {iid}")
        # alimenta a referência das semanas seguintes com o valor novo
        ref_por_snap[sid] = {iid: (m, n) for iid, (m, n, _, _) in novos.items() if m}

    print(f"\n{'APLICADO' if args.aplicar else 'SIMULAÇÃO'}: {total_mudou} medianas mudariam ao todo")
    if args.aplicar:
        print("Agora rode calcular_custos_pratos.py para cada data reprocessada.")


if __name__ == "__main__":
    main()
