'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase, limparSessaoLocal, usuarioDoStorage } from '@/lib/supabase'
import {
  getProfile, getMinhasContribuicoes, excluirContribuicao,
  getRecompensa, getDadosRecompensa, salvarDadosRecompensa, solicitarSaque, getMeusSaques,
} from '@/lib/queries'
import { REGIOES, SEXOS, idade, mascararTel, telValido, mascararCpf, cpfValido, brl, SAQUE_MINIMO } from '@/lib/format'
import type { Profile, Contribuicao } from '@/lib/types'
import { Badge, Button, Input, Select, Tabs, type BadgeTone } from '@/components/ui'
import BotaoInicio, { chip } from '../BotaoInicio'

type MeuSaque = { id: number; valor: number; status: string; criado_em: string; pago_em: string | null }
const SAQUE_STATUS: Record<string, { txt: string; tone: BadgeTone }> = {
  solicitado: { txt: 'em processamento', tone: 'neutral' },
  pago:       { txt: 'pago',             tone: 'ok' },
  rejeitada:  { txt: 'rejeitado',        tone: 'danger' },
}

// reduz e recorta a foto num quadrado ~256px antes do upload do avatar
async function comprimirAvatar(file: File, lado = 256, q = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const min = Math.min(bmp.width, bmp.height)
  const sx = (bmp.width - min) / 2, sy = (bmp.height - min) / 2
  const canvas = document.createElement('canvas')
  canvas.width = lado; canvas.height = lado
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, min, min, 0, 0, lado, lado)
  bmp.close()
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('falha ao processar imagem'))), 'image/jpeg', q))
}

const MapaLocal = dynamic(() => import('../MapaLocal'), {
  ssr: false,
  loading: () => <div className="h-[280px] rounded-lg border border-border grid place-items-center text-dim text-sm">carregando mapa…</div>,
})

const STATUS: Record<string, { txt: string; tone: BadgeTone }> = {
  pendente:  { txt: 'em análise', tone: 'neutral' },
  aprovada:  { txt: 'aprovada',   tone: 'ok' },
  rejeitada: { txt: 'rejeitada',  tone: 'danger' },
}

