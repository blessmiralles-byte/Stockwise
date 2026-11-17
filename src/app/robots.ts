import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'
import { PROTECTED_PREFIXES } from '@/lib/route-access'

/** /robots.txt — let search engines index the public pages, not the app or the API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/onboarding', '/reset-password', ...PROTECTED_PREFIXES.map(p => p + '/'), ...PROTECTED_PREFIXES],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
