import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Orb } from "@/components/jarvis/Orb";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orbix — Tu asistente personal con IA" },
      { name: "description", content: "Habla o escribe con Orbix: conversa, organiza tareas, crea documentos e imágenes." },
      { property: "og:title", content: "Orbix — Tu asistente personal con IA" },
      { property: "og:description", content: "Habla o escribe con Orbix: conversa, organiza tareas, crea documentos e imágenes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data } = await supabase.from("threads").select("id").order("updated_at", { ascending: false }).limit(1);
      let id = data?.[0]?.id;
      if (!id) {
        const { data: created } = await supabase.from("threads").insert({ user_id: session.user.id }).select("id").single();
        id = created?.id;
      }
      if (id) navigate({ to: "/chat/$threadId", params: { threadId: id }, replace: true });
    })();
  }, [session, loading, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Orb className="size-20" active />
    </main>
  );
}
