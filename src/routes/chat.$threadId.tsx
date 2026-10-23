import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { LogOut, Mic, MicOff, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { speak, useVoiceInput } from "@/hooks/use-voice";
import { Orb } from "@/components/jarvis/Orb";
import { TasksPanel, tasksKey } from "@/components/jarvis/TasksPanel";
import { DocumentCard, ImageCard, TaskChip, WebsiteCard } from "@/components/jarvis/ToolCards";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversación — Orbix" },
      { name: "description", content: "Conversa con Orbix por voz o texto." },
      { property: "og:title", content: "Conversación — Orbix" },
      { property: "og:description", content: "Conversa con Orbix por voz o texto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const thread = useQuery({
    queryKey: ["thread", threadId],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("threads").select("id, messages").eq("id", threadId).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
  });

  if (!session || thread.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Orb className="size-20" active />
      </main>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar activeId={threadId} userId={session.user.id} />
      <main className="flex min-w-0 flex-1 flex-col">
        {thread.data ? (
          <ChatWindow key={threadId} threadId={threadId} initial={(thread.data.messages as unknown as UIMessage[]) ?? []} />
        ) : (
          <div className="m-auto text-muted-foreground">
            Conversación no encontrada. <Link to="/" className="text-primary underline">Volver</Link>
          </div>
        )}
      </main>
    </div>
  );
}

function Sidebar({ activeId, userId }: { activeId: string; userId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("threads").select("id, title").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("threads").insert({ user_id: userId }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: id } });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("threads").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (id === activeId) navigate({ to: "/" });
    },
  });

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-3 px-5 py-6">
        <Orb className="size-7" />
        <span className="font-display text-2xl">Orbix</span>
      </div>
      <div className="px-3">
        <Button variant="outline" className="w-full justify-start" onClick={() => create.mutate()}>
          <Plus /> Nueva conversación
        </Button>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
        {threads.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-center rounded-md hover:bg-sidebar-accent",
              t.id === activeId && "bg-sidebar-accent",
            )}
          >
            <Link
              to="/chat/$threadId"
              params={{ threadId: t.id }}
              className="min-w-0 flex-1 truncate px-3 py-2 text-sm"
            >
              {t.title}
            </Link>
            <button
              type="button"
              aria-label="Eliminar conversación"
              onClick={() => remove.mutate(t.id)}
              className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </nav>
      <div className="max-h-[40%] overflow-y-auto border-t px-3 py-4">
        <TasksPanel />
      </div>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="flex items-center gap-2 border-t px-5 py-4 text-sm text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" /> Cerrar sesión
      </button>
    </aside>
  );
}

type ToolOut = { ok?: boolean; error?: string; path?: string; prompt?: string; title?: string; content?: string; name?: string; url?: string; task?: { title?: string } };

const SUGGESTIONS = [
  "Recuérdame llamar al dentista mañana a las 10",
  "Escribe una carta de renuncia formal",
  "Genera una imagen de un faro al atardecer",
  "Abre YouTube",
];

