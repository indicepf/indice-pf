'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getIngredientes } from '@/lib/queries'
import { rotuloQtd, exemploQtd } from '@/lib/format'
import type { Ing } from '@/lib/types'

const TIPOS_LOJA = ['Mercado', 'Atacarejo', 'Feira', 'Conveniência']
const MAX_FOTOS = 10

type FotoItem = { file: File; preview: string; ingredienteId: string; preco: string; pesoG: string; marca: string }

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
  const [fotos, setFotos] = useState<FotoItem[]>([])

  // contexto compartilhado (uma vez, vale para todas as fotos do lote)
  const [tipoLoja, setTipoLoja] = useState('')
  const [mercado, setMercado] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [uf, setUf] = useState('')
  const [endereco, setEndereco] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)

  const [busy, setBusy] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ enviadas: number; dups: number; falhas: number } | null>(null)
  const [geoMsg, setGeoMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (!u) { router.replace('/'); setUserId(null) }
      else setUserId(u.id)
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

  async function adicionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    setErro('')
    const files = Array.from(e.target.files || [])
    e.target.value = ''  // permite re-selecionar a mesma foto
    if (!files.length) return
    const espaco = MAX_FOTOS - fotos.length
    if (espaco <= 0) { setErro(`Limite de ${MAX_FOTOS} fotos por lote.`); return }
    const aceitar = files.slice(0, espaco)
    if (files.length > espaco) setErro(`Limite de ${MAX_FOTOS} por lote — ${files.length - espaco} não adicionada(s).`)
    const novas = await Promise.all(aceitar.map(async f => {
      const c = await comprimirImagem(f)
      return { file: c, preview: URL.createObjectURL(c), ingredienteId: '', preco: '', pesoG: '', marca: '' } as FotoItem
    }))
    setFotos(prev => [...prev, ...novas])
  }

  function patchFoto(idx: number, campo: keyof FotoItem, valor: string) {
    setFotos(prev => prev.map((f, i) => i === idx ? { ...f, [campo]: valor } : f))
  }
  function removerFoto(idx: number) {
    setFotos(prev => { const f = prev[idx]; if (f) URL.revokeObjectURL(f.preview); return prev.filter((_, i) => i !== idx) })
  }

  async function uploadFoto(file: File, sufixo: string) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${userId}/${Date.now()}-${sufixo}.${ext}`
    const { error } = await supabase.storage.from('contribuicoes').upload(path, file)
    if (error) throw error
    return supabase.storage.from('contribuicoes').getPublicUrl(path).data.publicUrl
  }

  async function enviar() {
    setErro('')
    if (!fotos.length) { setErro('Adicione ao menos uma foto.'); return }
    if (!coord) { setErro('Registre sua localização — ela é obrigatória para validar onde o preço foi coletado.'); return }
    for (const f of fotos) {
      if (f.preco && isNaN(Number(f.preco.replace(',', '.')))) { setErro('Há um preço inválido em alguma foto — corrija ou deixe em branco.'); return }
    }
    setBusy(true)
    let enviadas = 0, dups = 0, falhas = 0
    const vistos = new Set<string>()
    try {
      for (let idx = 0; idx < fotos.length; idx++) {
        const f = fotos[idx]
        setProgresso(`Enviando ${idx + 1} de ${fotos.length}…`)
        const foto_hash = await hashArquivo(f.file)
        if (vistos.has(foto_hash)) { dups++; continue }   // duplicata dentro do próprio lote
        vistos.add(foto_hash)
        const { data: dup } = await supabase.from('contribuicoes')
          .select('id').eq('user_id', userId!).eq('foto_hash', foto_hash).limit(1)
        if (dup && dup.length) { dups++; continue }        // já enviada antes

        let foto_url: string
        try { foto_url = await uploadFoto(f.file, `produto-${idx}`) } catch { falhas++; continue }
        const { error } = await supabase.from('contribuicoes').insert({
          user_id: userId, ingrediente_id: f.ingredienteId ? Number(f.ingredienteId) : null,
          marca: f.marca.trim() || null, preco: f.preco ? Number(f.preco.replace(',', '.')) : null,
          peso_g: f.pesoG ? Number(f.pesoG.replace(',', '.')) : null,
          tipo_loja: tipoLoja || null, mercado: mercado.trim() || null, cidade: cidade.trim() || null,
          lat: coord.lat, lng: coord.lng, uf: uf || null, bairro: bairro || null, endereco: endereco || null,
          foto_url, foto_hash, status: 'pendente',
        })
        if (error) falhas++; else enviadas++
      }
      fotos.forEach(f => URL.revokeObjectURL(f.preview))
      setFotos([])
      setResultado({ enviadas, dups, falhas })
      window.scrollTo(0, 0)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar. Tente novamente.')
    } finally { setBusy(false); setProgresso('') }
  }

  if (userId === undefined) {
    return <main className="min-h-screen grid place-items-center text-muted text-sm">Carregando…</main>
  }
  if (!userId) return null

  return (
    <main className="min-h-screen">
      <header className="border-b border-line sticky top-0 bg-cream/90 backdrop-blur z-10">
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Contribuir com preços</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8">
        {resultado ? (
          <div className="text-center py-10">
            <h2 className="font-[family-name:var(--font-serif)] text-2xl mb-2">Obrigado!</h2>
            <p className="text-sm text-muted leading-relaxed mb-2 max-w-xs mx-auto">
              <strong>{resultado.enviadas}</strong> contribuição(ões) enviada(s) e <strong>em análise</strong>.
              Quando aprovadas, ajudam a calibrar o índice — e contam para a sua recompensa.
            </p>
            {(resultado.dups > 0 || resultado.falhas > 0) && (
              <p className="text-xs text-muted mb-6">
                {resultado.dups > 0 && <>{resultado.dups} já enviada(s) antes (ignorada[s]). </>}
                {resultado.falhas > 0 && <>{resultado.falhas} falhou/falharam no envio.</>}
              </p>
            )}
            <div className="flex gap-3 justify-center mt-6">
              <button onClick={() => setResultado(null)}
                className="text-sm border border-paprika text-paprika px-4 py-2 rounded-md hover:bg-paprika hover:text-white transition">
                Enviar outro lote
              </button>
              <button onClick={() => router.push('/')} className={btnInline}>Voltar ao índice</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              Fotografe os produtos com a etiqueta de preço visível. Registre a localização e a loja <strong>uma vez</strong> —
              valem para todas as fotos do lote. Ingrediente e preço de cada foto são opcionais (a moderação completa depois).
            </p>

            {/* fotos do lote */}
            <div className="space-y-3">
              {fotos.map((f, idx) => {
                const unidadeSel = ings.find(i => String(i.id) === f.ingredienteId)?.unidade ?? null
                return (
                  <div key={idx} className="border border-line rounded-lg bg-panel overflow-hidden flex">
                    <img src={f.preview} alt={`foto ${idx + 1}`} className="w-24 h-full min-h-[7rem] object-cover shrink-0" />
                    <div className="p-3 flex-1 grid grid-cols-2 gap-2">
                      <label className="text-[0.7rem] text-muted col-span-2">Ingrediente (opcional)
                        <select value={f.ingredienteId} onChange={e => patchFoto(idx, 'ingredienteId', e.target.value)} className={inputCls}>
                          <option value="">Selecione…</option>
                          {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                        </select>
                      </label>
                      <label className="text-[0.7rem] text-muted">Preço (R$)
                        <input value={f.preco} onChange={e => patchFoto(idx, 'preco', e.target.value)} inputMode="decimal" placeholder="0,00" className={inputCls} />
                      </label>
                      <label className="text-[0.7rem] text-muted">{rotuloQtd(unidadeSel)}
                        <input value={f.pesoG} onChange={e => patchFoto(idx, 'pesoG', e.target.value)} inputMode="decimal" placeholder={exemploQtd(unidadeSel)} className={inputCls} />
                      </label>
                      <div className="col-span-2 flex justify-end">
                        <button onClick={() => removerFoto(idx)} className="text-xs text-red-600 hover:underline">remover foto</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* adicionar fotos */}
            {fotos.length < MAX_FOTOS && (
              <label className="block mt-3">
                <div className="rounded-lg border-2 border-dashed border-line bg-panel py-6 grid place-items-center cursor-pointer hover:border-paprika transition-colors text-center">
                  <p className="font-medium text-ink text-sm">+ Adicionar fotos</p>
                  <p className="text-xs text-muted mt-1">Câmera ou galeria — até {MAX_FOTOS} por lote ({fotos.length}/{MAX_FOTOS})</p>
                </div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={adicionarFotos} />
              </label>
            )}

            {/* contexto compartilhado */}
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-xs uppercase tracking-wide text-muted mb-3">Vale para todas as fotos</p>
              <div className="flex items-center gap-3 text-xs mb-3">
                <button type="button" onClick={pegarLocal}
                  className={`font-medium ${coord ? 'text-olive' : 'text-paprika hover:underline'}`}>
                  {coord ? '✓ local registrado' : '+ registrar localização (obrigatório)'}
                </button>
              </div>
              {!coord && <p className="text-xs text-muted mb-3">A localização é obrigatória — usamos a coordenada e a data para validar onde o preço foi coletado.</p>}
              {geoMsg && <p className="text-xs text-amber-700 mb-3">{geoMsg}</p>}
              {endereco && <p className="text-xs text-muted mb-3 leading-snug">Local: {endereco}</p>}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted">Tipo de loja (opcional)
                  <select value={tipoLoja} onChange={e => setTipoLoja(e.target.value)} className={inputCls}>
                    <option value="">Selecione…</option>
                    {TIPOS_LOJA.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted">Cidade (opcional)
                  <input value={cidade} onChange={e => setCidade(e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-muted col-span-2">Mercado / rede (opcional)
                  <input value={mercado} onChange={e => setMercado(e.target.value)} placeholder="ex: Assaí, Carrefour…" className={inputCls} />
                </label>
              </div>
            </div>

            {erro && <p className="text-sm text-red-600 mt-4">{erro}</p>}
            <button disabled={busy || !fotos.length} onClick={enviar} className={btnFull}>
              {busy ? (progresso || 'Enviando…') : `Enviar ${fotos.length || ''} contribuição${fotos.length === 1 ? '' : 'ões'}`.trim()}
            </button>
            <p className="text-[0.7rem] text-muted mt-3 text-center">Cada foto entra como uma contribuição e passa por análise antes do índice.</p>
          </>
        )}
      </div>
    </main>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
const btnFull = 'w-full bg-paprika text-white rounded-md px-3 py-3 text-sm font-medium hover:brightness-95 transition mt-5 disabled:opacity-60'
const btnInline = 'text-sm bg-paprika text-white px-4 py-2 rounded-md hover:brightness-95 transition'
