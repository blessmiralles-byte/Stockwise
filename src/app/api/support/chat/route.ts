import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/api-auth'
import { SUPPORT_KB } from '@/lib/support-kb'

/**
 * POST /api/support/chat — in-app support assistant.
 *
 * A grounded Claude chat: answers ONLY from the Stocked knowledge base and
 * defers to support@stocked.tech for anything account-specific or unknown.
 * Uses Haiku (fast + cheap) since this is a high-volume, low-complexity helper.
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

// A support widget can produce a lot of small calls; keep responses short.
const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 700
const MAX_TURNS = 12          // cap conversation length sent to the model
const MAX_CHARS = 4000        // per-message guard against oversized payloads

type Turn = { role: 'user' | 'assistant'; content: string }

const SYSTEM = `You are the in-app support assistant for Stocked, an inventory,
materials, and asset-tracking app for contractors.

Answer questions using ONLY the knowledge base below. Be concise, friendly, and
practical — most answers are 1–3 short sentences, and you may point users to the
exact screen (e.g. "Settings → Billing"). Use plain text, no markdown headers.

Rules:
- If the knowledge base does not cover the question, or it is account-specific
  (a billing dispute, a bug, missing data, a refund, deleting a specific
  record), do NOT guess. Say you're not sure and direct them to email
  support@stocked.tech.
- Never invent features, prices, or steps that aren't in the knowledge base.
- Never ask for or accept passwords, card numbers, or other secrets. If a user
  offers one, tell them not to share it and to contact support@stocked.tech.
- You cannot take actions inside the app (you can't change settings, issue
  refunds, or edit their data) — only explain how to do things.

KNOWLEDGE BASE:
${SUPPORT_KB}`

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Support chat is not configured yet. Please email support@stocked.tech.' },
      { status: 503 },
    )
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawTurns: unknown = body?.messages
  if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  // Sanitize + clamp the client-supplied history.
  const turns: Turn[] = []
  for (const t of rawTurns.slice(-MAX_TURNS)) {
    const role = (t as any)?.role
    const content = (t as any)?.content
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      turns.push({ role, content: content.slice(0, MAX_CHARS) })
    }
  }
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'The last message must be from the user' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: turns,
    })

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    return NextResponse.json({
      reply: reply || "I'm not sure about that — please email support@stocked.tech and we'll help you out.",
    })
  } catch (err) {
    console.error('[POST /api/support/chat]', err)
    return NextResponse.json(
      { error: 'Sorry, the assistant is unavailable right now. Please email support@stocked.tech.' },
      { status: 502 },
    )
  }
}
