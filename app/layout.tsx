import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Doto } from "next/font/google";
import "./globals.css";
const sans = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-sans" });
const led = Doto({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-led" });
export const metadata: Metadata = {
  title: "NeuralDAO 2.0 | Hackathon clock",
  description: "The shared hackathon clock for NeuralDAO 2.0. October 8, 2026, 08:30–16:30 IST, Netaji Auditorium.",
  openGraph: { title: "NeuralDAO 2.0", description: "Eight hours. One shared clock.", type: "website" },
  robots: { index: true, follow: true }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#050505" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body className={`${sans.variable} ${led.variable}`}><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=location.pathname==='/display'?'dark':localStorage.getItem('neuraldao-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}" }}/>{children}</body></html>;
}
