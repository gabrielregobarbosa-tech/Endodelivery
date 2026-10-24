import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EndoDelivery · Gestão endodôntica", template: "%s · EndoDelivery" },
  description: "Seu cuidado, organizado. Gestão clínica para endodontistas.",
  applicationName: "EndoDelivery",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "EndoDelivery" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f8f7" }, { media: "(prefers-color-scheme: dark)", color: "#101c21" }]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning><body>{children}<PwaRegister /></body></html>;
}
