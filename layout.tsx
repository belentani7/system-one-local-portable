import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "System One Local — typed decisions, not prose",
  description:
    "Réplica local del contrato /v1/systemone de TypeSafe AI (Jev). Recibe un state + preguntas tipadas (choice, noul, score) y devuelve decisiones con value + confidence. Cero generación de texto libre.",
  keywords: [
    "System One",
    "Jev",
    "TypeSafe AI",
    "typed decisions",
    "confidence score",
    "parallel sampler",
    "Next.js",
  ],
  authors: [{ name: "System One Local" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "System One Local",
    description: "Typed decisions, not prose — Jev-compatible local engine.",
    url: "https://chat.z.ai",
    siteName: "System One Local",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "System One Local",
    description: "Typed decisions, not prose — Jev-compatible local engine.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
