'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getIngredientes } from '@/lib/queries'
import type { Ing } from '@/lib/types'

const TIPOS_LOJA = ['Mercado', 'Atacarejo', 'Feira', 'Conveniência']

export default function ContribuirPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null | undefined>(undefined) // undefined = carregando

  const [ings, setIngs] = useState<Ing[]>([])
  const [ingredienteId, setIngredienteId] = useState('')
  const [produto, setProduto] = useState('')
  const [preco, setPreco] = useState('')
  const [pesoG, setPesoG] = useState('')
  const [tipoLoja, setTipoLoja] = useState('')
  const [mercado, setMercado] = useState('')
  const [cidade, setCidade] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [fotoProduto, setFotoProduto] = useState<File | null>(null)
  const [fotoEtiqueta, setFotoEtiqueta] = useState<File | null>(null)
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
      pos => { setCoord({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }); setGeoMsg('') },
      (e) => setGeoMsg(
        e.code === 1 ? 'Permissão negada — habilite a localização para este site no navegador.'
        : e.code === 2 ? 'Localização indisponível agora. Tente de novo.'
        : 'Tempo esgotado ao localizar. Toque de novo (a localização é opcional).',
      ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    )
  }

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>, qual: 'produto' | 'etiqueta') {
    const f = e.target.files?.[0]; if (!f) return
    if (qual === 'produto') { setFotoProduto(f); setPreview(URL.createObjectURL(f)) }
    else setFotoEtiqueta(f)
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
    if (!fotoProduto) { setErro('Adicione a foto do produto com o preço.'); return }
    if (!ingredienteId) { setErro('Selecione o ingrediente correspondente.'); return }
    if (!preco || isNaN(Number(preco.replace(',', '.')))) { setErro('Informe um preço válido.'); return }
    if (!tipoLoja) { setErro('Selecione o tipo de loja.'); return }
    setBusy(true)
    try {
      const foto_url = await uploadFoto(fotoProduto, 'produto')
      const foto_etiqueta_url = fotoEtiqueta ? await uploadFoto(fotoEtiqueta, 'etiqueta') : null
      const { error } = await supabase.from('contribuicoes').insert({
        user_id: userId, ingrediente_id: Number(ingredienteId),
        produto: produto.trim() || null, preco: Number(preco.replace(',', '.')),
        peso_g: pesoG ? Number(pesoG.replace(',', '.')) : null, tipo_loja: tipoLoja,
        mercado: mercado.trim() || null, cidade: cidade.trim() || null,
        lat: coord?.lat ?? null, lng: coord?.lng ?? null,
        foto_url, foto_etiqueta_url, status: 'pendente',
      })
      if (error) throw error
      setOk(true); window.scrollTo(0, 0)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar. Tente novamente.')
    } finally { setBusy(false) }
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
              <button onClick={() => { setOk(false); setFotoProduto(null); setPreview(''); setPreco(''); setIngredienteId('') }}
                className="text-sm border border-paprika text-paprika px-4 py-2 rounded-md hover:bg-paprika hover:text-white transition">
                Enviar outra
              </button>
              <button onClick={() => router.push('/')} className={btnInline}>Voltar ao índice</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">Fotografe o produto com a etiqueta de preço visível.</p>

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
                onChange={e => escolherFoto(e, 'produto')} />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">Ingrediente
                <select value={ingredienteId} onChange={e => setIngredienteId(e.target.value)} className={inputCls}>
                  <option value="">Selecione…</option>
                  {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted">Tipo de loja
                <select value={tipoLoja} onChange={e => setTipoLoja(e.target.value)} className={inputCls}>
                  <option value="">Selecione…</option>
                  {TIPOS_LOJA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted">Preço (R$)
                <input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputCls} />
              </label>
              <label className="text-xs text-muted">Peso/qtd (g, opcional)
                <input value={pesoG} onChange={e => setPesoG(e.target.value)} inputMode="decimal" placeholder="ex: 1000" className={inputCls} />
              </label>
              <label className="text-xs text-muted col-span-2">Mercado / rede (opcional)
                <input value={mercado} onChange={e => setMercado(e.target.value)} placeholder="ex: Assaí, Carrefour…" className={inputCls} />
              </label>
              <label className="text-xs text-muted col-span-2">Cidade (opcional)
                <input value={cidade} onChange={e => setCidade(e.target.value)} className={inputCls} />
              </label>
            </div>

            <div className="flex items-center gap-3 mt-4 text-xs">
              <label className="text-paprika hover:underline cursor-pointer">
                {fotoEtiqueta ? '✓ etiqueta anexada' : '+ foto da etiqueta (opcional)'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => escolherFoto(e, 'etiqueta')} />
              </label>
              <button type="button" onClick={pegarLocal} className="text-paprika hover:underline ml-auto">
                {coord ? `✓ local registrado` : '+ usar minha localização (opcional)'}
              </button>
            </div>
            {geoMsg && <p className="text-xs text-amber-700 mt-2">{geoMsg}</p>}

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
