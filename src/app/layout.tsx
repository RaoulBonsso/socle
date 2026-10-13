import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { Logo } from "@/components/logo";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://socle-raoul.vercel.app"),
  title: { default: "Socle — un défi réel par jour", template: "%s · Socle" },
  description: "Devenir excellent en DevOps, data engineering et full stack par la pratique : un incident réel à résoudre chaque jour avant minuit, des fiches terrain, la révision espacée et l'actualité officielle.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "Socle" },
};

export const viewport: Viewport = { themeColor: "#0a0e0d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ambre focus:px-4 focus:py-2 focus:text-black">Aller au contenu</a>
        <header className="sticky top-0 z-40 border-b border-ligne bg-fond/95 md:bg-fond/75 md:backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><Logo /> Socle</Link>
            <Nav />
          </div>
        </header>
        <main id="contenu" className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 md:pb-16">{children}</main>
        <footer className="border-t border-ligne">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-discret sm:flex-row sm:justify-between sm:px-6">
            <p className="flex items-center gap-2"><Logo className="size-5" /> Socle — par <a className="text-texte hover:text-ambre" href="https://github.com/RaoulBonsso">Raoul Bonsso</a></p>
            <p><Link href="/methode" className="hover:text-ambre">La méthode</Link> · <a className="hover:text-ambre" href="https://github.com/RaoulBonsso/socle">Code source (MIT)</a></p>
          </div>
        </footer>
      </body>
    </html>
  );
}
