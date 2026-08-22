'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// The Suppliers page was renamed to Vendors. Keep this path working for old
// bookmarks and links by redirecting to /vendors.
export default function SuppliersRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/vendors') }, [router])
  return null
}
