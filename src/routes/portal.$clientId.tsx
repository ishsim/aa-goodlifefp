import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { supabase } from '@/integrations/supabase/client'
import { checkPortalEmail, getPortalClient, savePortalClient } from '@/lib/portal.functions'
import { toast, Toaster } from 'sonner'

export const Route = createFileRoute('/portal/$clientId')({
  ssr: false,
  head: () => ({ meta: [
    { title: 'Client Portal — GoodLife' },
    { name: 'description', content: 'Update your details before your financial planning meeting.' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: PortalPage,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-[#3a1955]">Something went wrong</h1>
        <p className="text-sm text-slate-600 mt-2">{error.message}</p>
      </div>
    </div>
  ),
})

type ClientData = {
  name?: string; dob?: string; occupation?: string; occDetails?: string; email?: string;
  priorities?: string[];
  dependents?: Array<{ id?: string; name?: string; relationship?: string; dob?: string }>;
  income?: Record<string, unknown>;
  expenses?: Record<string, Array<{ id?: string; label?: string; amount?: string; note?: string }>>;
  assets?: {
    liquid?: Array<{ id?: string; name?: string; amount?: string }>;
    invested?: Array<{ id?: string; name?: string; current?: string; future?: string }>;
    personal?: Array<{ id?: string; name?: string; amount?: string }>;
  };
  liabilities?: Array<{ id?: string; name?: string; amount?: string }>;
  existingPlans?: Array<Record<string, unknown>>;
  existingInvestments?: Array<Record<string, unknown>>;
}

const uid = () => Math.random().toString(36).slice(2, 10)
const brand = '#3a1955'
const INACTIVITY_MS = 60 * 60 * 1000

function PortalPage() {
  const { clientId } = Route.useParams()
  const check = useServerFn(checkPortalEmail)
  const load = useServerFn(getPortalClient)
  const save = useServerFn(savePortalClient)

  const [stage, setStage] = useState<'email' | 'otp' | 'form' | 'expired'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [data, setData] = useState<ClientData | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // On mount, check for an existing session and try to auto-load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      if (cancelled) return
      if (s.session?.user?.email) {
        setEmail(s.session.user.email)
        try {
          const res = await load({ data: { clientId } })
          if (!cancelled) { setData(res.data as ClientData); setStage('form') }
        } catch {
          await supabase.auth.signOut()
        }
      }
    })()
    return () => { cancelled = true }
  }, [clientId, load])

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // inactivity timer
  const lastActive = useRef(Date.now())
  useEffect(() => {
    if (stage !== 'form') return
    const bump = () => { lastActive.current = Date.now() }
    const evts: (keyof WindowEventMap)[] = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart']
    evts.forEach(e => window.addEventListener(e, bump))
    const iv = setInterval(async () => {
      if (Date.now() - lastActive.current > INACTIVITY_MS) {
        await supabase.auth.signOut()
        setStage('expired'); setData(null)
      }
    }, 30000)
    return () => { evts.forEach(e => window.removeEventListener(e, bump)); clearInterval(iv) }
  }, [stage])

  const sendOtp = useCallback(async (targetEmail: string) => {
    setBusy(true)
    try {
      const { ok } = await check({ data: { clientId, email: targetEmail } })
      if (!ok) {
        toast.error('We could not find a record with that email. Please check with your advisor.')
        return
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: { shouldCreateUser: true },
      })
      if (error) { toast.error(error.message); return }
      setStage('otp'); setResendIn(60)
      toast.success('We sent you a 6-digit code. Please check your email.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setBusy(false) }
  }, [check, clientId])

  const verifyOtp = useCallback(async () => {
    setBusy(true)
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
      if (error) { toast.error(error.message); return }
      const res = await load({ data: { clientId } })
      setData(res.data as ClientData); setStage('form')
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setBusy(false) }
  }, [code, email, clientId, load])

  const submitSave = useCallback(async () => {
    if (!data) return
    setSaving(true)
    try {
      await save({ data: { clientId, patch: data as unknown as Record<string, unknown> } })
      setSavedAt(Date.now())
      toast.success('Your details have been saved.')
    } catch (e) {
      toast.error('Save failed: ' + (e as Error).message)
    } finally { setSaving(false) }
  }, [data, clientId, save])

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap'); .font-serif{font-family:'Cormorant Garamond',Georgia,serif} body{font-family:'Source Sans 3',system-ui,sans-serif}`}</style>
      <Toaster position="top-center" richColors />
      <header className="text-white px-6 py-4" style={{ background: `linear-gradient(120deg, ${brand} 0%, #51037c 100%)` }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="font-serif text-xl">GoodLife</span>
          <span className="text-xs text-purple-200">Client portal</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 pb-40">
        {stage === 'email' && <EmailStep email={email} setEmail={setEmail} onSubmit={sendOtp} busy={busy} />}
        {stage === 'otp' && (
          <OtpStep
            email={email} code={code} setCode={setCode} onVerify={verifyOtp} busy={busy}
            resendIn={resendIn} onResend={() => sendOtp(email)}
            onEditEmail={() => { setStage('email'); setCode('') }}
          />
        )}
        {stage === 'expired' && (
          <Card>
            <h2 className="font-serif text-2xl text-[#3a1955]">Your session has expired</h2>
            <p className="text-sm text-slate-600 mt-2">Your session has expired for security. Please open your link again to continue.</p>
            <button onClick={() => { setStage('email'); setCode('') }} className="mt-4 px-4 py-2 rounded-lg bg-[#3a1955] text-white text-sm">Start again</button>
          </Card>
        )}
        {stage === 'form' && data && (
          <PortalForm data={data} setData={setData} saving={saving} savedAt={savedAt} onSave={submitSave} email={email} />
        )}
      </main>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mt-6">{children}</div>
}

function EmailStep({ email, setEmail, onSubmit, busy }: { email: string; setEmail: (v: string) => void; onSubmit: (v: string) => void; busy: boolean }) {
  return (
    <Card>
      <h1 className="font-serif text-2xl text-[#3a1955]">Welcome</h1>
      <p className="text-sm text-slate-600 mt-2">Your advisor has shared this form so you can fill in your details before your meeting. Please enter your email to receive a 6-digit login code.</p>
      <form onSubmit={e => { e.preventDefault(); if (email.trim()) onSubmit(email.trim()) }} className="mt-4 space-y-3">
        <label className="block text-sm text-slate-700">Email address
          <input type="email" autoFocus required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" disabled={busy || !email.trim()} className="w-full py-2.5 rounded-lg bg-[#3a1955] hover:bg-[#51037c] disabled:opacity-50 text-white text-sm font-semibold">
          {busy ? 'Sending…' : 'Send me a code'}
        </button>
      </form>
    </Card>
  )
}

function OtpStep({ email, code, setCode, onVerify, busy, resendIn, onResend, onEditEmail }: {
  email: string; code: string; setCode: (v: string) => void; onVerify: () => void; busy: boolean;
  resendIn: number; onResend: () => void; onEditEmail: () => void;
}) {
  return (
    <Card>
      <h1 className="font-serif text-2xl text-[#3a1955]">Enter your code</h1>
      <p className="text-sm text-slate-600 mt-2">We sent a 6-digit code to <b>{email}</b>. It expires in 10 minutes.</p>
      <form onSubmit={e => { e.preventDefault(); onVerify() }} className="mt-4 space-y-3">
        <input inputMode="numeric" autoFocus maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456"
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em]" />
        <button type="submit" disabled={busy || code.length < 6} className="w-full py-2.5 rounded-lg bg-[#3a1955] hover:bg-[#51037c] disabled:opacity-50 text-white text-sm font-semibold">
          {busy ? 'Verifying…' : 'Verify code'}
        </button>
      </form>
      <div className="flex justify-between items-center mt-3 text-xs text-slate-500">
        <button onClick={onEditEmail} className="hover:underline">Use a different email</button>
        {resendIn > 0
          ? <span>Resend code in {resendIn}s</span>
          : <button onClick={onResend} className="text-[#3a1955] hover:underline">Resend code</button>}
      </div>
    </Card>
  )
}

/* ---------- Portal form ---------- */

function firstName(name?: string) {
  return (name || '').trim().split(/\s+/)[0] || 'there'
}

function sectionHasData(kind: 'about' | 'income' | 'assets' | 'existing', d: ClientData) {
  if (kind === 'about') return Boolean(d.name || d.dob || d.occupation || (d.priorities || []).some(Boolean) || (d.dependents || []).length)
  if (kind === 'income') {
    const inc = (d.income || {}) as Record<string, unknown>
    if (inc.basic || inc.bonuses) return true
    const exps = d.expenses || {}
    return Object.values(exps).some(g => (g || []).some(r => r.amount))
  }
  if (kind === 'assets') {
    const a = d.assets || {}
    return (a.liquid || []).some(x => x.amount) || (a.invested || []).some(x => x.current || x.future) || (a.personal || []).some(x => x.amount) || (d.liabilities || []).some(x => x.amount)
  }
  if (kind === 'existing') return (d.existingPlans || []).length > 0 || (d.existingInvestments || []).length > 0
  return false
}

const EXPENSE_GROUPS = [
  { id: 'loans', label: 'Loans / Big expenses' },
  { id: 'expenditures', label: 'Everyday expenditures' },
  { id: 'savings', label: 'Savings / Investments' },
  { id: 'protection', label: 'Protection / Insurance' },
] as const

function PortalForm({ data, setData, saving, savedAt, onSave, email }: {
  data: ClientData; setData: (d: ClientData) => void; saving: boolean; savedAt: number | null; onSave: () => void; email: string;
}) {
  const patch = (p: Partial<ClientData>) => setData({ ...data, ...p })
  const done = useMemo(() => ({
    about: sectionHasData('about', data),
    income: sectionHasData('income', data),
    assets: sectionHasData('assets', data),
    existing: sectionHasData('existing', data),
  }), [data])

  return (
    <div className="space-y-6 mt-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <p className="text-sm text-slate-700">
          Welcome, <b>{firstName(data.name)}</b>. Your advisor has shared this form to help us prepare for your meeting.
          Everything you share here is kept confidential and used only to build your personal financial plan.
        </p>
        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          <ProgressPill label="About you" done={done.about} />
          <ProgressPill label="Income & expenses" done={done.income} />
          <ProgressPill label="Assets & liabilities" done={done.assets} />
          <ProgressPill label="Existing plans" done={done.existing} />
        </div>
      </div>

      <AboutSection data={data} patch={patch} email={email} />
      <IncomeSection data={data} patch={patch} />
      <AssetsSection data={data} patch={patch} />
      <ExistingSection data={data} patch={patch} />

      <div className="text-center text-xs text-slate-500 pt-2">Have questions? Contact your advisor directly.</div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600 flex-1 min-w-0 truncate">
            {savedAt
              ? 'Saved. Your advisor will review these before your meeting. You can return anytime to make changes.'
              : 'Your changes are only stored when you save.'}
          </div>
          <button onClick={onSave} disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#3a1955] hover:bg-[#51037c] disabled:opacity-50 text-white text-sm font-semibold shrink-0">
            {saving ? 'Saving…' : 'Save my details'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProgressPill({ label, done }: { label: string; done: boolean }) {
  return (
    <span className={`px-2.5 py-1 rounded-full border ${done ? 'bg-green-50 border-green-300 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
      {done ? '✓ ' : ''}{label}
    </span>
  )
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <h2 className="font-serif text-xl text-[#3a1955]">{title}</h2>
      {hint && <p className="text-sm text-slate-600 mt-1">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">{children}</label>
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${props.className || ''}`} />
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white ${props.className || ''}`}>{children}</select>
}

function AboutSection({ data, patch, email }: { data: ClientData; patch: (p: Partial<ClientData>) => void; email: string }) {
  const dependents = data.dependents || []
  const priorities = data.priorities && data.priorities.length >= 5 ? data.priorities : ['', '', '', '', '']
  return (
    <SectionCard title="About you">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Full name</Label><TextInput value={data.name || ''} onChange={e => patch({ name: e.target.value })} /></div>
        <div><Label>Date of birth</Label><TextInput type="date" value={data.dob || ''} onChange={e => patch({ dob: e.target.value })} /></div>
        <div><Label>Occupation</Label><TextInput value={data.occupation || ''} onChange={e => patch({ occupation: e.target.value })} /></div>
        <div><Label>Occupation details</Label><TextInput value={data.occDetails || ''} onChange={e => patch({ occDetails: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Your login email</Label><TextInput value={email} readOnly className="bg-slate-50" /></div>
      </div>

      <div>
        <Label>Your priorities (1 = highest)</Label>
        <p className="text-xs text-slate-500 mb-2">Tell us what matters most to you financially — for example: children's education, retirement, paying off your home, Hajj savings, protecting your income, growing wealth, diversifying investments.</p>
        <div className="space-y-2">
          {priorities.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#3a1955] text-white text-xs flex items-center justify-center shrink-0">{i + 1}</span>
              <TextInput value={p} onChange={e => { const arr = [...priorities]; arr[i] = e.target.value; patch({ priorities: arr }) }} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>People under your care</Label>
          <button onClick={() => patch({ dependents: [...dependents, { id: uid(), name: '', relationship: '', dob: '' }] })} className="text-xs text-[#3a1955] hover:underline">+ Add dependent</button>
        </div>
        <p className="text-xs text-slate-500 mb-2">Include your spouse, children, parents, or anyone whose financial wellbeing depends on you.</p>
        {dependents.length === 0 && <div className="text-xs text-slate-400">None added yet.</div>}
        <div className="space-y-2">
          {dependents.map((dep, i) => (
            <div key={dep.id || i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5"><TextInput placeholder="Name" value={dep.name || ''} onChange={e => { const l = [...dependents]; l[i] = { ...dep, name: e.target.value }; patch({ dependents: l }) }} /></div>
              <div className="col-span-3"><TextInput placeholder="Relationship" value={dep.relationship || ''} onChange={e => { const l = [...dependents]; l[i] = { ...dep, relationship: e.target.value }; patch({ dependents: l }) }} /></div>
              <div className="col-span-3"><TextInput type="date" value={dep.dob || ''} onChange={e => { const l = [...dependents]; l[i] = { ...dep, dob: e.target.value }; patch({ dependents: l }) }} /></div>
              <button onClick={() => patch({ dependents: dependents.filter((_, j) => j !== i) })} className="col-span-1 text-red-500 text-lg">✕</button>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

function IncomeSection({ data, patch }: { data: ClientData; patch: (p: Partial<ClientData>) => void }) {
  const income = (data.income || {}) as { basic?: string; bonuses?: string; allowances?: Array<{ id?: string; note?: string; amount?: string }>; others?: Array<{ id?: string; note?: string; amount?: string }> }
  const setIncome = (p: Partial<typeof income>) => patch({ income: { ...income, ...p } as ClientData['income'] })
  const expenses = data.expenses || {}
  const setExpenses = (id: string, rows: Array<{ id?: string; label?: string; amount?: string; note?: string }>) => patch({ expenses: { ...expenses, [id]: rows } })
  return (
    <SectionCard title="Your monthly income & expenses" hint="Please fill in your income including allowances & other sources and your regular monthly expenses as accurately as you can. These figures help us build a picture that actually reflects your life.">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Basic monthly income ($)</Label><TextInput inputMode="decimal" value={income.basic || ''} onChange={e => setIncome({ basic: e.target.value })} /></div>
        <div><Label>Bonuses / commissions per month ($)</Label><TextInput inputMode="decimal" value={income.bonuses || ''} onChange={e => setIncome({ bonuses: e.target.value })} /></div>
      </div>

      <ListEditor
        label="Allowances (per month)"
        rows={income.allowances || []}
        onChange={rows => setIncome({ allowances: rows })}
        placeholderNote="e.g. Housing allowance"
      />
      <ListEditor
        label="Other income sources (per month)"
        rows={income.others || []}
        onChange={rows => setIncome({ others: rows })}
        placeholderNote="e.g. Rental income"
      />

      {EXPENSE_GROUPS.map(g => (
        <div key={g.id}>
          <div className="flex items-center justify-between">
            <Label>{g.label}</Label>
            <button onClick={() => setExpenses(g.id, [ ...(expenses[g.id] || []), { id: uid(), label: '', amount: '' } ])} className="text-xs text-[#3a1955] hover:underline">+ Add line</button>
          </div>
          {(expenses[g.id] || []).length === 0 && <div className="text-xs text-slate-400">None added.</div>}
          <div className="space-y-2">
            {(expenses[g.id] || []).map((r, i) => (
              <div key={r.id || i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6"><TextInput placeholder="Description" value={r.label || ''} onChange={e => { const l = [...(expenses[g.id] || [])]; l[i] = { ...r, label: e.target.value }; setExpenses(g.id, l) }} /></div>
                <div className="col-span-5"><TextInput inputMode="decimal" placeholder="Amount ($)" value={r.amount || ''} onChange={e => { const l = [...(expenses[g.id] || [])]; l[i] = { ...r, amount: e.target.value }; setExpenses(g.id, l) }} /></div>
                <button onClick={() => setExpenses(g.id, (expenses[g.id] || []).filter((_, j) => j !== i))} className="col-span-1 text-red-500 text-lg">✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SectionCard>
  )
}

function ListEditor({ label, rows, onChange, placeholderNote }: {
  label: string; rows: Array<{ id?: string; note?: string; amount?: string }>; onChange: (rows: Array<{ id?: string; note?: string; amount?: string }>) => void; placeholderNote: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button onClick={() => onChange([...rows, { id: uid(), note: '', amount: '' }])} className="text-xs text-[#3a1955] hover:underline">+ Add</button>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id || i} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-7"><TextInput placeholder={placeholderNote} value={r.note || ''} onChange={e => { const l = [...rows]; l[i] = { ...r, note: e.target.value }; onChange(l) }} /></div>
            <div className="col-span-4"><TextInput inputMode="decimal" placeholder="$" value={r.amount || ''} onChange={e => { const l = [...rows]; l[i] = { ...r, amount: e.target.value }; onChange(l) }} /></div>
            <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="col-span-1 text-red-500 text-lg">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AssetsSection({ data, patch }: { data: ClientData; patch: (p: Partial<ClientData>) => void }) {
  const assets = data.assets || {}
  const setAssets = (p: Partial<NonNullable<ClientData['assets']>>) => patch({ assets: { ...assets, ...p } })
  const liabilities = data.liabilities || []

  return (
    <SectionCard title="Your assets & liabilities" hint="Include savings accounts, unit trusts, property, vehicles, and any loans or credit card balances. Approximate figures are fine — the goal is a realistic picture, not a perfect one.">
      <AmountList
        label="Cash & equivalents (savings, fixed deposits, emergency fund)"
        rows={assets.liquid || []}
        onChange={rows => setAssets({ liquid: rows })}
        placeholderName="e.g. BIBD savings"
      />

      <div>
        <div className="flex items-center justify-between">
          <Label>Invested assets (unit trusts, SPK, stocks)</Label>
          <button onClick={() => setAssets({ invested: [...(assets.invested || []), { id: uid(), name: '', current: '', future: '' }] })} className="text-xs text-[#3a1955] hover:underline">+ Add</button>
        </div>
        <div className="space-y-2">
          {(assets.invested || []).map((r, i) => (
            <div key={r.id || i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5"><TextInput placeholder="Name" value={r.name || ''} onChange={e => { const l = [...(assets.invested || [])]; l[i] = { ...r, name: e.target.value }; setAssets({ invested: l }) }} /></div>
              <div className="col-span-3"><TextInput inputMode="decimal" placeholder="Current $" value={r.current || ''} onChange={e => { const l = [...(assets.invested || [])]; l[i] = { ...r, current: e.target.value }; setAssets({ invested: l }) }} /></div>
              <div className="col-span-3"><TextInput inputMode="decimal" placeholder="Monthly $" value={r.future || ''} onChange={e => { const l = [...(assets.invested || [])]; l[i] = { ...r, future: e.target.value }; setAssets({ invested: l }) }} /></div>
              <button onClick={() => setAssets({ invested: (assets.invested || []).filter((_, j) => j !== i) })} className="col-span-1 text-red-500 text-lg">✕</button>
            </div>
          ))}
        </div>
      </div>

      <AmountList
        label="Personal items (property, vehicles, valuables)"
        rows={assets.personal || []}
        onChange={rows => setAssets({ personal: rows })}
        placeholderName="e.g. House"
      />

      <AmountList
        label="Liabilities (loans, credit cards)"
        rows={liabilities}
        onChange={rows => patch({ liabilities: rows })}
        placeholderName="e.g. Car loan"
      />
    </SectionCard>
  )
}

function AmountList({ label, rows, onChange, placeholderName }: {
  label: string; rows: Array<{ id?: string; name?: string; amount?: string }>; onChange: (rows: Array<{ id?: string; name?: string; amount?: string }>) => void; placeholderName: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button onClick={() => onChange([...rows, { id: uid(), name: '', amount: '' }])} className="text-xs text-[#3a1955] hover:underline">+ Add</button>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id || i} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-7"><TextInput placeholder={placeholderName} value={r.name || ''} onChange={e => { const l = [...rows]; l[i] = { ...r, name: e.target.value }; onChange(l) }} /></div>
            <div className="col-span-4"><TextInput inputMode="decimal" placeholder="$" value={r.amount || ''} onChange={e => { const l = [...rows]; l[i] = { ...r, amount: e.target.value }; onChange(l) }} /></div>
            <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="col-span-1 text-red-500 text-lg">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExistingSection({ data, patch }: { data: ClientData; patch: (p: Partial<ClientData>) => void }) {
  const plans = (data.existingPlans || []) as Array<Record<string, string>>
  const invs = (data.existingInvestments || []) as Array<Record<string, string>>
  const setPlans = (rows: typeof plans) => patch({ existingPlans: rows })
  const setInvs = (rows: typeof invs) => patch({ existingInvestments: rows })

  return (
    <SectionCard title="Your existing plans & policies" hint="If you already have insurance policies or savings plans in place, please list them here as best you can. Check your policy documents or your insurer's app if you need the details. It is okay if you do not have all the information — fill in what you know.">
      <div>
        <div className="flex items-center justify-between">
          <Label>Existing insurance plans</Label>
          <button onClick={() => setPlans([...plans, { id: uid() }])} className="text-xs text-[#3a1955] hover:underline">+ Add policy</button>
        </div>
        {plans.length === 0 && <div className="text-xs text-slate-400">None added.</div>}
        <div className="space-y-3">
          {plans.map((p, i) => (
            <div key={p.id || i} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <TextInput placeholder="Policy / plan name (e.g. AIA Life Plan)" value={p.planName || ''} onChange={e => { const l = [...plans]; l[i] = { ...p, planName: e.target.value }; setPlans(l) }} />
                <TextInput placeholder="Insurance company (e.g. AIA, Takaful Brunei)" value={p.company || ''} onChange={e => { const l = [...plans]; l[i] = { ...p, company: e.target.value }; setPlans(l) }} />
              </div>
              <Select value={p.coverType || ''} onChange={e => { const l = [...plans]; l[i] = { ...p, coverType: e.target.value }; setPlans(l) }}>
                <option value="">Type of cover</option>
                <option>Life / Death</option>
                <option>Critical Illness</option>
                <option>Personal Accident</option>
                <option>Medical / Hospitalisation</option>
                <option>Savings</option>
                <option>Investment-linked</option>
                <option>Other</option>
              </Select>
              <div className="grid sm:grid-cols-3 gap-2">
                <TextInput inputMode="decimal" placeholder="Coverage amount $" value={p.coverage || ''} onChange={e => { const l = [...plans]; l[i] = { ...p, coverage: e.target.value }; setPlans(l) }} />
                <TextInput inputMode="decimal" placeholder="Monthly premium $" value={p.premium || ''} onChange={e => { const l = [...plans]; l[i] = { ...p, premium: e.target.value }; setPlans(l) }} />
                <TextInput inputMode="numeric" placeholder="Policy start year" value={p.startYear || ''} onChange={e => { const l = [...plans]; l[i] = { ...p, startYear: e.target.value }; setPlans(l) }} />
              </div>
              <div className="text-right">
                <button onClick={() => setPlans(plans.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Existing savings & investments</Label>
          <button onClick={() => setInvs([...invs, { id: uid() }])} className="text-xs text-[#3a1955] hover:underline">+ Add investment</button>
        </div>
        {invs.length === 0 && <div className="text-xs text-slate-400">None added.</div>}
        <div className="space-y-3">
          {invs.map((v, i) => (
            <div key={v.id || i} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <Select value={v.type || ''} onChange={e => { const l = [...invs]; l[i] = { ...v, type: e.target.value }; setInvs(l) }}>
                <option value="">Type</option>
                <option>Savings Account</option>
                <option>Fixed Deposit</option>
                <option>Unit Trust</option>
                <option>Stocks / Shares</option>
                <option>Property</option>
                <option>Cash</option>
                <option>SPK / Pension</option>
                <option>Other</option>
              </Select>
              <TextInput placeholder="Description (e.g. Bank Islam savings, BIBD fixed deposit)" value={v.description || ''} onChange={e => { const l = [...invs]; l[i] = { ...v, description: e.target.value }; setInvs(l) }} />
              <div className="grid sm:grid-cols-2 gap-2">
                <TextInput inputMode="decimal" placeholder="Current approximate value $" value={v.value || ''} onChange={e => { const l = [...invs]; l[i] = { ...v, value: e.target.value }; setInvs(l) }} />
                <TextInput inputMode="decimal" placeholder="Monthly contribution $" value={v.contrib || ''} onChange={e => { const l = [...invs]; l[i] = { ...v, contrib: e.target.value }; setInvs(l) }} />
              </div>
              <div className="text-right">
                <button onClick={() => setInvs(invs.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}