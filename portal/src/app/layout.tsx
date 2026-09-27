import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { ToastProvider } from "@/providers/toast-provider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: "HawkNexa",
    template: "%s · HawkNexa",
  },
  description: "AI-powered school management, lesson capture, and learning insights.",
  applicationName: "HawkNexa",
  icons: {
    icon: [{ url: "/brand/favicon.png", type: "image/png", sizes: "64x64" }],
    apple: "/brand/icon.png",
  },
};

const API_PRECONNECT_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ||
  "https://hawknexabackend.fynals.com";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href={API_PRECONNECT_ORIGIN} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={API_PRECONNECT_ORIGIN} />
      </head>
      <body className="font-sans">
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
