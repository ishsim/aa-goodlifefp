import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — GoodLife FHR" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getUser();
      if (data.user) navigate({ to: "/" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : String(result.error));
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6" style={{ fontFamily: "'Source Sans 3', system-ui, sans-serif" }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="text-white px-6 py-6" style={{ background: "linear-gradient(120deg, #3a1955 0%, #51037c 55%, #66229d 100%)" }}>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            GoodLife Recommendation Studio
          </h1>
          <p className="text-purple-200 text-sm mt-1">{mode === "signin" ? "Sign in to your advisor workspace." : "Create your advisor workspace."}</p>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <button type="submit" disabled={busy} className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold py-2.5 rounded-lg disabled:opacity-60">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <div className="relative my-2 text-center text-xs text-slate-400">
            <span className="bg-white px-2 relative z-10">or</span>
            <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" />
          </div>
          <button type="button" onClick={onGoogle} disabled={busy} className="w-full border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-lg disabled:opacity-60">
            Continue with Google
          </button>
          <div className="text-center text-sm text-slate-500 pt-2">
            {mode === "signin" ? (
              <>No account? <button type="button" onClick={() => setMode("signup")} className="text-purple-700 font-semibold hover:underline">Create one</button></>
            ) : (
              <>Already have one? <button type="button" onClick={() => setMode("signin")} className="text-purple-700 font-semibold hover:underline">Sign in</button></>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}