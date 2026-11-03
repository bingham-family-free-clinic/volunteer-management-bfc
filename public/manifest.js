export default function manifest() {
  const isNonProd = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
  const icon192 = isNonProd ? '/logos/logo4-192.webp' : '/logos/logo3-192.webp'
  const icon512 = isNonProd ? '/logos/logo4-512.webp' : '/logos/logo3-512.webp'

  return {
    name: 'BFC Volunteer Portal',
    short_name: 'BFC Portal',
    description: 'Volunteer Portal for Bingham Family Clinic',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f0a',
    theme_color: '#02416b',
    orientation: 'portrait',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/webp' },
      { src: icon512, sizes: '512x512', type: 'image/webp' },
    ],
  }
}