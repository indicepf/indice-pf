// Ações de autenticação extraídas do modal app/Auth.tsx (Fase 4) —
// usadas pelas páginas /entrar, /cadastro, /esqueci-senha e /completar-perfil.
import { supabase } from './supabase'
import { capturarContexto } from './contexto'
import { registrarLogin } from './queries'
import { telValido } from './format'

export const emailValido = (e: string) => /.+@.+\..+/.test(e)

// registra o login (dispositivo + GPS) em segundo plano — não bloqueia
export function registrarLoginBg(uid: string) {
  capturarContexto().then(ctx => registrarLogin(uid, ctx)).catch(() => {})
}

export async function entrar(email: string, senha: string): Promise<{ uid?: string; erro?: string }> {
  if (!emailValido(email)) return { erro: 'Informe um e-mail válido.' }
  if (!senha) return { erro: 'Informe a senha.' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error || !data.user) return { erro: 'E-mail ou senha incorretos.' }
  registrarLoginBg(data.user.id)
  return { uid: data.user.id }
}

export async function criarConta(email: string, senha: string):
  Promise<{ uid?: string; pendenteConfirmacao?: boolean; erro?: string }> {
  if (!emailValido(email)) return { erro: 'Informe um e-mail válido.' }
  if (senha.length < 6) return { erro: 'A senha precisa ter ao menos 6 caracteres.' }
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    // confirmação de e-mail ligada: o link do e-mail volta para /completar-perfil
    // (mesmo destino do fluxo sem confirmação), na mesma origem do cadastro
    options: { emailRedirectTo: `${window.location.origin}/completar-perfil` },
  })
  if (error) {
    return {
      erro: /rate limit/i.test(error.message)
        ? 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.'
        : error.message,
    }
  }
  if (data.session && data.user) {
    registrarLoginBg(data.user.id)
    return { uid: data.user.id }
  }
  return { pendenteConfirmacao: true }
}

export async function enviarResetSenha(email: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!emailValido(email)) return { erro: 'Informe seu e-mail para receber o link.' }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  })
  if (error) {
    return {
      erro: /rate limit/i.test(error.message)
        ? 'Limite de e-mails atingido. Tente novamente mais tarde.' : error.message,
    }
  }
  return { ok: true }
}

export async function salvarPerfilBasico(uid: string, nome: string, tel: string, regiao: string):
  Promise<{ erro?: string }> {
  if (!nome.trim()) return { erro: 'Informe seu nome.' }
  if (!telValido(tel)) return { erro: 'Informe um telefone válido com DDD.' }
  if (!regiao) return { erro: 'Selecione sua região.' }
  const { error } = await supabase.from('profiles')
    .update({ nome: nome.trim(), telefone: tel, regiao }).eq('id', uid)
  return error ? { erro: error.message } : {}
}
