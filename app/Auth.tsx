'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth, perfilCompleto } from './useAuth'
import { Button } from '@/components/ui'

// Controles de conta do cabeçalho. O login/cadastro vive nas páginas
// /entrar e /cadastro (Fase 4) — aqui só navegação, menu e o CTA de contribuição.
export default function AuthControls() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const [menu, setMenu] = useState(false)
  const [cta, setCta] = useState(false)

  function irContribuir() {
    if (!user) { router.push('/cadastro?next=%2Fcontribuir'); return }
    if (!perfilCompleto(profile)) { router.push('/completar-perfil?next=%2Fcontribuir'); return }
    router.push('/contribuir')
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => { if (user && perfilCompleto(profile)) router.push('/contribuir'); else setCta(true) }}
          className="btn-mk sm">
          Contribuir
        </button>
        {user ? (
          <div className="relative">
            <button onClick={() => setMenu(m => !m)}
              className="flex items-center gap-2 text-sm px-2 py-1 rounded-[var(--r-sm)] hover:bg-surface-2 transition-colors cursor-pointer">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-border" />
                : <span className="w-7 h-7 rounded-full bg-surface-3 border border-border grid place-items-center text-xs text-dim">
                    {((profile?.nome || user.email || '?').trim().charAt(0) || '?').toUpperCase()}
                  </span>}
              {profile?.nome ? profile.nome.split(' ')[0] : (user.email ?? 'Conta')} ▾
            </button>
            {menu && (
              <div className="absolute right-0 mt-1 w-44 bg-surface border border-border rounded-[var(--r-sm)] shadow-[var(--shadow-md)] text-sm py-1 z-50">
                <button onClick={() => { setMenu(false); router.push('/painel') }}
                  className="block w-full text-left px-3 py-2 hover:bg-surface-2">Meu painel</button>
                <button onClick={() => { setMenu(false); router.push('/configuracoes') }}
                  className="block w-full text-left px-3 py-2 hover:bg-surface-2">Configurações</button>
                {profile?.is_admin && (
                  <button onClick={() => { setMenu(false); router.push('/admin') }}
                    className="block w-full text-left px-3 py-2 hover:bg-surface-2 text-accent">Administração</button>
                )}
                <button onClick={async () => { setMenu(false); await supabase.auth.signOut() }}
                  className="block w-full text-left px-3 py-2 hover:bg-surface-2">Sair</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <button onClick={() => router.push('/entrar')} className="btn-mk ghost sm">
              Entrar
            </button>
            <button onClick={() => router.push('/cadastro')} className="btn-mk primary sm max-sm:hidden">
              Criar conta
            </button>
          </>
        )}
      </div>

      {cta && (
        <Overlay onClose={() => setCta(false)}>
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-accent mb-2">Faça parte</p>
          <h3 className="text-2xl font-bold tracking-tight leading-tight mb-3">
            Quanto custa o prato feito na sua cidade?
          </h3>
          <p className="text-sm text-dim leading-relaxed mb-5">
            O Índice PF mede isso com dados reais do Brasil inteiro. Fotografe um preço no mercado e ajude a
            tornar o índice mais preciso — contribuições aprovadas rendem <strong>recompensa via PIX</strong>.
          </p>
          <Button full onClick={() => { setCta(false); irContribuir() }}>Quero contribuir</Button>
          <button onClick={() => setCta(false)} className="text-xs text-dim hover:text-ink mt-3 block mx-auto cursor-pointer">fechar</button>
        </Overlay>
      )}
    </>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const esc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => { document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [esc])
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/30 px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-surface border border-border rounded-[var(--r-lg)] p-6 max-w-sm w-full shadow-[var(--shadow-lg)] relative">
        <button onClick={onClose} className="absolute top-3 right-4 text-dim hover:text-ink text-xl leading-none cursor-pointer">×</button>
        {children}
      </div>
    </div>
  )
}
