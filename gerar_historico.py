import json
import requests
import random
from datetime import datetime, timedelta

# ─── Credenciais Supabase ─────────────────────────────────────────────────────
SUPABASE_URL = "https://zaeycrsfdrbdqiycmhuf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZXljcnNmZHJiZHFpeWNtaHVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTY0MzYsImV4cCI6MjA4ODIzMjQzNn0.NGzvAP25CghEFmmixfGia6qa6Uvfe3K_EQt6PaDyGKk"

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

# ─── Preços reais de hoje (base para simulação) ───────────────────────────────
PRECOS_BASE = [
    {"ingrediente": "Arroz Branco",            "preco": 4.80,   "label": "kg",    "custo_porcao": 0.384},
    {"ingrediente": "Feijão Carioca",           "preco": 7.95,   "label": "kg",    "custo_porcao": 0.636},
    {"ingrediente": "Óleo de Soja",             "preco": 9.66,   "label": "L",     "custo_porcao": 0.097},
    {"ingrediente": "Frango (coxa/sobrecoxa)",  "preco": 13.99,  "label": "kg",    "custo_porcao": 2.798},
    {"ingrediente": "Carne Bovina",             "preco": 41.45,  "label": "kg",    "custo_porcao": 6.217},
    {"ingrediente": "Ovo",                      "preco": 23.90,  "label": "bdj30", "custo_porcao": 1.593},
    {"ingrediente": "Bisteca Suína",            "preco": 24.94,  "label": "kg",    "custo_porcao": 4.490},
    {"ingrediente": "Macarrão Espaguete",       "preco": 8.26,   "label": "kg",    "custo_porcao": 0.661},
    {"ingrediente": "Farinha de Mandioca",      "preco": 11.70,  "label": "kg",    "custo_porcao": 0.351},
    {"ingrediente": "Batata Inglesa",           "preco": 5.51,   "label": "kg",    "custo_porcao": 0.827},
    {"ingrediente": "Mandioca",                 "preco": 9.16,   "label": "kg",    "custo_porcao": 1.374},
    {"ingrediente": "Alface",                   "preco": 14.07,  "label": "kg*",   "custo_porcao": 0.422},
    {"ingrediente": "Tomate",                   "preco": 10.59,  "label": "kg",    "custo_porcao": 0.529},
    {"ingrediente": "Pepino",                   "preco": 8.98,   "label": "kg",    "custo_porcao": 0.359},
    {"ingrediente": "Cenoura",                  "preco": 5.34,   "label": "kg",    "custo_porcao": 0.214},
    {"ingrediente": "Beterraba",                "preco": 14.99,  "label": "kg",    "custo_porcao": 0.600},
    {"ingrediente": "Alho",                     "preco": 28.90,  "label": "kg",    "custo_porcao": 0.144},
    {"ingrediente": "Cebola",                   "preco": 4.50,   "label": "kg",    "custo_porcao": 0.135},
    {"ingrediente": "Sal",                      "preco": 3.39,   "label": "kg",    "custo_porcao": 0.007},
    {"ingrediente": "Colorau",                  "preco": 28.80,  "label": "kg",    "custo_porcao": 0.058},
    {"ingrediente": "Pimenta do Reino",         "preco": 109.95, "label": "kg",    "custo_porcao": 0.110},
    {"ingrediente": "Extrato de Tomate",        "preco": 9.37,   "label": "kg",    "custo_porcao": 0.188},
    {"ingrediente": "Caldo de Galinha",         "preco": 40.26,  "label": "kg",    "custo_porcao": 0.201},
    {"ingrediente": "Cheiro-verde",             "preco": 81.39,  "label": "kg",    "custo_porcao": 0.407},
    {"ingrediente": "Azeite de Oliva",          "preco": 49.98,  "label": "L",     "custo_porcao": 0.250},
    {"ingrediente": "Limão",                    "preco": 6.49,   "label": "kg",    "custo_porcao": 0.065},
    {"ingrediente": "Vinagre",                  "preco": 4.13,   "label": "L",     "custo_porcao": 0.021},
]

