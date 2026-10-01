import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { QueryProvider } from "@/lib/query/query-provider"
import { DataProvider } from "@/components/data-provider"
import { PWABanner } from "@/components/pwa-banner"
import { Toaster as ToasterOutlet } from "@/components/ui/sonner"
// shadcn Toaster — kept mounted so the many existing `useToast()` callers
// across the app render their notifications too.
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "Pehnawa Boutique Pos",
  description: "Professional Point of Sale System",
  generator: 'v0.dev',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pehnawa Boutique Pos',
  },
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Pehnawa Boutique Pos',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <QueryProvider>
          <DataProvider>
            {children}
            <ToasterOutlet position="bottom-right" richColors />
            <ShadcnToaster />
          </DataProvider>
        </QueryProvider>
        <PWABanner />
        {/* Unregister stale service workers in development to prevent timeout issues */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && location.hostname === 'localhost') {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  registrations.forEach(function(registration) {
                    registration.unregister().then(function() {
                      console.log('[SW] Unregistered stale service worker for development');
                    });
                  });
                });
                // Also clear all caches left by old service workers
                if ('caches' in window) {
                  caches.keys().then(function(names) {
                    names.forEach(function(name) {
                      caches.delete(name);
                      console.log('[SW] Deleted cache:', name);
                    });
                  });
                }
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
