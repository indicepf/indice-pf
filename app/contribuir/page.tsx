'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getIngredientes } from '@/lib/queries'
import { rotuloQtd, exemploQtd } from '@/lib/format'
import type { Ing } from '@/lib/types'

const TIPOS_LOJA = ['Mercado', 'Atacarejo', 'Feira', 'Conveniência']

// hash do conteúdo da imagem — impede reenvio da MESMA foto pelo mesmo usuário
async function hashArquivo(f: File) {
  const buf = await f.arrayBuffer()
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// reduz a foto antes do upload: fotos de celular têm vários MB e deixam o envio lento.
// Redimensiona para no máx. 1600px no maior lado e recomprime em JPEG ~80%.
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
    if (!blob || blob.size >= file.size) return file  // não enviar algo maior que o original
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export default function ContribuirPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null | undefined>(undefined) // undefined = carregando

  const [ings, setIngs] = useState<Ing[]>([])
  const [ingredienteId, setIngredienteId] = useState('')
  const [produto, setProduto] = useState('')
  const [marca, setMarca] = useState('')
  const [preco, setPreco] = useState('')
  const [pesoG, setPesoG] = useState('')
  const [tipoLoja, setTipoLoja] = useState('')
  const [mercado, setMercado] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [uf, setUf] = useState('')
  const [endereco, setEndereco] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [fotoProduto, setFotoProduto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
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
        : 'Tempo esgotado ao localizar. Toque de novo (a localização é opcional).',
      ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    )
  }

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    const c = await comprimirImagem(f)
    setFotoProduto(c); setPreview(URL.createObjectURL(c))
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
    if (!fotoProduto) { setErro('Adicione a foto do produto.'); return }
    if (!coord) { setErro('Registre sua localização — ela é obrigatória para validar onde o preço foi coletado.'); return }
    if (preco && isNaN(Number(preco.replace(',', '.')))) { setErro('Preço inválido — corrija ou deixe em branco.'); return }
    setBusy(true)
    try {
      const foto_hash = await hashArquivo(fotoProduto)
      const { data: dup } = await supabase.from('contribuicoes')
        .select('id').eq('user_id', userId!).eq('foto_hash', foto_hash).limit(1)
      if (dup && dup.length) { setErro('Você já enviou esta mesma foto.'); setBusy(false); return }

      const foto_url = await uploadFoto(fotoProduto, 'produto')
      const { error } = await supabase.from('contribuicoes').insert({
        user_id: userId, ingrediente_id: ingredienteId ? Number(ingredienteId) : null,
        produto: produto.trim() || null, marca: marca.trim() || null, preco: preco ? Number(preco.replace(',', '.')) : null,
        peso_g: pesoG ? Number(pesoG.replace(',', '.')) : null, tipo_loja: tipoLoja || null,
        mercado: mercado.trim() || null, cidade: cidade.trim() || null,
        lat: coord?.lat ?? null, lng: coord?.lng ?? null,
        uf: uf || null, bairro: bairro || null, endereco: endereco || null,
        foto_url, foto_hash, status: 'pendente',
      })
      if (error) throw error
      setOk(true); window.scrollTo(0, 0)
    } catch (e: any) {
      const msg = e?.message || ''
      setErro(/duplicate|unique/i.test(msg) ? 'Você já enviou esta mesma foto.' : (msg || 'Falha ao enviar. Tente novamente.'))
    } finally { setBusy(false) }
  }

  if (userId === undefined) {
    return <main className="min-h-screen grid place-items-center text-muted text-sm">Carregando…</main>
  }
  if (!userId) return null

  const unidadeSel = ings.find(i => String(i.id) === ingredienteId)?.unidade ?? null

  return (
    <main className="min-h-screen">
      <header className="border-b border-line sticky top-0 bg-cream/90 backdrop-blur z-10">
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Contribuir com um preço</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8">
        {ok ? (
          <div className="text-center py-10">
            <h2 className="font-[family-name:var(--font-serif)] text-2xl mb-2">Obrigado!</h2>
            <p className="text-sm text-muted leading-relaxed mb-6 max-w-xs mx-auto">
              Sua contribuição foi enviada e está <strong>em análise</strong>. Quando aprovada, ajuda a calibrar o
              índice — e conta para a sua recompensa.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setOk(false); setFotoProduto(null); setPreview(''); setPreco(''); setIngredienteId(''); setMarca('') }}
                className="text-sm border border-paprika text-paprika px-4 py-2 rounded-md hover:bg-paprika hover:text-white transition">
                Enviar outra
              </button>
              <button onClick={() => router.push('/')} className={btnInline}>Voltar ao índice</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">Fotografe o produto com a etiqueta de preço visível. Só a foto e a localização são obrigatórias — os demais campos ajudam, mas são opcionais.</p>

            <label className="block">
              <div className="aspect-[4/3] rounded-lg border-2 border-dashed border-line bg-panel grid place-items-center overflow-hidden cursor-pointer hover:border-paprika transition-colors">
                {preview
                  ? <img src={preview} alt="prévia" className="w-full h-full object-cover" />
                  : <div className="text-center text-muted text-sm px-4">
                      <p className="font-medium text-ink">Toque para fotografar</p>
                      <p className="mt-1 text-xs">Enquadre o produto e a etiqueta de preço juntos, bem iluminado.</p>
                    </div>}
              </div>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={escolherFoto} />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">Ingrediente (opcional)
                <select value={ingredienteId} onChange={e => setIngredienteId(e.target.value)} className={inputCls}>
                  <option value="">Selecione…</option>
                  {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted">Tipo de loja (opcional)
                <select value={tipoLoja} onChange={e => setTipoLoja(e.target.value)} className={inputCls}>
                  <option value="">Selecione…</option>
                  {TIPOS_LOJA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted">Preço (R$, opcional)
                <input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputCls} />
              </label>
              <label className="text-xs text-muted">{rotuloQtd(unidadeSel)} (opcional)
                <input value={pesoG} onChange={e => setPesoG(e.target.value)} inputMode="decimal" placeholder={exemploQtd(unidadeSel)} className={inputCls} />
              </label>
              <label className="text-xs text-muted col-span-2">Marca (opcional — deixe vazio se não tiver)
                <input value={marca} onChange={e => setMarca(e.target.value)} placeholder="ex: Ancelli, Tio João…" className={inputCls} />
              </label>
              <label className="text-xs text-muted col-span-2">Mercado / rede (opcional)
                <input value={mercado} onChange={e => setMercado(e.target.value)} placeholder="ex: Assaí, Carrefour…" className={inputCls} />
              </label>
              <label className="text-xs text-muted col-span-2">Cidade (opcional)
                <input value={cidade} onChange={e => setCidade(e.target.value)} className={inputCls} />
              </label>
            </div>

            <div className="flex items-center gap-3 mt-4 text-xs">
              <button type="button" onClick={pegarLocal}
                className={`font-medium ${coord ? 'text-olive' : 'text-paprika hover:underline'}`}>
                {coord ? '✓ local registrado' : '+ registrar localização (obrigatório)'}
              </button>
            </div>
            {!coord && <p className="text-xs text-muted mt-2">A localização é obrigatória — usamos a coordenada e a data para validar onde o preço foi coletado.</p>}
            {geoMsg && <p className="text-xs text-amber-700 mt-2">{geoMsg}</p>}
            {endereco && <p className="text-xs text-muted mt-2 leading-snug">Local: {endereco}</p>}

            {erro && <p className="text-sm text-red-600 mt-4">{erro}</p>}
            <button disabled={busy} onClick={enviar} className={btnFull}>
              {busy ? 'Enviando…' : 'Enviar contribuição'}
            </button>
            <p className="text-[0.7rem] text-muted mt-3 text-center">Sua contribuição passa por análise antes de entrar no índice.</p>
          </>
        )}
      </div>
    </main>
  )
}

const inputCls = 'w-full bg-panel border border-line rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
const btnFull = 'w-full bg-paprika text-white rounded-md px-3 py-3 text-sm font-medium hover:brightness-95 transition mt-5 disabled:opacity-60'
const btnInline = 'text-sm bg-paprika text-white px-4 py-2 rounded-md hover:brightness-95 transition'
