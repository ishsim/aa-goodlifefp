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
    if (!result || result.error || !result.data.user) throw redirect({ to: "/auth" });
    return { user: result.data.user };
  },
  component: () => <Outlet />,
  errorComponent: () => <AuthLoading />,
});
