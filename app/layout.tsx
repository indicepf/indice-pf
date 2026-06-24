import type { Metadata } from "next";
import { Lora, Inter } from "next/font/google";
import "./globals.css";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://indice-pf-ashen.vercel.app"),
  title: "Índice PF — custo do prato feito no Brasil",
  description:
    "O custo de produção de pratos feitos regionais brasileiros, medido a cada coleta.",
  openGraph: {
    title: "Índice PF — custo do prato feito no Brasil",
    description:
      "O custo de produção de pratos feitos regionais brasileiros, medido a cada coleta.",
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Índice PF — custo do prato feito no Brasil",
    description:
      "O custo de produção de pratos feitos regionais brasileiros, medido a cada coleta.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${lora.variable} ${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
