import { createServiceClient } from '@/lib/supabase/service'

/**
 * Live additions to the support assistant's knowledge base, stored in the
 * `support_kb_articles` table so they can be edited without a code deploy.
 *
 * Returns the active articles concatenated, or '' when there are none / the
 * table doesn't exist yet. The built-in SUPPORT_KB is always the base; this is
 * appended on top of it. Never throws — the assistant must keep working even if
 * this lookup fails.
 */
export async function getExtraSupportKB(): Promise<string> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('support_kb_articles')
      .select('title, content')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error || !data || data.length === 0) return ''

    return data
      .map(a => `## ${a.title}\n${a.content}`.trim())
      .join('\n\n')
  } catch {
    return ''
  }
}
