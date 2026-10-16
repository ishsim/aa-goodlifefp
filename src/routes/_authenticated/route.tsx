import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

function AuthLoading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{
        background: "linear-gradient(120deg, #3a1955 0%, #51037c 55%, #66229d 100%)",
        fontFamily: "'Source Sans 3', system-ui, sans-serif",
      }}
    >
      <div
        className="h-10 w-10 rounded-full border-2 border-white/30 border-t-white animate-spin"
        aria-hidden="true"
      />
      <p className="text-purple-100 text-sm tracking-wide">Loading your workspace…</p>
    </div>
  );
}

function AuthError({ error, reset }: { error: unknown; reset?: () => void }) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{
        background: "linear-gradient(120deg, #3a1955 0%, #51037c 55%, #66229d 100%)",
        fontFamily: "'Source Sans 3', system-ui, sans-serif",
      }}
    >
      <p className="text-white text-lg font-semibold">Something went wrong loading your workspace</p>
      <p className="text-purple-100 text-sm max-w-xl" style={{ wordBreak: "break-word" }}>{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
        <button
          onClick={() => { if (reset) reset(); else window.location.reload(); }}
          className="text-sm px-4 py-2 rounded-lg bg-white text-purple-900 font-semibold"
        >
          Try again
        </button>
        <button
          onClick={() => { window.location.href = "/"; }}
          className="text-sm px-4 py-2 rounded-lg border border-white/40 text-white"
        >
          Back to clients
        </button>
        <button
          onClick={async () => { try { await supabase.auth.signOut(); } finally { window.location.href = "/auth"; } }}
          className="text-sm px-4 py-2 rounded-lg border border-white/40 text-white"
        >
          Sign out
        </button>
      </div>
      <p className="text-purple-200/70 text-xs mt-2">If this keeps happening, send me this message — it names the cause.</p>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingMs: 0,
  pendingComponent: AuthLoading,
  beforeLoad: async () => {
    let result: Awaited<ReturnType<typeof supabase.auth.getUser>> | null = null;
    try {
      result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
    } catch {
      result = null;
    }
    if (result && !result.error && result.data.user) return { user: result.data.user };
    // getUser() asks the server, so it fails with no connection. The session already on
    // this device is enough to open the app offline — the server checks the token again on
    // every request anyway, so nothing is trusted that was not already trusted.
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) return { user: data.session.user };
    } catch { /* no stored session either */ }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
  // Showing the loading screen for an error meant every crash looked like a slow network
  // and spun forever, with the actual message only visible in a console nobody had open.
  errorComponent: ({ error, reset }) => <AuthError error={error} reset={reset} />,
});
