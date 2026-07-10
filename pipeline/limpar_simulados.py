"""
limpar_simulados.py
-------------------
Execute este script UMA VEZ POR SEMANA após salvar um novo snapshot real.
Ele deleta o snapshot simulado mais antigo, substituindo gradualmente
os 8 snapshots simulados por dados reais ao longo de 8 semanas.

Uso:
    python limpar_simulados.py

Após 8 execuções, todos os dados históricos serão reais.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def limpar_snapshot_simulado():
    # Busca todos os snapshots ordenados por data
    res = supabase.table("snapshots").select("id, data, simulado").order("data").execute()
    snapshots = res.data

    # Filtra apenas simulados
    simulados = [s for s in snapshots if s.get("simulado") == True]

    if not simulados:
        print("✅ Nenhum snapshot simulado restante — todos os dados são reais!")
        return

    # Deleta o mais antigo
    mais_antigo = simulados[0]
    snap_id = mais_antigo["id"]
    data = mais_antigo["data"]

    print(f"🗑️  Deletando snapshot simulado: {data} (id={snap_id})")

    # Deleta preços primeiro (FK)
    supabase.table("resultados_brutos").delete().eq("snapshot_id", snap_id).execute()
    supabase.table("precos").delete().eq("snapshot_id", snap_id).execute()
    supabase.table("snapshots").delete().eq("id", snap_id).execute()

    restantes = len(simulados) - 1
    print(f"✅ Removido! Snapshots simulados restantes: {restantes}")

    if restantes == 0:
        print("🎉 Histórico 100% real — pode remover este script do cron!")
    else:
        print(f"📅 Próxima execução em ~7 dias removerá: {simulados[1]['data']}")


if __name__ == "__main__":
    limpar_snapshot_simulado()
