'use client'

import { useEffect, useRef, useState } from 'react'

// Câmera dentro do app. O input com capture="environment" obriga o ciclo
// fotografar → OK → reabrir o seletor a cada item, o que cansa e faz o
// contribuinte desistir no meio da coleta. Aqui o obturador dispara e o preview
// segue vivo para a próxima foto; o envio é um só, no fim.
//
// Componente controlado: a página continua dona das fotos e do envio.
export default function Camera({ fotos, onCapturar, onRemover, onGaleria, onEnviar, onFechar, busy, progresso }: {
  fotos: { preview: string }[]
  onCapturar: (f: File) => void
  onRemover: (i: number) => void
  onGaleria: () => void
  onEnviar: () => void
  onFechar: () => void
  busy: boolean
  progresso: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [erro, setErro] = useState('')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    let vivo = true
    async function iniciar() {
      if (streamRef.current || document.hidden) return
      try {
        // 1920 ideal: sobra resolução para a etiqueta e o corte para 1600
        // acontece na captura, sem um segundo decode
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        })
        if (!vivo) { s.getTracks().forEach(t => t.stop()); return }   // fechou enquanto pedia permissão
        streamRef.current = s
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}) }
      } catch (e) {
        setErro((e as Error)?.name === 'NotAllowedError'
          ? 'Permissão de câmera negada. Libere nas configurações do navegador ou use a galeria.'
          : 'Câmera indisponível neste dispositivo. Use a galeria.')
      }
    }
    function parar() {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
    // o iOS congela o preview ao voltar do segundo plano — soltar as tracks e
    // refazer o stream é mais confiável, e apaga o indicador de câmera em uso
    const onVis = () => { if (document.hidden) parar(); else iniciar() }
    iniciar()
    document.addEventListener('visibilitychange', onVis)
    return () => { vivo = false; document.removeEventListener('visibilitychange', onVis); parar() }
  }, [])

  async function capturar() {
    const v = videoRef.current
    if (!v?.videoWidth) return
    // mesmos 1600px/0.8 de comprimirImagem — o frame já é bitmap, então a foto
    // da câmera não passa por lá de novo
    const escala = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(v.videoWidth * escala)
    canvas.height = Math.round(v.videoHeight * escala)
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8))
    if (blob) onCapturar(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    setFlash(true); setTimeout(() => setFlash(false), 120)
  }

  return (
    <div className="fixed inset-0 z-[900] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="relative flex-1 min-h-0">
        {erro
          ? <div className="h-full grid place-items-center px-8 text-center text-white/80 text-sm">{erro}</div>
          // os três atributos juntos são obrigatórios no iOS: sem playsInline o
          // Safari abre o player fullscreen por cima do obturador
          : <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />}
        {flash && <div className="absolute inset-0 bg-white/70" />}
        <button onClick={onFechar} aria-label="Fechar câmera"
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 text-white text-xl leading-none grid place-items-center cursor-pointer">×</button>
      </div>

      {fotos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 bg-black/80 shrink-0">
          {fotos.map((f, i) => (
            <div key={i} className="relative w-14 h-14 shrink-0 rounded overflow-hidden">
              <img src={f.preview} alt="" className="w-full h-full object-cover" />
              <button onClick={() => onRemover(i)} aria-label={`Remover foto ${i + 1}`}
                className="absolute top-0 right-0 bg-black/70 text-white w-4 h-4 text-[0.6rem] leading-none grid place-items-center cursor-pointer">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-5 py-4 bg-black shrink-0">
        <button onClick={onGaleria} disabled={busy} className="text-white text-sm w-24 text-left cursor-pointer disabled:opacity-50">Galeria</button>
        <button onClick={capturar} disabled={!!erro || busy} aria-label="Tirar foto"
          className="w-16 h-16 rounded-full border-4 border-white bg-white/30 shrink-0 cursor-pointer disabled:opacity-40" />
        <div className="w-24 text-right">
          {fotos.length > 0 && (
            <button onClick={onEnviar} disabled={busy}
              className="text-white text-sm font-medium cursor-pointer disabled:opacity-60">
              {busy ? (progresso || 'Enviando…') : `Enviar (${fotos.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
