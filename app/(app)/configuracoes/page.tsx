'use client'

import { useEffect, useState } from 'react'
import { supabase, usuarioDoStorage, limparSessaoLocal } from '@/lib/supabase'
import {
  getProfile, getRecompensa, getDadosRecompensa, salvarDadosRecompensa, solicitarSaque, getMeusSaques, comRetry,
} from '@/lib/queries'
import { REGIOES, SEXOS, idade, mascararTel, telValido, mascararCpf, cpfValido, brl, SAQUE_MINIMO } from '@/lib/format'
import { Badge, Button, Input, Modal, Select, Tabs, type BadgeTone } from '@/components/ui'

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

export default function ConfiguracoesPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [aba, setAba] = useState<'dados' | 'recompensas'>('dados')
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
  const [rec, setRec] = useState<{ aprovadas: number; ganho: number; disponivel: number } | null>(null)
  const [cpf, setCpf] = useState('')
  const [chavePix, setChavePix] = useState('')
  const [consent, setConsent] = useState(false)
  const [recMsg, setRecMsg] = useState('')
  const [recErro, setRecErro] = useState('')
  const [recBusy, setRecBusy] = useState(false)
  const [erroCarga, setErroCarga] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [modalExcluir, setModalExcluir] = useState(false)
  const [confirmaExcluir, setConfirmaExcluir] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erroExcluir, setErroExcluir] = useState('')

  // sessão garantida pelo layout do shell — aqui só resolve o uid
  useEffect(() => {
    const u = usuarioDoStorage()
    if (u) { setUserId(u.id); setEmail(u.email); return }
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session?.user
      if (s) { setUserId(s.id); setEmail(s.email ?? '') }
    })
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    setErroCarga(false)
    ;(async () => {
      try {
        const [p, r, dr, sq] = await Promise.all([
          comRetry(() => getProfile(userId)), comRetry(() => getRecompensa(userId)),
          comRetry(() => getDadosRecompensa(userId)), comRetry(() => getMeusSaques(userId)),
        ])
        if (cancelado) return
        setNome(p?.nome ?? ''); setTel(p?.telefone ?? ''); setRegiao(p?.regiao ?? '')
        setSexo(p?.sexo ?? ''); setDataNasc(p?.data_nascimento ?? '')
        setAvatarUrl(p?.avatar_url ?? null)
        setRec(r); setSaques(sq)
        if (dr) {
          if (dr.cpf) { setCpf(mascararCpf(dr.cpf)); setConsent(true) }
          setChavePix(dr.chave_pix ?? '')
        }
      } catch {
        if (!cancelado) setErroCarga(true)
      }
    })()
    return () => { cancelado = true }
  }, [userId, tentativa])

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

  async function excluirConta() {
    setErroExcluir(''); setExcluindo(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) { setErroExcluir('Sessão expirada — entre de novo.'); return }
      const r = await fetch('/api/conta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: 'excluir' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErroExcluir(j.erro ?? 'Falha ao excluir a conta.'); return }
      limparSessaoLocal()
      window.location.href = '/'
    } finally {
      setExcluindo(false)
    }
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

  return (
    <main className="max-w-lg mx-auto px-6 py-8">
      <Tabs className="mb-6"
        tabs={[['dados', 'Dados'], ['recompensas', 'Recompensas']] as const}
        active={aba} onChange={setAba} />

      {erroCarga && (
        <div className="mb-4 border border-danger/40 bg-danger-bg text-sm rounded-[var(--r-sm)] px-4 py-3 flex items-center justify-between gap-3">
          <span>Não foi possível carregar seus dados.</span>
          <button className="btn-mk sm" onClick={() => setTentativa(t => t + 1)}>Tentar de novo</button>
        </div>
      )}

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

        <div className="mt-10 border border-danger/40 rounded-[var(--r)] p-4">
          <h3 className="text-sm font-medium">Excluir conta</h3>
          <p className="text-xs text-dim mt-1 leading-relaxed">
            Apaga seu perfil, assinatura, CPF, chave PIX e foto — sem volta. Preços que você enviou
            e já foram aprovados continuam no índice, de forma anônima. Saldo de recompensa não
            sacado é perdido.
          </p>
          <Button variant="secondary" className="mt-3 border-danger/40 text-danger"
            onClick={() => { setConfirmaExcluir(''); setErroExcluir(''); setModalExcluir(true) }}>
            Excluir minha conta
          </Button>
        </div>
      </section>
      )}

      {modalExcluir && (
        <Modal title="Excluir conta" onClose={() => setModalExcluir(false)}>
          <p className="text-sm text-dim leading-relaxed">
            Esta ação é permanente. Para confirmar, digite <b className="text-ink">EXCLUIR</b> abaixo.
          </p>
          <Input className="mt-3" value={confirmaExcluir} onChange={e => setConfirmaExcluir(e.target.value)}
            placeholder="EXCLUIR" aria-label="Digite EXCLUIR para confirmar" />
          {erroExcluir && <p className="text-xs text-danger mt-2">{erroExcluir}</p>}
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" disabled={excluindo} onClick={() => setModalExcluir(false)}>Cancelar</Button>
            <Button disabled={excluindo || confirmaExcluir.trim().toUpperCase() !== 'EXCLUIR'}
              className="bg-danger hover:brightness-110" onClick={excluirConta}>
              {excluindo ? 'Excluindo…' : 'Excluir definitivamente'}
            </Button>
          </div>
        </Modal>
      )}

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
    </main>
  )
}
