import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
const sans = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-sans" });
export const metadata: Metadata = {
  title: "NeuralDAO 2.0 | Hackathon clock",
  description: "The shared hackathon clock for NeuralDAO 2.0. October 8, 2026, 08:30–16:30 IST, Netaji Auditorium.",
  openGraph: { title: "NeuralDAO 2.0", description: "Eight hours. One shared clock.", type: "website" },
  robots: { index: true, follow: true }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d0a16" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body className={sans.variable}><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=location.pathname==='/display'?'dark':localStorage.getItem('neuraldao-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}" }}/>{children}</body></html>;
}
