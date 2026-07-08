import Link from 'next/link'
import Logo from './Logo'

// footer escuro do mockup (.site-footer): brand + 3 colunas + linha inferior
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div>
          <div style={{ marginBottom: 14 }}><Logo small dark /></div>
          <p style={{ fontSize: 13, maxWidth: 280 }}>
            O custo de produção do prato feito brasileiro, medido a cada coleta em 100 pratos regionais.
          </p>
        </div>
        <div>
          <h5>Produto</h5>
          <Link href="/">Índice</Link>
          <Link href="/metodologia">Metodologia</Link>
          <Link href="/planos">Planos</Link>
          <a href="/contribuir">Contribuir com preços</a>
        </div>
        <div>
          <h5>Infinity</h5>
          <a>Rede Food Service</a>
          <a>Seasoning</a>
          <a>Ponto Food</a>
          <Link href="/sobre">Sobre</Link>
        </div>
        <div>
          <h5>Legal</h5>
          <a>Termos</a>
          <a>Privacidade</a>
          <Link href="/metodologia">Margem de erro ±5%</Link>
        </div>
        <div className="fbottom">
          <span>© 2026 Infinity Inc — Índice PF. Todos os direitos reservados.</span>
          <span>Dados coletados no varejo online e em campo · estimativas em calibração</span>
        </div>
      </div>
    </footer>
  )
}
