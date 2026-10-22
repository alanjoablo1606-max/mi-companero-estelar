import { tool } from "ai";
import { z } from "zod/v4";

const GW = "https://connector-gateway.lovable.dev";

async function gw(connector: "google_mail" | "google_calendar", path: string, init?: RequestInit) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const key = connector === "google_mail" ? process.env["GOOGLE_MAIL_API_KEY"] : process.env["GOOGLE_CALENDAR_API_KEY"];
  if (!lovable || !key) throw new Error("La conexión con Google no está configurada");
  const res = await fetch(`${GW}/${connector}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": key,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Google respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

/** Email of the Google account connected to this project. */
export async function connectedGoogleEmail(): Promise<string | null> {
  try {
    const p = (await gw("google_mail", "/gmail/v1/users/me/profile")) as { emailAddress?: string };
    return p.emailAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

function header(headers: { name: string; value: string }[] | undefined, name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(part: { mimeType?: string; body?: { data?: string }; parts?: unknown[] } | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    const bin = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  for (const p of (part.parts ?? []) as (typeof part)[]) {
    const t = decodeBody(p);
    if (t) return t;
  }
  return "";
}

const safe = <T,>(fn: () => Promise<T>) =>
  fn().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));

export const googleTools = {
  gmail_search: tool({
    description: "Busca correos en Gmail del usuario. Usa sintaxis de búsqueda de Gmail (ej. 'is:unread', 'from:juan').",
    inputSchema: z.object({ query: z.string(), max: z.number().int().min(1).max(15) }),
    execute: ({ query, max }) =>
      safe(async () => {
        const list = (await gw("google_mail", `/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`)) as {
          messages?: { id: string }[];
        };
        const msgs = await Promise.all(
          (list.messages ?? []).map(async ({ id }) => {
            const m = (await gw(
              "google_mail",
              `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            )) as { id: string; snippet: string; payload?: { headers?: { name: string; value: string }[] } };
            const h = m.payload?.headers;
            return { id: m.id, from: header(h, "From"), subject: header(h, "Subject"), date: header(h, "Date"), snippet: m.snippet };
          }),
        );
        return { ok: true, messages: msgs };
      }),
  }),
  gmail_read: tool({
    description: "Lee el contenido completo de un correo por id (obtenido con gmail_search).",
    inputSchema: z.object({ id: z.string() }),
    execute: ({ id }) =>
      safe(async () => {
        const m = (await gw("google_mail", `/gmail/v1/users/me/messages/${id}?format=full`)) as {
          payload?: { headers?: { name: string; value: string }[]; mimeType?: string; body?: { data?: string }; parts?: unknown[] };
        };
        const h = m.payload?.headers;
        return {
          ok: true,
          from: header(h, "From"),
          subject: header(h, "Subject"),
          date: header(h, "Date"),
          body: decodeBody(m.payload).slice(0, 6000),
        };
      }),
  }),
  gmail_send: tool({
    description:
      "Envía un correo desde la cuenta Gmail del usuario. SOLO úsalo después de mostrar el borrador y recibir confirmación explícita del usuario.",
    inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
    execute: ({ to, subject, body }) =>
      safe(async () => {
        const raw = b64(
          [`To: ${to}`, `Subject: ${hdr(subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", body].join("\r\n"),
        )
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        await gw("google_mail", "/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
        return { ok: true, to, subject };
      }),
  }),
  calendar_list: tool({
    description: "Lista eventos del Google Calendar del usuario entre dos fechas ISO 8601.",
    inputSchema: z.object({ from: z.string(), to: z.string() }),
    execute: ({ from, to }) =>
      safe(async () => {
        const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "25" });
        const r = (await gw("google_calendar", `/calendar/v3/calendars/primary/events?${q}`)) as {
          items?: { id: string; summary?: string; location?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[];
        };
        return {
          ok: true,
          events: (r.items ?? []).map((e) => ({
            id: e.id,
            title: e.summary ?? "(sin título)",
            start: e.start?.dateTime ?? e.start?.date,
            end: e.end?.dateTime ?? e.end?.date,
            location: e.location ?? null,
          })),
        };
      }),
  }),
  calendar_create: tool({
    description: "Crea un evento en el Google Calendar del usuario. Fechas ISO 8601 con zona horaria.",
    inputSchema: z.object({
      title: z.string(),
      start: z.string(),
      end: z.string(),
      description: z.string().nullable(),
      location: z.string().nullable(),
    }),
    execute: ({ title, start, end, description, location }) =>
      safe(async () => {
        const e = (await gw("google_calendar", "/calendar/v3/calendars/primary/events", {
          method: "POST",
          body: JSON.stringify({
            summary: title,
            start: { dateTime: start, timeZone: "America/Mexico_City" },
            end: { dateTime: end, timeZone: "America/Mexico_City" },
            ...(description ? { description } : {}),
            ...(location ? { location } : {}),
          }),
        })) as { id: string; htmlLink?: string };
        return { ok: true, id: e.id, title, start, link: e.htmlLink ?? null };
      }),
  }),
};
