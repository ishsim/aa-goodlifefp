import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import type { Database } from '@/integrations/supabase/types'

// Editable subset of client fields the portal is allowed to write.
const ALLOWED_FIELDS = new Set([
  'name', 'dob', 'occupation', 'occDetails',
  'priorities', 'dependents',
  'income', 'expenses',
  'assets', 'liabilities',
  'existingPlans', 'existingInvestments',
])

function admin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server not configured')
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  })
}

function norm(email: unknown): string {
  return String(email || '').trim().toLowerCase()
}

// Public: check if a given email matches the client record. No auth required.
export const checkPortalEmail = createServerFn({ method: 'POST' })
  .inputValidator((d: { clientId: string; email: string }) => d)
  .handler(async ({ data }) => {
    const email = norm(data.email)
    if (!email || !data.clientId) return { ok: false }
    const sb = admin()
    const { data: row, error } = await sb
      .from('clients')
      .select('client_email')
      .eq('id', data.clientId)
      .maybeSingle()
    if (error || !row) return { ok: false }
    return { ok: norm(row.client_email) === email }
  })

// Authenticated: fetch client data for portal. Verifies the OTP user's email matches the client.
export const getPortalClient = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => d)
  .handler(async ({ data, context }) => {
    const email = norm((context.claims as { email?: string }).email)
    if (!email) throw new Error('No email on session')
    const sb = admin()
    const { data: row, error } = await sb
      .from('clients')
      .select('id, data, client_email')
      .eq('id', data.clientId)
      .maybeSingle()
    if (error || !row) throw new Error('Client not found')
    if (norm(row.client_email) !== email) throw new Error('Forbidden')
    return { id: row.id, data: row.data }
  })

// Authenticated: save client patch from portal.
export const savePortalClient = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    const email = norm((context.claims as { email?: string }).email)
    if (!email) throw new Error('No email on session')
    const sb = admin()
    const { data: row, error } = await sb
      .from('clients')
      .select('id, data, user_id, client_email')
      .eq('id', data.clientId)
      .maybeSingle()
    if (error || !row) throw new Error('Client not found')
    if (norm(row.client_email) !== email) throw new Error('Forbidden')

    const current = (row.data as Record<string, unknown>) || {}
    const filtered: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data.patch || {})) {
      if (ALLOWED_FIELDS.has(k)) filtered[k] = v
    }
    const merged = { ...current, ...filtered, updated: Date.now() }
    const updatedAt = new Date().toISOString()

    const { error: upErr } = await sb
      .from('clients')
      .update({ data: merged, updated_at: updatedAt })
      .eq('id', data.clientId)
    if (upErr) throw new Error(upErr.message)

    if (row.user_id) {
      const clientName = String((merged as { name?: string }).name || '').trim() || 'A client'
      await sb.from('client_notifications').insert({
        client_id: data.clientId,
        client_name: clientName,
        advisor_user_id: row.user_id,
        message: `${clientName} has updated their profile via the client portal. Please review their record in the app.`,
      })
    }
    return { ok: true }
  })