import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/use-session";
import { Orb } from "@/components/jarvis/Orb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Orbix" },
      { name: "description", content: "Inicia sesión en tu asistente personal Orbix." },
      { property: "og:title", content: "Entrar — Orbix" },
      { property: "og:description", content: "Inicia sesión en tu asistente personal Orbix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Revisa tu correo para confirmar tu cuenta.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("No se pudo iniciar sesión con Google");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Orb className="mx-auto mb-4 size-48" />
        <h1 className="font-display text-center text-5xl font-semibold">Orbix</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">Tu compañero estelar, siempre a tu lado.</p>
        <form onSubmit={submit} className="mt-10 space-y-3">
          <Input aria-label="Correo" className="h-12 bg-card/40 focus-visible:shadow-[var(--shadow-glow)]" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input aria-label="Contraseña" className="h-12 bg-card/40 focus-visible:shadow-[var(--shadow-glow)]" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <Button type="submit" className="h-12 w-full" disabled={busy}>
            {busy ? "Conectando…" : mode === "in" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>
        <Button variant="outline" className="mt-3 w-full" onClick={google}>
          Continuar con Google
        </Button>
        <Button variant="link"
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "in" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Entrar"}
        </Button>
      </div>
    </main>
  );
}
