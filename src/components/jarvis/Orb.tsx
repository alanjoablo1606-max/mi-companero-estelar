import { cn } from "@/lib/utils";

export function Orb({ active, className }: { active?: boolean; className?: string }) {
  return <div aria-hidden className={cn("orb", active && "orb-active", className)} />;
}