# ─── Tendências por ingrediente (simulando comportamento real) ────────────────
# Positivo = tendência de alta, negativo = tendência de queda
# Baseado em sazonalidade real do mercado brasileiro
TENDENCIAS = {
    "Arroz Branco":           -0.003,  # leve queda (safra boa)
    "Feijão Carioca":          0.005,  # leve alta
    "Óleo de Soja":            0.008,  # alta (commodity em alta)
    "Frango (coxa/sobrecoxa)": 0.003,
    "Carne Bovina":            0.006,  # alta consistente
    "Ovo":                     0.004,
    "Bisteca Suína":           0.002,
    "Macarrão Espaguete":      0.001,
    "Farinha de Mandioca":    -0.002,
    "Batata Inglesa":          0.010,  # muito volátil
    "Mandioca":               -0.005,  # queda (safra)
    "Alface":                  0.015,  # muito volátil (sazonal)
    "Tomate":                  0.012,  # muito volátil
    "Pepino":                 -0.003,
    "Cenoura":                 0.002,
    "Beterraba":               0.003,
    "Alho":                   -0.004,  # queda (importação China)
    "Cebola":                  0.001,
    "Sal":                     0.000,  # estável
    "Colorau":                 0.001,
    "Pimenta do Reino":        0.002,
    "Extrato de Tomate":       0.001,
    "Caldo de Galinha":        0.002,
    "Cheiro-verde":            0.008,
    "Azeite de Oliva":         0.005,  # alta (seca Europa)
    "Limão":                   0.020,  # muito volátil (sazonal)
    "Vinagre":                 0.001,
}

def supabase_post(tabela, dados):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}"
    resp = requests.post(url, headers=HEADERS, json=dados)
    if resp.status_code not in (200, 201):
        print(f"  ❌ Erro: {resp.status_code} - {resp.text[:200]}")
        return None
    return resp.json()

def supabase_get(tabela, filtro=""):
    url  = f"{SUPABASE_URL}/rest/v1/{tabela}?{filtro}"
    resp = requests.get(url, headers=HEADERS)
    return resp.json() if resp.status_code == 200 else []

def gerar_preco_semana(preco_base, tendencia, semanas_atras):
    """
    Simula preço de semanas atrás.
    Volta no tempo: remove a tendência e adiciona ruído aleatório.
    """
    # Volta no tempo removendo a tendência acumulada
    preco = preco_base * ((1 - tendencia) ** semanas_atras)
    # Adiciona ruído aleatório semanal (±2%)
    ruido = random.uniform(-0.02, 0.02)
    preco = preco * (1 + ruido)
    return round(preco, 2)

def main():
    random.seed(42)  # seed fixa para reprodutibilidade

    # Data de hoje já existe no banco (snapshot_id=1)
    # Vamos gerar 8 semanas anteriores (semanas -1 a -8)
    hoje = datetime.strptime("2026-03-04", "%Y-%m-%d")

    print("🕐 Gerando histórico simulado — 8 semanas anteriores")
    print("="*55)

    for semanas_atras in range(1, 9):
        data_semana = hoje - timedelta(weeks=semanas_atras)
        data_str    = data_semana.strftime("%Y-%m-%d")

        # Verifica se já existe
        existente = supabase_get("snapshots", f"data=eq.{data_str}")
        if existente:
            print(f"⚠️  {data_str} já existe, pulando...")
            continue

        # Gera preços simulados para essa semana
        precos_semana = []
        custo_total   = 0

        for item in PRECOS_BASE:
            tendencia = TENDENCIAS.get(item["ingrediente"], 0.002)
            preco_sim = gerar_preco_semana(item["preco"], tendencia, semanas_atras)

            # Custo por porção proporcional
            if item["custo_porcao"]:
                ratio        = preco_sim / item["preco"]
                custo_porcao = round(item["custo_porcao"] * ratio, 4)
                custo_total += custo_porcao
            else:
                custo_porcao = None

            precos_semana.append({
                "ingrediente":  item["ingrediente"],
                "preco":        preco_sim,
                "label":        item["label"],
                "custo_porcao": custo_porcao,
            })

        # Salva snapshot
        snap_resp = supabase_post("snapshots", {
            "data":           data_str,
            "fonte":          "simulado",
            "custo_total_pf": round(custo_total, 2),
        })
        if not snap_resp:
            print(f"❌ Erro ao criar snapshot {data_str}")
            continue

        snapshot_id = snap_resp[0]["id"]

        # Salva preços
        for p in precos_semana:
            supabase_post("precos", {
                "snapshot_id":      snapshot_id,
                "nome_ingrediente": p["ingrediente"],
                "mediana_exibicao": p["preco"],
                "label":            p["label"],
                "custo_porcao":     p["custo_porcao"],
                "qtd_resultados":   random.randint(5, 15),
            })

        print(f"✅ {data_str} — custo PF: R$ {custo_total:.2f} — id={snapshot_id}")

    print("\n" + "="*55)
    print("✅ Histórico simulado gerado com sucesso!")
    print(f"   Total: 9 semanas de dados no banco")
    print(f"   Pronto para o frontend!")

if __name__ == "__main__":
    main()
