# -*- coding: utf-8 -*-
"""
Continuidade de preço na explosão das consolidações (12/07/2026).

As bases desfeitas (ex.: 'Carne seca/charque/sol') têm histórico de preço;
as bases novas (ex.: 'Carne de sol') não têm. Sem backfill, o recálculo dos
snapshots antigos perderia esses ingredientes (prato parcial) e o histórico
ficaria mais barato artificialmente.

Este script copia, em cada snapshot com preço, a linha de `precos` da base
antiga para cada base nova derivada (mesma mediana — era exatamente o proxy
usado até aqui), com qtd_resultados=0 (sem produtos coletados; não engana o
skip de 6 dias do scraper nem o modal de fontes). A partir da 1ª coleta real,
cada base passa a ter preço próprio.

Idempotente: pula (snapshot, ingrediente) que já tem linha.

    SUPABASE_URL=... SUPABASE_KEY=... python scripts/backfill_precos_explosao.py
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

# base antiga (com histórico) -> bases novas que herdam o preço até a 1ª coleta
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
    "Feijão carioca": ["Feijão branco"],   # proxy até a 1ª coleta do feijão branco
}
CAMPOS = ["mediana_normalizada", "mediana_exibicao", "media_exibicao",
          "minimo_exibicao", "maximo_exibicao", "desvio_padrao", "label"]


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
        print(f"ERRO: ingredientes ausentes no banco (rode o seed antes): {faltando}"); sys.exit(1)

    precos = get_all("precos", "snapshot_id,ingrediente_id," + ",".join(CAMPOS),
                     "&mediana_normalizada=not.is.null&ingrediente_id=not.is.null")
    por_par = {(p["snapshot_id"], p["ingrediente_id"]): p for p in precos}
    existentes = set(por_par)

    novas = []
    for velho, herdeiros in HERANCA.items():
        vid = ings[velho]
        for (snap, iid), p in por_par.items():
            if iid != vid:
                continue
            for h in herdeiros:
                hid = ings[h]
                if (snap, hid) in existentes:
                    continue
                linha = {c: p[c] for c in CAMPOS}
                linha.update({"snapshot_id": snap, "ingrediente_id": hid,
                              "nome_ingrediente": h, "qtd_resultados": 0})
                novas.append(linha)
                existentes.add((snap, hid))

    print(f"{len(novas)} linhas de preço herdado a inserir")
    for i in range(0, len(novas), 100):
        r = requests.post(f"{URL}/rest/v1/precos",
                          headers={**H, "Prefer": "return=minimal"}, json=novas[i:i+100], timeout=60)
        if r.status_code not in (200, 201, 204):
            print(f"ERRO ao inserir: {r.status_code} {r.text[:300]}"); sys.exit(1)
    print("Backfill concluído.")


if __name__ == "__main__":
    main()
