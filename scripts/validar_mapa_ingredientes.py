#!/usr/bin/env python3
"""Valida lib/mapa-ingredientes.ts contra o banco.

Roda as checagens que impedem um mapeamento silenciosamente errado:
  1. toda série referenciada existe em fatores_preditores e tem dados
  2. todo id existe em ingredientes e o nome bate com o do banco
  3. sem ids duplicados; sem id em MAPA e NAO_MAPEADOS ao mesmo tempo
  4. todo ingrediente com peso no índice está mapeado ou declarado sem item
  5. cobertura do custo do índice, por nível de confiança

Uso:  python3 scripts/validar_mapa_ingredientes.py
Sai com código 1 se alguma checagem falhar.
"""
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPA_TS = os.path.join(RAIZ, 'lib', 'mapa-ingredientes.ts')


def env(chave: str) -> str:
    with open(os.path.join(RAIZ, '.env.local'), encoding='utf-8') as f:
        for linha in f:
            if linha.startswith(chave + '='):
                return linha.split('=', 1)[1].strip()
    sys.exit(f'{chave} não encontrada em .env.local')


URL, KEY = env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_KEY')


def api(caminho: str):
    req = urllib.request.Request(f'{URL}/rest/v1/{caminho}',
                                 headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def n_pontos(serie: str) -> int:
    """Quantas linhas a série tem. Consulta por série: um SELECT amplo é
    truncado em 1000 linhas pelo PostgREST e daria falso negativo."""
    req = urllib.request.Request(
        f'{URL}/rest/v1/fatores_preditores?select=serie&serie=eq.{serie}&limit=1',
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}',
                 'Prefer': 'count=exact', 'Range-Unit': 'items'})
    with urllib.request.urlopen(req, timeout=30) as r:
        faixa = r.headers.get('content-range', '*/0')
    return int(faixa.split('/')[-1] or 0)


def parse_mapa():
    """Lê as entradas do TS sem depender de runtime JS."""
    ts = open(MAPA_TS, encoding='utf-8').read()

    def bloco(nome):
        i = ts.index(f'{nome}:')
        return ts[i:ts.index('] as const', i)]

    mapa = [{'id': int(m[0]), 'nome': m[1], 'serie': m[2], 'confianca': m[3]}
            for m in re.findall(
                r"\{\s*id:\s*(\d+),\s*nome:\s*'((?:[^'\\]|\\.)*)',\s*serie:\s*'([^']+)',\s*confianca:\s*'(\w+)'",
                bloco('MAPA_INGREDIENTE_IPCA'))]
    nao = [{'id': int(a), 'nome': b} for a, b in re.findall(
        r"\{\s*id:\s*(\d+),\s*nome:\s*'((?:[^'\\]|\\.)*)',\s*motivo:", bloco('NAO_MAPEADOS'))]
    dieese = [{'id': int(a), 'nome': b, 'serie': c, 'comparabilidade': d}
              for a, b, c, d in re.findall(
        r"\{\s*id:\s*(\d+),\s*nome:\s*'((?:[^'\\]|\\.)*)',\s*serie:\s*'(dieese_[^']+)',"
        r"\s*comparabilidade:\s*'(\w+)'", bloco('MAPA_INGREDIENTE_DIEESE'))]
    return mapa, nao, dieese


def main():
    mapa, nao_mapeados, dieese = parse_mapa()
    print(f'mapeamento: {len(mapa)} ingredientes → IPCA · {len(nao_mapeados)} sem item · '
          f'{len(dieese)} com par no DIEESE\n')
    erros, avisos = [], []

    # --- dados do banco ---
    ingredientes = {i['id']: i for i in api('ingredientes?select=id,nome,ativo&limit=500')}
    referidas = sorted({m['serie'] for m in mapa} | {d['serie'] for d in dieese})
    pontos = {s: n_pontos(s) for s in referidas}
    print(f'séries distintas referenciadas: {len(referidas)}')

    ult = api('snapshots?select=id&order=data.desc&limit=1')[0]['id']
    precos = {p['ingrediente_id']: p['mediana_exibicao']
              for p in api(f'precos?select=ingrediente_id,mediana_exibicao&snapshot_id=eq.{ult}&limit=500')
              if p['ingrediente_id'] and p['mediana_exibicao']}
    gramas = defaultdict(float)
    for r in api('receitas?select=ingrediente_id,qtd_g&limit=5000'):
        if r['ingrediente_id']:
            gramas[r['ingrediente_id']] += r['qtd_g'] or 0
    custo = {i: (g / 1000) * precos[i] for i, g in gramas.items() if i in precos}
    total = sum(custo.values())

    # --- 1. séries existem e têm dados ---
    for s in referidas:
        if pontos[s] == 0:
            usos = [f"{m['id']} {m['nome']}" for m in mapa if m['serie'] == s] or \
                   [f"{d['id']} {d['nome']}" for d in dieese if d['serie'] == s]
            erros.append(f'série sem dados: {s} (usada por: {", ".join(usos[:3])})')
        elif pontos[s] < 12:
            erros.append(f'série curta: {s} ({pontos[s]} pontos, < 12 meses)')

    # --- 2. ids existem e nomes conferem ---
    for m in mapa + nao_mapeados + dieese:
        bd = ingredientes.get(m['id'])
        if not bd:
            erros.append(f"id inexistente em ingredientes: {m['id']} ({m['nome']})")
        elif bd['nome'] != m['nome']:
            erros.append(f"nome divergente id {m['id']}: mapa='{m['nome']}' banco='{bd['nome']}'")

    # --- 3. duplicados / conflitos ---
    vistos = defaultdict(list)
    for m in mapa:
        vistos[m['id']].append(m['serie'])
    for i, ss in vistos.items():
        if len(ss) > 1:
            erros.append(f'id {i} mapeado {len(ss)}x: {ss}')
    conflito = {m['id'] for m in mapa} & {n['id'] for n in nao_mapeados}
    for i in conflito:
        erros.append(f'id {i} está em MAPA e NAO_MAPEADOS')

    # --- 4. cobertura de tudo que tem peso ---
    declarados = {m['id'] for m in mapa} | {n['id'] for n in nao_mapeados}
    for i, c in sorted(custo.items(), key=lambda x: -x[1]):
        if i not in declarados:
            nome = ingredientes.get(i, {}).get('nome', '?')
            pct = c / total * 100
            (erros if pct >= 0.1 else avisos).append(
                f'sem declaração: id {i} {nome} ({pct:.2f}% do custo)')

    # --- 5. cobertura por confiança ---
    porconf = defaultdict(float)
    for m in mapa:
        porconf[m['confianca']] += custo.get(m['id'], 0)
    naomap = sum(custo.get(n['id'], 0) for n in nao_mapeados)
    print('=== cobertura do custo do índice ===')
    acum = 0.0
    for c in ('alta', 'media', 'baixa'):
        pct = porconf[c] / total * 100
        acum += pct
        print(f'  {c:6}: {pct:5.1f}%   (acumulado {acum:5.1f}%)')
    print(f'  sem item: {naomap / total * 100:4.1f}%')
    print(f'  descoberto: {100 - acum - naomap / total * 100:4.1f}%\n')

    for a in avisos:
        print(f'  aviso: {a}')
    if erros:
        print(f'\nFALHOU — {len(erros)} erro(s):')
        for e in erros:
            print(f'  ERRO: {e}')
        sys.exit(1)
    print('OK — todas as checagens passaram.')


if __name__ == '__main__':
    main()
