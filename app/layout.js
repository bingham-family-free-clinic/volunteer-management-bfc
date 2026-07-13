import './globals.css'

const isNonProd = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
const logo = isNonProd ? '/logo4.png' : '/logo3.png'

export const metadata = {
  title: 'BFC Volunteer Portal',
  description: 'Volunteer Portal for Bingham Family Clinic',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Portal',
  },
  icons: {
    icon: logo,
    apple: logo,
  },
}

export const viewport = {
  themeColor: '#02416b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BFC" />
        <link rel="apple-touch-icon" href={logo} />
      </head>
      <body>
        {children}
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