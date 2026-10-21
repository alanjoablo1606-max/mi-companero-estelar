import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

export const tasksKey = ["tasks"];

export function TasksPanel() {
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: tasksKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_at, done")
        .eq("done", false)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ done: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKey }),
  });

  return (
    <div className="space-y-1">
      <p className="px-2 pb-1 text-xs uppercase tracking-widest text-muted-foreground">Pendientes</p>
      {tasks.length === 0 && <p className="px-2 text-sm text-muted-foreground">Nada pendiente.</p>}
      {tasks.map((t) => (
        <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent">
          <Checkbox className="mt-0.5" onCheckedChange={() => complete.mutate(t.id)} />
          <span className="text-sm leading-tight">
            {t.title}
            {t.due_at && (
              <span className="block text-xs text-muted-foreground">
                {new Date(t.due_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
