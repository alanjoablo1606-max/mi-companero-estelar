import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod/v4";
import type { Database } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const GATEWAY = "https://ai.gateway.lovable.dev";
const CHAT_MODEL = "openai/gpt-6-astra";
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";

function json(status: number, error: string) {
  return Response.json({ error }, { status });
}

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const SYSTEM = (now: string) => `Eres JARVIS, un asistente personal elegante, sereno y eficiente. Respondes en el idioma del usuario (por defecto español de México), de forma breve y clara, con un toque de humor británico discreto. Te diriges al usuario como "señor" o "señora" solo ocasionalmente.

Fecha y hora actual (UTC): ${now}. El usuario está en la zona horaria America/Mexico_City.

Herramientas:
- Tareas y recordatorios: usa add_task, list_tasks y complete_task. Convierte fechas relativas ("mañana a las 9") a ISO 8601 con zona horaria de Ciudad de México.
- generate_image: cuando pidan crear, dibujar o generar una imagen.
- create_document: cuando pidan redactar un documento, carta, resumen, informe, etc. Escribe el contenido completo en Markdown.
- open_website: cuando pidan abrir una app o sitio (YouTube, Spotify, Gmail, Maps...). Usa la URL web oficial. No puedes abrir programas instalados en la computadora; abre su versión web.
Tras usar una herramienta, confirma brevemente el resultado sin repetir todo el contenido.`;

export async function handleChat(request: Request) {
  const apiKey = process.env.LOVABLE_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!apiKey || !SUPABASE_URL || !SUPABASE_KEY) return json(500, "Configuración incompleta del servidor");

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "Inicia sesión para continuar");

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: { fetch: supabaseFetch(SUPABASE_KEY), headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return json(401, "Sesión no válida");

  let body: { messages?: UIMessage[]; threadId?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, "Solicitud inválida");
  }
  const { messages, threadId } = body;
  if (!Array.isArray(messages) || typeof threadId !== "string") return json(400, "Solicitud inválida");

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, title")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError || !thread) return json(404, "Conversación no encontrada");

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${GATEWAY}/v1`,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const tools = {
    add_task: tool({
      description: "Crea una tarea o recordatorio para el usuario.",
      inputSchema: z.object({
        title: z.string().describe("Descripción corta de la tarea"),
        due_at: z.string().nullable().describe("Fecha/hora ISO 8601 o null si no tiene"),
      }),
      execute: async ({ title, due_at }) => {
        const { data, error } = await supabase
          .from("tasks")
          .insert({ title, due_at, user_id: userId })
          .select("id, title, due_at, done")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, task: data };
      },
    }),
    list_tasks: tool({
      description: "Lista las tareas del usuario.",
      inputSchema: z.object({ include_done: z.boolean() }),
      execute: async ({ include_done }) => {
        let q = supabase.from("tasks").select("id, title, due_at, done").order("created_at", { ascending: false }).limit(50);
        if (!include_done) q = q.eq("done", false);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, tasks: data };
      },
    }),
    complete_task: tool({
      description: "Marca una tarea como completada usando su id (obténlo con list_tasks).",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { data, error } = await supabase.from("tasks").update({ done: true }).eq("id", id).select("id, title").maybeSingle();
        if (error || !data) return { ok: false, error: error?.message ?? "No encontrada" };
        return { ok: true, task: data };
      },
    }),
    generate_image: tool({
      description: "Genera una imagen a partir de una descripción detallada.",
      inputSchema: z.object({ prompt: z.string().describe("Descripción detallada en inglés o español") }),
      execute: async ({ prompt }) => {
        const res = await fetch(`${GATEWAY}/v1/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: IMAGE_MODEL, prompt }),
          signal: request.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, error: `No se pudo generar la imagen (${res.status}) ${text.slice(0, 200)}` };
        }
        const payload = (await res.json()) as { data?: { b64_json?: string }[] };
        const b64 = payload.data?.[0]?.b64_json;
        if (!b64) return { ok: false, error: "La respuesta no incluyó imagen" };
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const path = `${userId}/${crypto.randomUUID()}.png`;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.storage.from("jarvis-images").upload(path, bytes, { contentType: "image/png" });
        if (error) return { ok: false, error: error.message };
        return { ok: true, path, prompt };
      },
    }),
    create_document: tool({
      description: "Crea un documento descargable con contenido en Markdown.",
      inputSchema: z.object({ title: z.string(), content: z.string().describe("Contenido completo en Markdown") }),
      execute: async ({ title, content }) => ({ ok: true, title, content }),
    }),
    open_website: tool({
      description: "Abre un sitio web en una pestaña nueva del navegador del usuario.",
      inputSchema: z.object({ name: z.string(), url: z.string().describe("URL https completa") }),
      execute: async ({ name, url }) => {
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: "URL inválida" };
        return { ok: true, name, url };
      },
    }),
  };

  const result = streamText({
    model: provider.responses(CHAT_MODEL),
    instructions: SYSTEM(new Date().toISOString()),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const firstUser = messages.find((m) => m.role === "user");
  const firstText =
    firstUser?.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text ?? "";

  const response = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    onFinish: async ({ messages: finalMessages }) => {
      const update: Database["public"]["Tables"]["threads"]["Update"] = {
        messages: finalMessages as unknown as Database["public"]["Tables"]["threads"]["Update"]["messages"],
        updated_at: new Date().toISOString(),
      };
      if (thread.title === "Nueva conversación" && firstText) update.title = firstText.slice(0, 60);
      const { error } = await supabase.from("threads").update(update).eq("id", threadId);
      if (error) console.error("Failed to save thread", error);
    },
    onError: (error) => {
      console.error(error);
      const msg = error instanceof Error ? error.message : String(error);
      if (/402/.test(msg)) return "Se agotaron los créditos de IA del espacio de trabajo.";
      if (/429/.test(msg)) return "Demasiadas solicitudes. Intenta de nuevo en un momento.";
      return "Ocurrió un error al responder.";
    },
  });
  return withLovableAiGatewayRunIdHeader(response, runIdFetch);
}
