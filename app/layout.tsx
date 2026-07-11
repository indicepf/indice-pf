import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import RegistrarSW from "./RegistrarSW";
import CookieConsent from "@/components/site/CookieConsent";
import { AuthProvider } from "./useAuth";

const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://indicepratofeito.com.br"),
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
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Índice PF",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0069D4",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased`}>
        <RegistrarSW />
        <AuthProvider>{children}</AuthProvider>
        {/* LGPD: GTM/GA4 só carrega após o aceite no banner */}
        <CookieConsent gtmId={gtmId} />
      </body>
    </html>
  );
}
