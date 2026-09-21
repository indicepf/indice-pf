"""Desfaz um reprocessamento, devolvendo precos/custos_pratos/snapshots ao backup.

O backup é o arquivo gerado antes de qualquer escrita, com as linhas inteiras
das três tabelas. Restaurar é regravar esses valores campo a campo — não apaga
linha nenhuma, então nada some se o backup estiver incompleto.

Uso:
    python3 scripts/restaurar_backup.py <arquivo.json> --conferir
    python3 scripts/restaurar_backup.py <arquivo.json> --tabela precos --snapshots 38
    python3 scripts/restaurar_backup.py <arquivo.json> --aplicar
"""
import os
import sys
import json
import argparse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replay_coleta import get_all, SUPABASE_URL, HEADERS  # noqa: E402

CAMPOS = {
    "precos": ["mediana_normalizada", "mediana_exibicao", "media_exibicao",
               "minimo_exibicao", "maximo_exibicao", "desvio_padrao", "qtd_resultados"],
    "custos_pratos": ["custo_total", "ingredientes_cobertos", "ingredientes_estimados",
                      "ingredientes_total"],
    "snapshots": ["custo_total_pf"],
}


def patch(tabela, linha_id, corpo):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{tabela}?id=eq.{linha_id}",
        data=json.dumps(corpo).encode(),
        headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="PATCH")
    with urllib.request.urlopen(req) as r:
        return r.status in (200, 204)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivo")
    ap.add_argument("--tabela", default="", help="restaura só esta tabela")
    ap.add_argument("--snapshots", default="", help="restaura só estes snapshot_id")
    ap.add_argument("--conferir", action="store_true", help="compara backup e banco, não escreve")
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()
    if not (args.conferir or args.aplicar):
        print("escolha --conferir ou --aplicar"); sys.exit(1)

    bkp = json.load(open(args.arquivo, encoding="utf-8"))
    print(f"backup de {bkp['quando']}")
    alvo_snaps = {int(s) for s in args.snapshots.split(",") if s.strip()} or None

    for tabela, campos in CAMPOS.items():
        if args.tabela and tabela != args.tabela:
            continue
        linhas = bkp[tabela]
        if alvo_snaps:
            chave = "id" if tabela == "snapshots" else "snapshot_id"
            linhas = [l for l in linhas if l.get(chave) in alvo_snaps]
        atual = {l["id"]: l for l in get_all(tabela, "*", "")}
        difs, restaurados = [], 0
        for l in linhas:
            a = atual.get(l["id"])
            if not a:
                difs.append((l["id"], "linha não existe mais no banco")); continue
            mudou = {c: l[c] for c in campos if a.get(c) != l.get(c)}
            if not mudou:
                continue
            difs.append((l["id"], mudou))
            if args.aplicar and patch(tabela, l["id"], mudou):
                restaurados += 1
        print(f"\n{tabela}: {len(linhas)} linhas no backup | {len(difs)} diferem do banco"
              f"{f' | {restaurados} restauradas' if args.aplicar else ''}")
        for lid, d in difs[:8]:
            print(f"   id={lid}: {d}")
        if len(difs) > 8:
            print(f"   ... e mais {len(difs) - 8}")
    if args.conferir:
        print("\n(só conferência — nada foi escrito)")


if __name__ == "__main__":
    main()
