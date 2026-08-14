import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";

/**
 * One typeface for the whole app, behind one token, so swapping it is one line.
 *
 * Familjen Grotesk is a Stockholm grotesque and draws Å Ä Ö as designed rather
 * than as accented borrowings. Three weights only: 400 body, 600 everything
 * structural, 700 for the wordmark and the result word. The `latin` subset
 * already carries å, ä and ö (U+00E5, U+00E4, U+00F6).
 */
const familjen = Familjen_Grotesk({
  variable: "--font-familjen",
  subsets: ["latin"],
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
  // The only place --paper's value is duplicated: browser chrome metadata
  // cannot read a CSS custom property. Keep in step with globals.css.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDEBE4" },
    { media: "(prefers-color-scheme: dark)", color: "#16181C" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" className={familjen.variable}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
