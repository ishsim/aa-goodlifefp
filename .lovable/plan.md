# Plan: Persist clients in Supabase

## 1. Enable Lovable Cloud
Activate Lovable Cloud (Supabase) on the project. No auth required — single shared tool, all clients visible to whoever has the link.

## 2. Database
Create one migration with a `clients` table:

- `id text primary key`
- `data jsonb not null`
- `updated_at timestamptz not null default now()`

Grants + RLS (single-user public tool, no login):
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO anon, authenticated;`
- `GRANT ALL ON public.clients TO service_role;`
- Enable RLS, add a permissive policy `USING (true) WITH CHECK (true)` for `anon, authenticated` (mirrors the existing localStorage behavior — anyone with the link reads/writes).

## 3. Storage layer in `src/App.jsx`
Replace the three localStorage helpers with async Supabase calls using the browser client (`@/integrations/supabase/client`):

- `loadClients()` → `select('*').order('updated_at', { ascending: false })`, return `rows.map(r => migrate(r.data))`.
- `saveClient(c)` → `upsert({ id: c.id, data: c, updated_at: new Date().toISOString() })` (one row at a time — simpler and avoids rewriting unrelated rows).
- `removeClient(id)` → `delete().eq('id', id)`.

Refactor callers:
- Initial `useEffect` becomes `await loadClients()` then `setClients(...)`; `setLoaded(true)` runs in `finally`.
- `update(patch)` computes `next` synchronously, calls `setClients`, and fires `saveClient(updated)` for the single touched client.
- `newClient()` inserts via `saveClient(c)` then prepends locally.
- `removeClient(id)` awaits delete, then updates local state.
- The "Save" button (`persist`) re-upserts the active client only and toggles `saveState`.

The `PRIV_KEY` privacy toggle stays in localStorage (UI preference, not data).

## 4. Loading UI
While `loaded === false`, render a centered spinner (`Loader2` from `lucide-react`, already available) instead of the client list / editor. Surface Supabase errors via the existing `sonner` toast.

## 5. Out of scope
- No auth, no per-user filtering.
- No realtime sync between tabs (can be added later if needed).
- Report generation, narrative, docx export are untouched.

## Technical notes
- Use `import { supabase } from "@/integrations/supabase/client"` directly from the React component — fine for this no-auth public tool; avoids server-fn boilerplate.
- Run the existing `migrate()` transform on each loaded row so older shapes still upgrade.
- Use `c.updated` (ms epoch already on the client object) to also set `updated_at` for accurate ordering.
