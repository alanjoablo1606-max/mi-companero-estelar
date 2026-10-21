import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";

type Out = { ok?: boolean; error?: string; task?: { title?: string } };

export function ImageCard({ path, prompt }: { path: string; prompt?: string }) {
  const { data: url } = useQuery({
    queryKey: ["img", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("jarvis-images").createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 50 * 60 * 1000,
  });
  return (
    <figure className="overflow-hidden rounded-xl border bg-card">
      {url ? (
        <img src={url} alt={prompt ?? "Imagen generada"} className="w-full max-w-md" />
      ) : (
        <div className="aspect-square w-full max-w-md animate-pulse bg-muted" />
      )}
      {url && (
        <div className="flex justify-end p-2">
          <Button asChild size="sm" variant="ghost">
            <a href={url} download target="_blank" rel="noreferrer">
              <Download /> Descargar
            </a>
          </Button>
        </div>
      )}
    </figure>
  );
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function mdToHtml(md: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return md
    .split(/\n{2,}/)
    .map((block) => {
      const b = esc(block).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
      const h = b.match(/^(#{1,3})\s+(.*)/);
      if (h?.[1] && h[2]) return `<h${h[1].length}>${h[2]}</h${h[1].length}>`;
      if (/^[-*]\s/m.test(b)) return `<ul>${b.split("\n").map((l) => `<li>${l.replace(/^[-*]\s/, "")}</li>`).join("")}</ul>`;
      return `<p>${b.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}

export function DocumentCard({ title, content }: { title: string; content: string }) {
  const safe = title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "documento";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <FileText className="size-4 text-primary" /> {title}
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg bg-background/60 p-3 text-sm">
        <MessageResponse>{content}</MessageResponse>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() =>
            download(
              `${safe}.doc`,
              `<html><head><meta charset="utf-8"><title>${safe}</title></head><body>${mdToHtml(content)}</body></html>`,
              "application/msword",
            )
          }
        >
          <Download /> Word
        </Button>
        <Button size="sm" variant="outline" onClick={() => download(`${safe}.md`, content, "text/markdown")}>
          <Download /> Markdown
        </Button>
      </div>
    </div>
  );
}

export function WebsiteCard({ name, url }: { name: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm hover:bg-accent"
    >
      <ExternalLink className="size-4 text-primary" /> Abrir {name}
    </a>
  );
}

export function TaskChip({ output }: { output: Out }) {
  const task = output.task;
  if (!task?.title) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm">
      <CheckCircle2 className="size-4 text-primary" /> {task.title}
    </div>
  );
}
