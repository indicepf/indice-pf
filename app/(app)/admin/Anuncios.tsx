'use client'

import { useEffect, useState } from 'react'
import { getAnuncios, salvarAnuncio, excluirAnuncio, type Anuncio } from '@/lib/queries'
import { Badge, Button, Input, Select } from '@/components/ui'

const SLOTS = [
  ['hero', 'Hero — faixa larga (abaixo do topo)'],
  ['hero-lado', 'Hero — retângulo 300px (à direita, como no mockup)'],
  ['lateral', 'Lateral (painel de filtros)'],
  ['billboard', 'Billboard (entre seções)'],
  ['leaderboard', 'Leaderboard (antes da tabela)'],
  ['nativo', 'Nativo (linha da tabela)'],
  ['popup', 'Pop-up (modal, 1× por sessão)'],
  ['gate-grafico', 'Gate do gráfico (cobre até fechar)'],
  ['gate-tabela', 'Gate da tabela de produtos (cobre até fechar)'],
] as const

type AdComMetrica = Anuncio & { imps: number; clicks: number }
const VAZIO: Partial<Anuncio> = { slot: 'hero', titulo: '', texto: '', imagem_url: '', link: '', anunciante: '', ativo: true, inicio: null, fim: null, peso: 1, escala: 1 }

export default function Anuncios() {
  const [ads, setAds] = useState<AdComMetrica[] | null>(null)
  const [form, setForm] = useState<Partial<Anuncio> | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = () => getAnuncios().then(setAds).catch(() => setAds([]))
  useEffect(() => { carregar() }, [])

  async function salvar() {
    if (!form?.titulo?.trim()) { setErro('Informe o título.'); return }
    setErro(''); setBusy(true)
    const { error } = await salvarAnuncio(form)
    setBusy(false)
    if (error) { setErro(error.message ?? 'Falha ao salvar (a migração 28 já rodou?).'); return }
    setForm(null); carregar()
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este anúncio? As métricas dele também somem.')) return
    await excluirAnuncio(id); carregar()
  }

  const set = (k: keyof Anuncio, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-dim">
          Criativos exibidos nos slots da home (house ads). Assinantes Premium não veem anúncios.
        </p>
        {!form && <Button onClick={() => setForm({ ...VAZIO })}>Novo anúncio</Button>}
      </div>

      {ads === null ? <p className="text-sm text-dim">Carregando…</p> : null}
      {ads?.length === 0 && !form && (
        <p className="text-sm text-dim border border-border rounded-[var(--r)] bg-surface p-4">
          Nenhum anúncio cadastrado. Se o formulário der erro ao salvar, rode a
          <code className="mx-1">supabase_migration_28.sql</code> no Supabase.
        </p>
      )}

      {form && (
        <div className="border border-border rounded-[var(--r)] bg-surface p-4 space-y-3">
          <p className="font-medium text-sm">{form.id ? `Editar anúncio #${form.id}` : 'Novo anúncio'}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-dim">Slot
              <Select value={form.slot ?? 'hero'} onChange={e => set('slot', e.target.value)}>
                {SLOTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </label>
            <label className="text-xs text-dim">Anunciante
              <Input value={form.anunciante ?? ''} onChange={e => set('anunciante', e.target.value)} placeholder="ex: Atacadão XYZ" />
            </label>
            <label className="text-xs text-dim sm:col-span-2">Título
              <Input value={form.titulo ?? ''} onChange={e => set('titulo', e.target.value)} />
            </label>
            <label className="text-xs text-dim sm:col-span-2">Texto (opcional; ignorado se houver imagem)
              <Input value={form.texto ?? ''} onChange={e => set('texto', e.target.value)} />
            </label>
            <label className="text-xs text-dim sm:col-span-2">URL da imagem (opcional)
              <Input value={form.imagem_url ?? ''} onChange={e => set('imagem_url', e.target.value)} placeholder="https://…" />
            </label>
            <label className="text-xs text-dim sm:col-span-2">Link de destino (opcional)
              <Input value={form.link ?? ''} onChange={e => set('link', e.target.value)} placeholder="https://…" />
            </label>
            <label className="text-xs text-dim">Início (opcional)
              <Input type="date" value={form.inicio ?? ''} onChange={e => set('inicio', e.target.value || null)} />
            </label>
            <label className="text-xs text-dim">Fim (opcional)
              <Input type="date" value={form.fim ?? ''} onChange={e => set('fim', e.target.value || null)} />
            </label>
            <label className="text-xs text-dim">Peso do sorteio (≥1)
              <Input type="number" min={1} value={form.peso ?? 1} onChange={e => set('peso', Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="text-xs text-dim">Tamanho ({Math.round((form.escala ?? 1) * 100)}% do slot)
              <input type="range" min={10} max={100} step={5} value={Math.round((form.escala ?? 1) * 100)}
                onChange={e => set('escala', Number(e.target.value) / 100)}
                className="w-full mt-2 accent-accent" />
            </label>
            <label className="text-xs text-dim flex items-end gap-2 pb-2">
              <input type="checkbox" checked={form.ativo ?? true} onChange={e => set('ativo', e.target.checked)} className="accent-accent" />
              Ativo
            </label>
          </div>
          {erro && <p className="text-xs text-danger">{erro}</p>}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar'}</Button>
            <Button variant="secondary" onClick={() => { setForm(null); setErro('') }}>Cancelar</Button>
          </div>
        </div>
      )}

      {!!ads?.length && (
        <div className="space-y-2">
          {ads.map(a => (
            <div key={a.id} className="border border-border rounded-[var(--r-sm)] bg-surface p-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{a.titulo}</p>
                <p className="text-xs text-dim truncate">
                  {SLOTS.find(([k]) => k === a.slot)?.[1] ?? a.slot}
                  {a.anunciante ? ` · ${a.anunciante}` : ''}
                  {a.inicio || a.fim ? ` · ${a.inicio ?? '…'} → ${a.fim ?? '…'}` : ''}
                  {` · peso ${a.peso}`}
                </p>
              </div>
              <span className="text-xs text-dim tnum shrink-0" title="impressões / cliques">
                {a.imps} imp · {a.clicks} cliques{a.imps > 0 ? ` · CTR ${(a.clicks / a.imps * 100).toFixed(1)}%` : ''}
              </span>
              <Badge tone={a.ativo ? 'ok' : 'neutral'}>{a.ativo ? 'ativo' : 'pausado'}</Badge>
              <button onClick={() => setForm(a)} className="text-xs text-accent hover:underline cursor-pointer">editar</button>
              <button onClick={() => excluir(a.id)} className="text-xs text-dim hover:text-danger cursor-pointer">excluir</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
