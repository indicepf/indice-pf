// Níveis de preço (merge V0 × mockup V1): keys da V0 preservadas (estado,
// calibração); nomenclatura do mockup nos labels. "Indústria" fica
// indisponível até haver dado ou percentual definido (decisão D5 do plano).
export type NivelPreco = {
	key: string;
	label: string;
	grupo: "consumidor" | "atacarejo" | "industria";
	desc: number; // desconto sobre o preço online (0–1)
	nota: string;
	disponivel: boolean;
};

export const NIVEIS_PRECO: readonly NivelPreco[] = [
	{
		key: "online",
		label: "Consumidor — online",
		grupo: "consumidor",
		desc: 0.0,
		nota: "preço coletado no varejo online",
		disponivel: true,
	},
	{
		key: "mercado",
		label: "Consumidor — mercado",
		grupo: "consumidor",
		desc: 0.1,
		nota: "estimativa −10% sobre o online",
		disponivel: true,
	},
	{
		key: "atacarejo",
		label: "Atacarejo",
		grupo: "atacarejo",
		desc: 0.22,
		nota: "estimativa −22% sobre o online",
		disponivel: true,
	},
	{
		key: "industria",
		label: "Indústria",
		grupo: "industria",
		desc: 0,
		nota: "em breve",
		disponivel: false,
	},
] as const;

// alias de transição (V0) — só os níveis disponíveis; remover na Fase 11
export const MODOS = NIVEIS_PRECO.filter((n) => n.disponivel);

export const REGIOES = [
	"Sul",
	"Sudeste",
	"Centro-oeste",
	"Nordeste",
	"Norte",
] as const;

export const SEXOS = [
	{ value: "M", label: "Masculino" },
	{ value: "F", label: "Feminino" },
	{ value: "O", label: "Outro" },
	{ value: "N", label: "Prefiro não informar" },
] as const;

// idade em anos cheios a partir da data de nascimento (YYYY-MM-DD); null se vazio
export function idade(dataNasc?: string | null): number | null {
	if (!dataNasc) return null;
	const n = new Date(dataNasc);
	if (isNaN(n.getTime())) return null;
	const hoje = new Date();
	let anos = hoje.getFullYear() - n.getFullYear();
	const m = hoje.getMonth() - n.getMonth();
	if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) anos--;
	return anos >= 0 && anos < 130 ? anos : null;
}

export const brl = (v: number) =>
	v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function fmtData(d: string) {
	const [a, m, dia] = d.split("-");
	return `${dia}/${m}/${a}`;
}

// remove o "12. " do início do nome do prato
export function limparNome(nome: string) {
	return nome.replace(/^\d+\.\s*/, "");
}

// chave de ordenação por nome: ignora aspas/pontuação iniciais para
// '"TV de Cachorro" (Frango Assado)' ordenar pelo T, não pelas aspas
export function nomeOrdenacao(nome: string) {
	return limparNome(nome).replace(/^[^\p{L}\p{N}]+/u, "");
}

// unidade do ingrediente → rótulo do campo de quantidade na contribuição
export function rotuloQtd(unidade?: string | null) {
	switch (unidade) {
		case "ml": return "Quantidade (ml)";
		case "unidade": return "Quantidade (unidades)";
		case "maco": return "Quantidade (maços)";
		default: return "Peso/qtd (g)";
	}
}
// placeholder de exemplo conforme a unidade
export function exemploQtd(unidade?: string | null) {
	switch (unidade) {
		case "ml": return "ex: 900";
		case "unidade": return "ex: 12";
		case "maco": return "ex: 1";
		default: return "ex: 1000";
	}
}
// unidade curta para legendas compactas (ex.: admin)
export function unidadeCurta(unidade?: string | null) {
	switch (unidade) {
		case "ml": return "ml";
		case "unidade": return "un";
		case "maco": return "maço";
		default: return "g";
	}
}

// (XX) XXXXX-XXXX
export function mascararTel(v: string) {
	const d = v.replace(/\D/g, "").slice(0, 11);
	if (d.length <= 2) return d;
	if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
	return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const telValido = (v: string) => v.replace(/\D/g, "").length >= 10;

// ─── Recompensa ────────────────────────────────────────────────────────────
export const VALOR_POR_FOTO = 0.01; // R$ por contribuição aprovada
export const SAQUE_MINIMO = 10; // R$ mínimo para solicitar saque

export function mascararCpf(v: string) {
	return v
		.replace(/\D/g, "")
		.slice(0, 11)
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// exibição parcial na UI admin — mostra só os 4 últimos dígitos (o admin faz o
// PIX pela chave, não precisa do CPF inteiro); minimização de dado pessoal
export function cpfParcial(v: string | null | undefined) {
	const d = (v ?? "").replace(/\D/g, "");
	if (d.length < 4) return "—";
	return `•••.•••.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}
export function cpfValido(v: string) {
	const c = v.replace(/\D/g, "");
	if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
	let s = 0;
	for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
	let d = (s * 10) % 11;
	if (d === 10) d = 0;
	if (d !== +c[9]) return false;
	s = 0;
	for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
	d = (s * 10) % 11;
	if (d === 10) d = 0;
	return d === +c[10];
}
