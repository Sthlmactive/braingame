import type { Metadata, Viewport } from "next";
import { Archivo, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";

// Self hosted by next/font. No CDN request at runtime.
// latin-ext is included so Å Ä Ö render from the same file as the rest.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ordlek",
  description: "Seven word games in Swedish and English.",
  applicationName: "Ordlek",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Ordlek",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0D1016",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" className={`${bricolage.variable} ${archivo.variable}`}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
