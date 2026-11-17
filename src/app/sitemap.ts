import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

/** /sitemap.xml — the public pages only. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const page = (path: string, priority: number, changeFrequency: 'weekly' | 'monthly' | 'yearly') =>
    ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency, priority })
  return [
    page('',                 1.0, 'weekly'),
    page('/tools',           0.9, 'weekly'),
    page('/getting-started', 0.6, 'monthly'),
    page('/register',        0.6, 'monthly'),
    page('/login',           0.3, 'yearly'),
    page('/privacy',         0.2, 'yearly'),
    page('/terms',           0.2, 'yearly'),
  ]
}
