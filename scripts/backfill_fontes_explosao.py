# -*- coding: utf-8 -*-
"""
Copia as FONTES (resultados_brutos) das bases fundidas para as bases novas da
explosão, nos snapshots do modelo novo até 09/07/2026 — complemento do
backfill_precos_explosao.py (que copiou só as medianas): o modal "fontes"
das bases explodidas ficava vazio no histórico.

Aprovado em 13/07/2026 (incluindo Feijão branco herdando do carioca — os
anúncios são a origem real do preço herdado/proxy).

IMPORTANTE: NÃO toca em precos.qtd_resultados (fica 0) — é o que impede o
skip de 6 dias do scraper de pular os itens novos na coleta seguinte.

Idempotente: pula (snapshot, ingrediente novo) que já tenha fontes.
Reversão exata: delete de resultados_brutos por ingrediente novo + snapshot <= 34.

    SUPABASE_URL=... SUPABASE_KEY=... python scripts/backfill_fontes_explosao.py
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

SNAPSHOTS = [32, 33, 34]   # 21/06, 01/07, 09/07 — modelo novo até a explosão

HERANCA = {
    "Acém bovino": ["Acém/Músculo bovino", "Peito bovino", "Matambre bovino"],
    "Carne seca/charque/sol": ["Carne seca/Charque", "Carne de sol"],
    "Linguiça calabresa/defumada": ["Linguiça calabresa", "Linguiça defumada", "Linguiça toscana (suína)"],
    "Lombo/Pernil suíno": ["Lombo suíno", "Pernil suíno"],
    "Bacon/Panceta": ["Panceta/Barriga suína", "Bacon"],
    "Queijo mussarela/prato": ["Queijo prato", "Queijo mussarela"],
    "Fubá/Flocão de milho": ["Fubá de milho", "Flocão de milho (cuscuz)"],
    "Molho/extrato de tomate": ["Extrato de tomate", "Molho de tomate (sachê)"],
    "Alface": ["Rúcula", "Escarola/Chicória"],
    "Pimenta": ["Pimenta do reino", "Pimenta (fresca)"],
    "Feijão carioca": ["Feijão branco"],
}
CAMPOS = ["snapshot_id", "titulo", "preco_bruto", "preco_normalizado", "exibicao", "loja", "link"]


def get_all(t, sel, extra=""):
    out, ini = [], 0
    while True:
        r = requests.get(f"{URL}/rest/v1/{t}?select={sel}{extra}",
                         headers={**H, "Range-Unit": "items", "Range": f"{ini}-{ini+999}"}, timeout=60)
        r.raise_for_status(); lote = r.json(); out += lote
        if len(lote) < 1000: break
        ini += 1000
    return out


def main():
    ings = {i["nome"]: i["id"] for i in get_all("ingredientes", "id,nome")}
    faltando = [n for par in HERANCA.items() for n in [par[0]] + par[1] if n not in ings]
    if faltando:
        print(f"ERRO: ingredientes ausentes: {faltando}"); sys.exit(1)

    snaps_in = ",".join(map(str, SNAPSHOTS))
    novas = []
    for velho, herdeiros in HERANCA.items():
        fontes = get_all("resultados_brutos", ",".join(CAMPOS),
                         f"&ingrediente_id=eq.{ings[velho]}&snapshot_id=in.({snaps_in})")
        for h in herdeiros:
            hid = ings[h]
            # idempotência: pula snapshot que já tem fontes para a base nova
            ja_tem = {x["snapshot_id"] for x in get_all(
                "resultados_brutos", "snapshot_id", f"&ingrediente_id=eq.{hid}&snapshot_id=in.({snaps_in})")}
            for f in fontes:
                if f["snapshot_id"] in ja_tem:
                    continue
                novas.append({**{c: f[c] for c in CAMPOS}, "ingrediente_id": hid, "nome_ingrediente": h})

    print(f"{len(novas)} fontes herdadas a inserir")
    for i in range(0, len(novas), 100):
        r = requests.post(f"{URL}/rest/v1/resultados_brutos",
                          headers={**H, "Prefer": "return=minimal"}, json=novas[i:i+100], timeout=60)
        if r.status_code not in (200, 201, 204):
            print(f"ERRO: {r.status_code} {r.text[:300]}"); sys.exit(1)
    print("Backfill de fontes concluído.")


if __name__ == "__main__":
    main()
