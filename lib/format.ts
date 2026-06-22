export const MODOS = [
	{
		key: "online",
		label: "Online",
		desc: 0.0,
		nota: "preço coletado no varejo online",
	},
	{
		key: "mercado",
		label: "Mercado",
		desc: 0.1,
		nota: "estimativa −10% sobre o online",
	},
	{
		key: "atacarejo",
		label: "Atacarejo",
		desc: 0.22,
		nota: "estimativa −22% sobre o online",
	},
] as const;

export const REGIOES = [
	"Sul",
	"Sudeste",
	"Centro-oeste",
	"Nordeste",
	"Norte",
] as const;

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
export const SAQUE_MINIMO = 0.02; // R$ mínimo para solicitar saque

export function mascararCpf(v: string) {
	return v
		.replace(/\D/g, "")
		.slice(0, 11)
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
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
