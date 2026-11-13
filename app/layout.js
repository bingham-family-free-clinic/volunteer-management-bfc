import './globals.css'
import Script from 'next/script'
import { ConfirmDialogProvider } from '../lib/ConfirmDialog'

const isNonProd = process.env.NODE_ENV !== 'production' || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')
const icon192 = isNonProd ? '/logos/logo4-192.webp' : '/logos/logo3-192.webp'
const icon512 = isNonProd ? '/logos/logo4-512.webp' : '/logos/logo3-512.webp'
const appleIcon = isNonProd ? '/logos/logo4-180.png' : '/logos/logo3-180.png'

export const metadata = {
  title: 'BFC Volunteer Portal',
  description: 'Volunteer Portal for Bingham Family Clinic',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Portal',
  },
  icons: {
    icon: [
      { url: icon192, sizes: '192x192', type: 'image/webp' },
      { url: icon512, sizes: '512x512', type: 'image/webp' },
    ],
    apple: [{ url: appleIcon, sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport = {
  themeColor: '#02416b',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script src={isNonProd ? '/newrelic-staging.js' : '/newrelic-production.js'} strategy="beforeInteractive"/>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BFC" />
      </head>
      <body>
        <ConfirmDialogProvider>
          {children}
        </ConfirmDialogProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function() { console.log('SW registered'); })
                    .catch(function(err) { console.log('SW failed: ', err); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}