export default function PerfilPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [aba, setAba] = useState<'dados' | 'recompensas' | 'contribuicoes'>('dados')
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [regiao, setRegiao] = useState('')
  const [sexo, setSexo] = useState('')
  const [dataNasc, setDataNasc] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [saques, setSaques] = useState<MeuSaque[]>([])
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [contribs, setContribs] = useState<Contribuicao[] | null>(null)
  const [visiveis, setVisiveis] = useState(10)
  const [rec, setRec] = useState<{ aprovadas: number; ganho: number; disponivel: number } | null>(null)
  const [cpf, setCpf] = useState('')
  const [chavePix, setChavePix] = useState('')
  const [consent, setConsent] = useState(false)
  const [recMsg, setRecMsg] = useState('')
  const [recErro, setRecErro] = useState('')
  const [recBusy, setRecBusy] = useState(false)

  // gate de auth: lê o usuário do storage (síncrono, sem lock) p/ renderizar na
  // hora e reconcilia com a auth real em segundo plano (login/logout)
  useEffect(() => {
    const u = usuarioDoStorage()                 // instantâneo (sem lock) → renderiza já
    if (u) { setUserId(u.id); setEmail(u.email) }
    let resolvido = !!u
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      resolvido = true
      setUserId(session?.user?.id ?? null)
      setEmail(session?.user?.email ?? '')
    })
    // salvaguarda: se a auth não resolver (token quebrado segurando o lock),
    // limpa a sessão e trata como deslogado em vez de congelar a tela
    const t = setTimeout(() => { if (!resolvido) { limparSessaoLocal(); setUserId(null) } }, 4000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  // dados carregam FORA do callback de auth (chamar supabase lá dentro deadlocka)
  useEffect(() => {
    if (userId === undefined) return
    if (userId === null) { router.replace('/entrar?next=%2Fperfil'); return }
    let cancelado = false
    ;(async () => {
      const [p, cs, r, dr, sq] = await Promise.all([
        getProfile(userId), getMinhasContribuicoes(userId), getRecompensa(userId), getDadosRecompensa(userId), getMeusSaques(userId),
      ])
      if (cancelado) return
      setProfile(p)
      setNome(p?.nome ?? ''); setTel(p?.telefone ?? ''); setRegiao(p?.regiao ?? '')
      setSexo(p?.sexo ?? ''); setDataNasc(p?.data_nascimento ?? '')
      setAvatarUrl(p?.avatar_url ?? null)
      setContribs(cs)
      setRec(r)
      setSaques(sq)
      if (dr) {
        if (dr.cpf) { setCpf(mascararCpf(dr.cpf)); setConsent(true) }
        setChavePix(dr.chave_pix ?? '')
      }
    })()
    return () => { cancelado = true }
  }, [userId, router])

  async function salvarRecDados() {
    setRecErro(''); setRecMsg('')
    if (!cpfValido(cpf)) { setRecErro('CPF inválido.'); return }
    if (!chavePix.trim()) { setRecErro('Informe sua chave PIX.'); return }
    if (!consent) { setRecErro('É preciso autorizar o uso do CPF para pagamento.'); return }
    setRecBusy(true)
    const { error } = await salvarDadosRecompensa(userId!, cpf.replace(/\D/g, ''), chavePix.trim())
    setRecBusy(false)
    if (error) { setRecErro(error.message); return }
    setRecMsg('Dados de pagamento salvos.')
  }

  async function pedirSaque() {
    setRecErro(''); setRecMsg('')
    if (!rec || rec.disponivel < SAQUE_MINIMO) return
    if (!cpfValido(cpf) || !chavePix.trim() || !consent) {
      setRecErro('Cadastre e salve CPF e chave PIX antes de solicitar o saque.'); return
    }
    setRecBusy(true)
    const { error } = await solicitarSaque(userId!, rec.disponivel, cpf.replace(/\D/g, ''), chavePix.trim())
    setRecBusy(false)
    if (error) { setRecErro(error.message); return }
    setRecMsg('Saque solicitado. O pagamento será feito no PIX informado em breve.')
    setRec(await getRecompensa(userId!))
  }

  async function trocarAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setErro(''); setMsg(''); setAvatarBusy(true)
    try {
      const blob = await comprimirAvatar(f)
      const path = `${userId}/avatar.jpg`
      const { error: upErr } = await supabase.storage.from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr
      const base = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      const url = `${base}?v=${Date.now()}`   // cache-busting: caminho fixo, conteúdo novo
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId!)
      if (dbErr) throw dbErr
      setAvatarUrl(url)
      setMsg('Foto de perfil atualizada.')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar a foto. Tente novamente.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function salvar() {
    setErro(''); setMsg('')
    if (!nome.trim()) { setErro('Informe seu nome.'); return }
    if (!telValido(tel)) { setErro('Informe um telefone válido com DDD.'); return }
    if (!regiao) { setErro('Selecione sua região.'); return }
    setSalvando(true)
    const { error } = await supabase.from('profiles')
      .update({ nome: nome.trim(), telefone: tel, regiao, sexo: sexo || null, data_nascimento: dataNasc || null }).eq('id', userId!)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setMsg('Perfil salvo.')
  }

  async function deletar(id: number) {
    if (!confirm('Excluir esta contribuição?')) return
    await excluirContribuicao(id)
    setContribs(prev => prev ? prev.filter(c => c.id !== id) : prev)
  }

  if (userId === undefined) {
    return <main className="min-h-screen grid place-items-center text-dim text-sm">Carregando…</main>
  }
  if (!userId) return null

  return (
    <main className="min-h-screen">
      <header className="border-b border-border sticky top-0 bg-surface/80 backdrop-blur z-10">
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
          <BotaoInicio />
          <h1 className="text-xl font-bold tracking-tight ml-1">Meu perfil</h1>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className={`${chip} ml-auto`}>Sair</button>
        </div>
      </header>

      <Tabs className="max-w-lg mx-auto px-6 pt-4"
        tabs={[['dados', 'Dados'], ['recompensas', 'Recompensas'], ['contribuicoes', 'Minhas contribuições']] as const}
        active={aba} onChange={setAba} />

      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Dados */}
        {aba === 'dados' && (
        <section>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-surface-3 border border-border shrink-0 grid place-items-center">
              {avatarUrl
                ? <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
                : <span className="text-2xl text-dim">{(nome || email || '?').trim().charAt(0).toUpperCase()}</span>}
            </div>
            <label className={`inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium transition bg-surface text-ink border border-border-2 hover:bg-surface-2 cursor-pointer ${avatarBusy ? 'opacity-60 pointer-events-none' : ''}`}>
              {avatarBusy ? 'Enviando…' : avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
              <input type="file" accept="image/*" className="hidden" onChange={trocarAvatar} disabled={avatarBusy} />
            </label>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-dim">E-mail</label>
              <Input value={email} disabled className="opacity-60" />
            </div>
            <div>
              <label className="text-xs text-dim">Nome</label>
              <Input value={nome} onChange={e => setNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim">Telefone (com DDD)</label>
              <Input value={tel} onChange={e => setTel(mascararTel(e.target.value))}
                placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="text-xs text-dim">Região</label>
              <Select value={regiao} onChange={e => setRegiao(e.target.value)}>
                <option value="">Selecione…</option>
                {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-dim">Sexo</label>
                <Select value={sexo} onChange={e => setSexo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {SEXOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-dim">Nascimento{idade(dataNasc) != null ? ` · ${idade(dataNasc)} anos` : ''}</label>
                <Input type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} />
              </div>
            </div>
            {erro && <p className="text-xs text-danger">{erro}</p>}
            {msg && <p className="text-xs text-ok">{msg}</p>}
            <Button disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </section>
        )}

        {/* Recompensas */}
        {aba === 'recompensas' && (
        <section>
          {!rec ? <p className="text-sm text-dim">Carregando…</p> : (
            <>
              <div className="border border-border rounded-[var(--r)] bg-surface p-4 mb-4">
                <p className="text-xs text-dim">Saldo disponível</p>
                <p className="text-3xl font-bold tracking-tight tnum mt-0.5">{brl(rec.disponivel)}</p>
                <p className="text-xs text-dim mt-1">
                  {rec.aprovadas} {rec.aprovadas === 1 ? 'contribuição aprovada' : 'contribuições aprovadas'} · {brl(rec.ganho)} acumulados
                </p>
                {rec.disponivel < SAQUE_MINIMO && (
                  <p className="text-xs text-dim mt-2">
                    Faltam {brl(SAQUE_MINIMO - rec.disponivel)} para atingir o saque mínimo de {brl(SAQUE_MINIMO)}.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-dim">CPF (para pagamento e nota fiscal)</label>
                  <Input value={cpf} onChange={e => setCpf(mascararCpf(e.target.value))}
                    placeholder="000.000.000-00" inputMode="numeric" />
                </div>
                <div>
                  <label className="text-xs text-dim">Chave PIX</label>
                  <Input value={chavePix} onChange={e => setChavePix(e.target.value)}
                    placeholder="CPF, e-mail, telefone ou aleatória" />
                </div>
                <label className="flex items-start gap-2 text-xs text-dim leading-relaxed">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                    className="mt-0.5 accent-accent" />
                  Autorizo o uso do meu CPF e chave PIX exclusivamente para o pagamento das recompensas,
                  conforme a Lei Geral de Proteção de Dados (LGPD).
                </label>
                {recErro && <p className="text-xs text-danger">{recErro}</p>}
                {recMsg && <p className="text-xs text-ok">{recMsg}</p>}
                <div className="flex items-center gap-3">
                  <Button variant="secondary" disabled={recBusy} onClick={salvarRecDados}>
                    {recBusy ? 'Salvando…' : 'Salvar dados'}
                  </Button>
                  <Button disabled={recBusy || rec.disponivel < SAQUE_MINIMO} onClick={pedirSaque}>
                    Solicitar saque
                  </Button>
                </div>
              </div>

              {saques.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium mb-2">Histórico de saques</h3>
                  <div className="space-y-2">
                    {saques.map(s => {
                      const st = SAQUE_STATUS[s.status] || SAQUE_STATUS.solicitado
                      return (
                        <div key={s.id} className="flex items-center gap-3 border border-border rounded-[var(--r-sm)] p-2 bg-surface text-sm">
                          <span className="tnum font-medium">{brl(Number(s.valor))}</span>
                          <span className="text-xs text-dim">
                            solicitado {new Date(s.criado_em).toLocaleDateString('pt-BR')}
                            {s.pago_em ? ` · pago ${new Date(s.pago_em).toLocaleDateString('pt-BR')}` : ''}
                          </span>
                          <Badge tone={st.tone} className="ml-auto shrink-0">{st.txt}</Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
        )}

        {/* Contribuições */}
        {aba === 'contribuicoes' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold tracking-tight">Minhas contribuições</h2>
            <button onClick={() => router.push('/contribuir')}
              className="text-sm border border-accent text-accent px-3 py-1.5 rounded-[var(--r-sm)] hover:bg-accent hover:text-white transition cursor-pointer">
              Contribuir
            </button>
          </div>
          {(() => {
            const pontos = (contribs || []).filter(c => c.lat != null && c.lng != null)
              .map(c => ({ lat: c.lat as number, lng: c.lng as number,
                label: `${c.ingredientes?.nome || c.produto || 'Produto'}${c.preco != null ? ` — R$ ${Number(c.preco).toFixed(2)}` : ''}${c.cidade ? ` · ${c.cidade}` : ''}` }))
            return pontos.length ? <div className="mb-4"><MapaLocal points={pontos} height="280px" /></div> : null
          })()}
          {!contribs ? <p className="text-sm text-dim">Carregando…</p>
            : !contribs.length ? <p className="text-sm text-dim">Você ainda não enviou nenhuma contribuição.</p>
            : (
              <div className="space-y-2">
                {contribs.slice(0, visiveis).map(i => {
                  const s = STATUS[i.status] || STATUS.pendente
                  return (
                    <div key={i.id} className="flex items-center gap-3 border border-border rounded-[var(--r-sm)] p-2 bg-surface">
                      {i.foto_url
                        ? <img src={i.foto_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                        : <div className="w-12 h-12 rounded bg-surface-3 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{i.ingredientes?.nome || i.produto || 'Produto'}</p>
                        <p className="text-xs text-dim truncate">
                          {i.preco != null ? `R$ ${Number(i.preco).toFixed(2)} · ` : ''}{new Date(i.criado_em).toLocaleDateString('pt-BR')}{i.cidade ? ` · ${i.cidade}` : ''}
                        </p>
                      </div>
                      <Badge tone={s.tone} className="shrink-0">{s.txt}</Badge>
                      {i.status === 'pendente' && (
                        <button onClick={() => deletar(i.id)}
                          className="text-xs text-dim hover:text-danger shrink-0 cursor-pointer">excluir</button>
                      )}
                    </div>
                  )
                })}
                {contribs.length > visiveis && (
                  <button onClick={() => setVisiveis(v => v + 10)}
                    className={`${chip} w-full justify-center py-2 mt-1`}>
                    Ver mais ({contribs.length - visiveis} restantes)
                  </button>
                )}
              </div>
            )}
        </section>
        )}
      </div>
    </main>
  )
}