function ChatWindow({ threadId, initial }: { threadId: string; initial: UIMessage[] }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [voiceOut, setVoiceOut] = useState(true);
  const handled = useRef(new Set<string>());
  const seededHandled = useRef(false);
  if (!seededHandled.current) {
    seededHandled.current = true;
    for (const m of initial) for (const p of m.parts) if ("toolCallId" in p) handled.current.add(p.toolCallId as string);
  }

  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initial,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { threadId },
      headers: async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        const t = data.session?.access_token;
        return t ? { Authorization: `Bearer ${t}` } : {};
      },
    }),
    onError: (e) => toast.error(e.message || "Algo salió mal"),
    onFinish: ({ message }) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: tasksKey });
      if (voiceOut) {
        const said = message.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ");
        if (said) speak(said);
      }
    },
  });

  // Open websites when the tool result arrives live
  useEffect(() => {
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === "tool-open_website" && p.state === "output-available" && !handled.current.has(p.toolCallId)) {
          handled.current.add(p.toolCallId);
          const out = p.output as { ok?: boolean; url?: string };
          if (out?.ok && out.url) window.open(out.url, "_blank", "noopener");
        }
      }
    }
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";
  const send = (value: string) => {
    if (!value.trim() || busy) return;
    sendMessage({ text: value.trim() });
    setText("");
  };
  const voice = useVoiceInput(send);

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-10">
          {messages.length === 0 && (
            <div className="flex flex-col items-center pt-[12vh] text-center">
              <Orb className="size-28" active={voice.listening} />
              <h1 className="font-display mt-10 text-5xl">¿En qué le ayudo hoy?</h1>
              <p className="mt-3 text-muted-foreground">Hable o escriba. Estoy a su disposición.</p>
              <div className="mt-10 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-xl border bg-card px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message from={m.role} key={m.id}>
              <MessageContent
                className={cn(
                  m.role === "user" && "bg-primary text-primary-foreground",
                  m.role === "assistant" && "w-full bg-transparent p-0",
                )}
              >
                {m.parts.map((p, i) => {
                  const k = `${m.id}-${i}`;
                  if (p.type === "text") return <MessageResponse key={k}>{p.text}</MessageResponse>;
                  if (!p.type.startsWith("tool-") || !("toolCallId" in p)) return null;
                  const tp = p as Extract<typeof p, { toolCallId: string }> & {
                    type: `tool-${string}`;
                    state: "input-streaming" | "input-available" | "output-available" | "output-error";
                    input?: unknown;
                    output?: ToolOut;
                    errorText?: string;
                  };
                  const out = tp.state === "output-available" ? tp.output : undefined;
                  let card: React.ReactNode = null;
                  if (out?.ok) {
                    if (tp.type === "tool-generate_image") card = <ImageCard path={out.path ?? ""} prompt={out.prompt ?? ""} />;
                    if (tp.type === "tool-create_document") card = <DocumentCard title={out.title ?? ""} content={out.content ?? ""} />;
                    if (tp.type === "tool-open_website") card = <WebsiteCard name={out.name ?? ""} url={out.url ?? ""} />;
                    if (tp.type === "tool-add_task" || tp.type === "tool-complete_task") card = <TaskChip output={out} />;
                  }
                  return (
                    <div key={k} className="space-y-2">
                      {tp.type === "tool-generate_image" && !out && (
                        <Shimmer className="text-sm">Creando imagen…</Shimmer>
                      )}
                      {card}
                      <Tool defaultOpen={false}>
                        <ToolHeader type={tp.type as never} state={tp.state as never} />
                        <ToolContent>
                          <ToolInput input={tp.input} />
                          <ToolOutput output={tp.output as never} errorText={tp.errorText ?? (out && !out.ok ? String(out.error) : undefined)} />
                        </ToolContent>
                      </Tool>
                    </div>
                  );
                })}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && <Shimmer className="text-sm">Pensando…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <PromptInput onSubmit={({ text: t }) => send(t)}>
          <PromptInputTextarea
            autoFocus
            value={voice.listening ? voice.interim : text}
            onChange={(e) => setText(e.target.value)}
            placeholder={voice.listening ? "Escuchando…" : "Escriba a Orbix…"}
          />
          <PromptInputFooter>
            <PromptInputTools>
              {voice.supported && (
                <PromptInputButton
                  onClick={voice.listening ? voice.stop : voice.start}
                  className={cn(voice.listening && "bg-primary text-primary-foreground")}
                  aria-label="Hablar"
                >
                  {voice.listening ? <MicOff /> : <Mic />}
                </PromptInputButton>
              )}
              <PromptInputButton
                onClick={() => {
                  if (voiceOut) window.speechSynthesis?.cancel();
                  setVoiceOut(!voiceOut);
                }}
                aria-label="Respuesta en voz"
              >
                {voiceOut ? <Volume2 /> : <VolumeX />}
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !text.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}
