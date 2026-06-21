'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TIPOS_LOJA = ['Mercado', 'Atacarejo', 'Feira', 'Conveniência']

type Ing = { id: number; nome: string; categoria: string | null }

export default function Contribuir({ userId, onClose }: { userId: string; onClose: () => void }) {
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
  const [preview, setPreview] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const geoTry = useRef(false)

  useEffect(() => {
    supabase.from('ingredientes').select('id,nome,categoria').order('nome').then(({ data }) => setIngs((data as Ing[]) || []))
  }, [])

  function pegarLocal() {
    geoTry.current = true
    if (!navigator.geolocation) { setErro('Geolocalização não disponível neste dispositivo.'); return }
    navigator.geolocation.getCurrentPosition(
      pos => setCoord({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }),
      () => setErro('Não foi possível obter sua localização (permissão negada).'),
      { enableHighAccuracy: true, timeout: 8000 },
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
        user_id: userId,
        ingrediente_id: Number(ingredienteId),
        produto: produto.trim() || null,
        preco: Number(preco.replace(',', '.')),
        peso_g: pesoG ? Number(pesoG.replace(',', '.')) : null,
        tipo_loja: tipoLoja,
        mercado: mercado.trim() || null,
        cidade: cidade.trim() || null,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        foto_url,
        foto_etiqueta_url,
        status: 'pendente',
      })
      if (error) throw error
      setOk(true)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/30 px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-panel border border-line rounded-xl p-6 max-w-md w-full shadow-2xl relative my-auto">
        <button onClick={onClose} className="absolute top-3 right-4 text-muted hover:text-ink text-xl leading-none">×</button>

        {ok ? (
          <div className="text-center py-6">
            <h3 className="font-[family-name:var(--font-serif)] text-2xl mb-2">Obrigado!</h3>
            <p className="text-sm text-muted leading-relaxed mb-5">
              Sua contribuição foi enviada e está <strong>em análise</strong>. Quando aprovada, ela ajuda a calibrar
              o índice — e conta para a sua recompensa.
            </p>
            <button onClick={onClose} className={btnCls}>Fechar</button>
          </div>
        ) : (
          <>
            <h3 className="font-[family-name:var(--font-serif)] text-xl mb-1">Contribuir com um preço</h3>
            <p className="text-sm text-muted mb-4">Fotografe o produto com a etiqueta de preço visível.</p>

            {/* Foto do produto + guia de enquadramento */}
            <label className="block">
              <div className="aspect-[4/3] rounded-lg border-2 border-dashed border-line bg-cream grid place-items-center overflow-hidden cursor-pointer hover:border-paprika transition-colors">
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

            <div className="mt-3 grid grid-cols-2 gap-3">
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
                <input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal"
                  placeholder="0,00" className={inputCls} />
              </label>
              <label className="text-xs text-muted">Peso/qtd (g, opcional)
                <input value={pesoG} onChange={e => setPesoG(e.target.value)} inputMode="decimal"
                  placeholder="ex: 1000" className={inputCls} />
              </label>
              <label className="text-xs text-muted col-span-2">Mercado / rede (opcional)
                <input value={mercado} onChange={e => setMercado(e.target.value)}
                  placeholder="ex: Assaí, Carrefour…" className={inputCls} />
              </label>
              <label className="text-xs text-muted col-span-2">Cidade (opcional)
                <input value={cidade} onChange={e => setCidade(e.target.value)} className={inputCls} />
              </label>
            </div>

            {/* foto da etiqueta + localização */}
            <div className="flex items-center gap-3 mt-3 text-xs">
              <label className="text-paprika hover:underline cursor-pointer">
                {fotoEtiqueta ? '✓ etiqueta anexada' : '+ foto da etiqueta (opcional)'}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => escolherFoto(e, 'etiqueta')} />
              </label>
              <button type="button" onClick={pegarLocal} className="text-paprika hover:underline ml-auto">
                {coord ? `✓ local (${coord.lat}, ${coord.lng})` : '+ usar minha localização'}
              </button>
            </div>

            {erro && <p className="text-xs text-red-600 mt-3">{erro}</p>}
            <button disabled={busy} onClick={enviar} className={btnCls}>
              {busy ? 'Enviando…' : 'Enviar contribuição'}
            </button>
            <p className="text-[0.7rem] text-muted mt-3">
              Sua contribuição passa por análise antes de entrar no índice.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
const btnCls = 'w-full bg-paprika text-white rounded-md px-3 py-2.5 text-sm font-medium hover:brightness-95 transition mt-4 disabled:opacity-60'
