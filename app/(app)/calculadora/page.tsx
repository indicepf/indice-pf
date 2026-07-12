import Calculadora from '../painel/Calculadora'

export default function CalculadoraPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold tracking-tight">Calculadora de PF</h2>
      <div className="mt-4">
        <Calculadora />
      </div>
    </main>
  )
}
