export default function manifest() {
  const isNonProd = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
  const logo = isNonProd ? '/logo4.png' : '/logo3.png'

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
      { src: logo, sizes: '192x192', type: 'image/png' },
      { src: logo, sizes: '512x512', type: 'image/png' },
    ],
  }
}