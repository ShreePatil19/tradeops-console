import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tradeops-console.vercel.app"),
  title: "TradeOps Console",
  description:
    "Four agents for a trade ops desk: PDF invoice extraction, inbox triage, sanctions pre-check, and customs Q&A with RAG.",
  openGraph: {
    title: "TradeOps Console",
    description:
      "Four AI agents for a trade ops desk. Reasoning streams token by token; tool calls render as cards.",
    url: "https://tradeops-console.vercel.app",
    siteName: "TradeOps Console",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeOps Console",
    description:
      "Four AI agents for a trade ops desk. Reasoning streams token by token; tool calls render as cards.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
