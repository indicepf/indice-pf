# -*- coding: utf-8 -*-
"""
Recalcula custos_pratos e o índice de TODOS os snapshots do modelo novo
(data >= corte) chamando pipeline/calcular_custos_pratos.py para cada data.
Usado na virada para o modelo por meta servida (migração 36) — rodar depois
do seed_supabase.py.

    SUPABASE_URL=... SUPABASE_KEY=... python scripts/recalcular_snapshots.py
"""
import os, subprocess, sys
import requests

try:
    from dotenv import load_dotenv
    load_dotenv(); load_dotenv(".env.local")
except ImportError:
    pass

CORTE = "2026-06-21"   # espelha CORTE_COLETA de lib/format.ts
URL = os.getenv("SUPABASE_URL", "https://yhgdlmmtiyvdgeoxavzn.supabase.co")
KEY = os.getenv("SUPABASE_KEY", "")
if not KEY:
    print("ERRO: defina SUPABASE_KEY."); sys.exit(1)

H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
r = requests.get(f"{URL}/rest/v1/snapshots?select=data&data=gte.{CORTE}&order=data.asc", headers=H, timeout=30)
r.raise_for_status()
datas = [s["data"] for s in r.json()]
print(f"{len(datas)} snapshots a recalcular: {', '.join(datas)}")

raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for d in datas:
    print(f"\n=== {d} ===")
    ret = subprocess.run([sys.executable, os.path.join(raiz, "pipeline", "calcular_custos_pratos.py"), d])
    if ret.returncode != 0:
        print(f"FALHA em {d} — parado."); sys.exit(1)
print("\nRecalculo completo.")
