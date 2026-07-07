'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getIngredientes, getProfile } from '@/lib/queries'
import { perfilCompleto } from '../useAuth'
import { rotuloQtd, exemploQtd } from '@/lib/format'
import type { Ing } from '@/lib/types'
import { Button, Input, Select } from '@/components/ui'
import BotaoInicio from '../BotaoInicio'

const TIPOS_LOJA = ['Mercado', 'Atacarejo', 'Feira', 'Conveniência']
const MAX_FOTOS = 10

type Modo = 'single' | 'lote'
type FotoItem = { file: File; preview: string }

// hash do conteúdo da imagem — impede reenvio da MESMA foto pelo mesmo usuário
async function hashArquivo(f: File) {
  const buf = await f.arrayBuffer()
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// reduz a foto antes do upload: fotos de celular têm vários MB e deixam o envio lento.
async function comprimirImagem(file: File, maxLado = 1600, q = 0.8): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', q))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export default function ContribuirPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [ings, setIngs] = useState<Ing[]>([])
  const [modo, setModo] = useState<Modo>('single')

  // contexto compartilhado (localização + loja) — usado nos dois modos
  const [tipoLoja, setTipoLoja] = useState('')
  const [mercado, setMercado] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [uf, setUf] = useState('')
  const [endereco, setEndereco] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [geoMsg, setGeoMsg] = useState('')

  // modo single (uma foto detalhada)
  const [ingredienteId, setIngredienteId] = useState('')
  const [marca, setMarca] = useState('')
  const [preco, setPreco] = useState('')
  const [pesoG, setPesoG] = useState('')
  const [fotoUnica, setFotoUnica] = useState<File | null>(null)
  const [preview, setPreview] = useState('')

  // modo lote (várias fotos)
  const [fotos, setFotos] = useState<FotoItem[]>([])

  const [busy, setBusy] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ enviadas: number; dups: number; falhas: number } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (!u) { router.replace('/entrar?next=%2Fcontribuir'); setUserId(null); return }
      // perfil completo é pré-requisito para contribuir (valida as contribuições)
      const p = await getProfile(u.id)
      if (!perfilCompleto(p)) { router.replace('/completar-perfil?next=%2Fcontribuir'); setUserId(null); return }
      setUserId(u.id)
    })
  }, [router])

  useEffect(() => { getIngredientes().then(setIngs) }, [])

  function pegarLocal() {
    setGeoMsg('')
    if (!navigator.geolocation) { setGeoMsg('Geolocalização não disponível neste navegador.'); return }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = +pos.coords.latitude.toFixed(6), lng = +pos.coords.longitude.toFixed(6)
        setCoord({ lat, lng }); setGeoMsg('Buscando endereço…')
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`)
          const j = await r.json()
          const a = j.address || {}
          if (a.city || a.town || a.village || a.municipality) setCidade(a.city || a.town || a.village || a.municipality)
          setBairro(a.suburb || a.neighbourhood || a.city_district || '')
          setUf(a.state || '')
          setEndereco(j.display_name || '')
          setGeoMsg('')
        } catch { setGeoMsg('') }
      },
      (e) => setGeoMsg(
        e.code === 1 ? 'Permissão negada — habilite a localização para este site no navegador.'
        : e.code === 2 ? 'Localização indisponível agora. Tente de novo.'
        : 'Tempo esgotado ao localizar. Toque de novo (a localização é obrigatória).',
      ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    )
  }

  async function uploadFoto(file: File, sufixo: string) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${userId}/${Date.now()}-${sufixo}.${ext}`
    const { error } = await supabase.storage.from('contribuicoes').upload(path, file)
    if (error) throw error
    return supabase.storage.from('contribuicoes').getPublicUrl(path).data.publicUrl
  }

  // grava uma contribuição; retorna 'ok' | 'dup' | 'falha'
  async function gravarUma(file: File, campos: { ingredienteId: string; preco: string; pesoG: string; marca: string },
                           sufixo: string, vistos: Set<string>): Promise<'ok' | 'dup' | 'falha'> {
    const foto_hash = await hashArquivo(file)
    if (vistos.has(foto_hash)) return 'dup'
    vistos.add(foto_hash)
    const { data: dup } = await supabase.from('contribuicoes')
      .select('id').eq('user_id', userId!).eq('foto_hash', foto_hash).limit(1)
    if (dup && dup.length) return 'dup'
    let foto_url: string
    try { foto_url = await uploadFoto(file, sufixo) } catch { return 'falha' }
    const { error } = await supabase.from('contribuicoes').insert({
      user_id: userId, ingrediente_id: campos.ingredienteId ? Number(campos.ingredienteId) : null,
      marca: campos.marca.trim() || null, preco: campos.preco ? Number(campos.preco.replace(',', '.')) : null,
      peso_g: campos.pesoG ? Number(campos.pesoG.replace(',', '.')) : null,
      tipo_loja: tipoLoja || null, mercado: mercado.trim() || null, cidade: cidade.trim() || null,
      lat: coord!.lat, lng: coord!.lng, uf: uf || null, bairro: bairro || null, endereco: endereco || null,
      foto_url, foto_hash, status: 'pendente',
    })
    return error ? 'falha' : 'ok'
  }

  // ── modo single ──────────────────────────────────────────────────────────
  async function escolherFotoUnica(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    const c = await comprimirImagem(f)
    setFotoUnica(c); setPreview(URL.createObjectURL(c))
  }

  async function enviarSingle() {
    setErro('')
    if (!fotoUnica) { setErro('Adicione a foto do produto.'); return }
    if (!coord) { setErro('Registre sua localização — ela é obrigatória para validar onde o preço foi coletado.'); return }
    if (preco && isNaN(Number(preco.replace(',', '.')))) { setErro('Preço inválido — corrija ou deixe em branco.'); return }
    setBusy(true)
    try {
      const r = await gravarUma(fotoUnica, { ingredienteId, preco, pesoG, marca }, 'produto', new Set())
      if (r === 'dup') { setErro('Você já enviou esta mesma foto.'); return }
      if (r === 'falha') { setErro('Falha ao enviar. Tente novamente.'); return }
      setFotoUnica(null); setPreview(''); setIngredienteId(''); setPreco(''); setPesoG(''); setMarca('')
      setResultado({ enviadas: 1, dups: 0, falhas: 0 }); window.scrollTo(0, 0)
    } finally { setBusy(false) }
  }

  // ── modo lote ────────────────────────────────────────────────────────────
  async function adicionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    setErro('')
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const espaco = MAX_FOTOS - fotos.length
    if (espaco <= 0) { setErro(`Limite de ${MAX_FOTOS} fotos por lote.`); return }
    const aceitar = files.slice(0, espaco)
    if (files.length > espaco) setErro(`Limite de ${MAX_FOTOS} por lote — ${files.length - espaco} não adicionada(s).`)
    const novas = await Promise.all(aceitar.map(async f => {
      const c = await comprimirImagem(f)
      return { file: c, preview: URL.createObjectURL(c) } as FotoItem
    }))
    setFotos(prev => [...prev, ...novas])
  }
  function removerFoto(idx: number) {
    setFotos(prev => { const f = prev[idx]; if (f) URL.revokeObjectURL(f.preview); return prev.filter((_, i) => i !== idx) })
  }

  async function enviarLote() {
    setErro('')
    if (!fotos.length) { setErro('Adicione ao menos uma foto.'); return }
    if (!coord) { setErro('Registre sua localização — ela é obrigatória para validar onde o preço foi coletado.'); return }
    setBusy(true)
    let enviadas = 0, dups = 0, falhas = 0
    const vistos = new Set<string>()
    const vazio = { ingredienteId: '', preco: '', pesoG: '', marca: '' }   // detalhes vão para a moderação
    try {
      for (let idx = 0; idx < fotos.length; idx++) {
        setProgresso(`Enviando ${idx + 1} de ${fotos.length}…`)
        const f = fotos[idx]
        const r = await gravarUma(f.file, vazio, `produto-${idx}`, vistos)
        if (r === 'ok') enviadas++; else if (r === 'dup') dups++; else falhas++
      }
      fotos.forEach(f => URL.revokeObjectURL(f.preview)); setFotos([])
      setResultado({ enviadas, dups, falhas }); window.scrollTo(0, 0)
    } finally { setBusy(false); setProgresso('') }
  }

  if (userId === undefined) return <main className="min-h-screen grid place-items-center text-dim text-sm">Carregando…</main>
  if (!userId) return null

  const unidadeSingle = ings.find(i => String(i.id) === ingredienteId)?.unidade ?? null

  return (
    <main className="min-h-screen">
      <header className="border-b border-border sticky top-0 bg-surface/80 backdrop-blur z-10">
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
          <BotaoInicio />
          <h1 className="text-xl font-bold tracking-tight ml-1">Contribuir com preços</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8">
        {resultado ? (
          <div className="text-center py-10">
            <h2 className="text-2xl font-bold tracking-tight mb-2">Obrigado!</h2>
            <p className="text-sm text-dim leading-relaxed mb-2 max-w-xs mx-auto">
              <strong>{resultado.enviadas}</strong> contribuição(ões) enviada(s) e <strong>em análise</strong>.
              Quando aprovadas, ajudam a calibrar o índice — e contam para a sua recompensa.
            </p>
            {(resultado.dups > 0 || resultado.falhas > 0) && (
              <p className="text-xs text-dim mb-6">
                {resultado.dups > 0 && <>{resultado.dups} já enviada(s) antes (ignorada[s]). </>}
                {resultado.falhas > 0 && <>{resultado.falhas} falhou/falharam no envio.</>}
              </p>
            )}
            <div className="flex gap-3 justify-center mt-6">
              <button onClick={() => setResultado(null)}
                className="text-sm border border-accent text-accent px-4 py-2 rounded-[var(--r-sm)] hover:bg-accent hover:text-white transition cursor-pointer">
                Enviar mais
              </button>
              <BotaoInicio />
            </div>
          </div>
        ) : (
          <>
            {/* seletor de modo */}
            <div className="inline-flex border border-border rounded-[var(--r-sm)] overflow-hidden bg-surface text-sm mb-5">
              {([['single', 'Uma foto'], ['lote', 'Lote (várias)']] as [Modo, string][]).map(([k, label]) => (
                <button key={k} onClick={() => { setModo(k); setErro('') }}
                  className={`px-4 py-1.5 transition-colors cursor-pointer ${modo === k ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>

            {modo === 'single' ? (
              <>
                <p className="text-sm text-dim mb-4">Fotografe o produto com a etiqueta de preço visível. Só a foto e a localização são obrigatórias — os demais campos ajudam, mas são opcionais.</p>

                <label className="block">
                  <div className="aspect-[4/3] rounded-[var(--r)] border-2 border-dashed border-border-2 bg-surface grid place-items-center overflow-hidden cursor-pointer hover:border-accent transition-colors">
                    {preview
                      ? <img src={preview} alt="prévia" className="w-full h-full object-cover" />
                      : <div className="text-center text-dim text-sm px-4">
                          <p className="font-medium text-ink">Toque para fotografar</p>
                          <p className="mt-1 text-xs">Enquadre o produto e a etiqueta de preço juntos, bem iluminado.</p>
                        </div>}
                  </div>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFotoUnica} />
                </label>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="text-xs text-dim">Ingrediente (opcional)
                    <Select value={ingredienteId} onChange={e => setIngredienteId(e.target.value)}>
                      <option value="">Selecione…</option>
                      {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                    </Select>
                  </label>
                  <label className="text-xs text-dim">Tipo de loja (opcional)
                    <Select value={tipoLoja} onChange={e => setTipoLoja(e.target.value)}>
                      <option value="">Selecione…</option>
                      {TIPOS_LOJA.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </label>
                  <label className="text-xs text-dim">Preço (R$, opcional)
                    <Input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" />
                  </label>
                  <label className="text-xs text-dim">{rotuloQtd(unidadeSingle)} (opcional)
                    <Input value={pesoG} onChange={e => setPesoG(e.target.value)} inputMode="decimal" placeholder={exemploQtd(unidadeSingle)} />
                  </label>
                  <label className="text-xs text-dim col-span-2">Marca (opcional — deixe vazio se não tiver)
                    <Input value={marca} onChange={e => setMarca(e.target.value)} placeholder="ex: Ancelli, Tio João…" />
                  </label>
                  <label className="text-xs text-dim col-span-2">Mercado / rede (opcional)
                    <Input value={mercado} onChange={e => setMercado(e.target.value)} placeholder="ex: Assaí, Carrefour…" />
                  </label>
                  <label className="text-xs text-dim col-span-2">Cidade (opcional)
                    <Input value={cidade} onChange={e => setCidade(e.target.value)} />
                  </label>
                </div>

                <ContextoLocal {...{ coord, pegarLocal, geoMsg, endereco }} />

                {erro && <p className="text-sm text-danger mt-4">{erro}</p>}
                <Button full disabled={busy} onClick={enviarSingle} className="mt-5">{busy ? 'Enviando…' : 'Enviar contribuição'}</Button>
                <p className="text-[0.7rem] text-dim mt-3 text-center">Sua contribuição passa por análise antes de entrar no índice.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-dim mb-4">
                  Anexe <strong>todas as fotos de uma vez</strong> (como no WhatsApp). Registre a localização, o mercado e o
                  tipo <strong>uma vez</strong> — valem para todas. Ingrediente e preço ficam para a moderação. Cada foto vira uma contribuição.
                </p>

                {fotos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                    {fotos.map((f, idx) => (
                      <div key={idx} className="relative aspect-square rounded-[var(--r-sm)] overflow-hidden border border-border">
                        <img src={f.preview} alt={`foto ${idx + 1}`} className="w-full h-full object-cover" />
                        <button onClick={() => removerFoto(idx)}
                          className="absolute top-1 right-1 bg-ink/70 text-white w-5 h-5 rounded-full text-xs leading-none grid place-items-center hover:bg-ink">×</button>
                      </div>
                    ))}
                  </div>
                )}

                {fotos.length < MAX_FOTOS && (
                  <label className="block">
                    <div className="rounded-[var(--r)] border-2 border-dashed border-border-2 bg-surface py-6 grid place-items-center cursor-pointer hover:border-accent transition-colors text-center">
                      <p className="font-medium text-ink text-sm">+ Anexar fotos</p>
                      <p className="text-xs text-dim mt-1">Selecione várias de uma vez — até {MAX_FOTOS} por lote ({fotos.length}/{MAX_FOTOS})</p>
                    </div>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={adicionarFotos} />
                  </label>
                )}

                <div className="mt-6 border-t border-border pt-5">
                  <p className="text-xs uppercase tracking-wide text-dim mb-3">Vale para todas as fotos</p>
                  <ContextoLocal {...{ coord, pegarLocal, geoMsg, endereco }} />
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <label className="text-xs text-dim">Tipo de loja (opcional)
                      <Select value={tipoLoja} onChange={e => setTipoLoja(e.target.value)}>
                        <option value="">Selecione…</option>
                        {TIPOS_LOJA.map(t => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </label>
                    <label className="text-xs text-dim">Cidade (opcional)
                      <Input value={cidade} onChange={e => setCidade(e.target.value)} />
                    </label>
                    <label className="text-xs text-dim col-span-2">Mercado / rede (opcional)
                      <Input value={mercado} onChange={e => setMercado(e.target.value)} placeholder="ex: Assaí, Carrefour…" />
                    </label>
                  </div>
                </div>

                {erro && <p className="text-sm text-danger mt-4">{erro}</p>}
                <Button full disabled={busy || !fotos.length} onClick={enviarLote} className="mt-5">
                  {busy ? (progresso || 'Enviando…') : `Enviar ${fotos.length || ''} contribuição${fotos.length === 1 ? '' : 'ões'}`.trim()}
                </Button>
                <p className="text-[0.7rem] text-dim mt-3 text-center">Cada foto entra como uma contribuição e passa por análise antes do índice.</p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function ContextoLocal({ coord, pegarLocal, geoMsg, endereco }: {
  coord: { lat: number; lng: number } | null; pegarLocal: () => void; geoMsg: string; endereco: string
}) {
  return (
    <div className="mt-4 text-xs">
      <button type="button" onClick={pegarLocal}
        className={`font-medium cursor-pointer ${coord ? 'text-ok' : 'text-accent hover:underline'}`}>
        {coord ? '✓ local registrado' : '+ registrar localização (obrigatório)'}
      </button>
      {!coord && <p className="text-dim mt-2">A localização é obrigatória — usamos a coordenada e a data para validar onde o preço foi coletado.</p>}
      {geoMsg && <p className="text-warn mt-2">{geoMsg}</p>}
      {endereco && <p className="text-dim mt-2 leading-snug">Local: {endereco}</p>}
    </div>
  )
}
