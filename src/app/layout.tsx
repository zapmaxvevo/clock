import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@/lib/utils";
import { themeClassOf } from "@/modules/profile/service";
import { currentSession } from "@/server/session";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clock",
  description: "Carga de horas y administración del equipo.",
};

/**
 * La clase del tema la dibuja el servidor (ADR 0015). `currentSession` y no
 * `requireSession`: este layout también envuelve `/login`, que sigue al sistema.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();

  return (
    <html
      lang="es"
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "h-full antialiased",
        themeClassOf(session),
      )}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
