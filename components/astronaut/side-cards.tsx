"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setReminderDone, setSharing } from "@/lib/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { IconLock } from "@/components/icons";

export function SharingCard({ astronautId, categories, prefs }: { astronautId: number; categories: { id: string; label: string; note: string }[]; prefs: Record<string, boolean> }) {
  const router = useRouter();
  const [local, setLocal] = React.useState(prefs);
  const [, start] = React.useTransition();
  React.useEffect(() => setLocal(prefs), [prefs]);
  const toggle = (id: string, shared: boolean) => {
    setLocal((p) => ({ ...p, [id]: shared }));
    start(async () => { await setSharing(astronautId, id, shared); router.refresh(); });
  };
  return (
    <Card data-testid="sharing-card">
      <CardHeader>
        <CardTitle>Shared with Earth</CardTitle>
        <span className="chip">You choose</span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3">
              <label htmlFor={`share-${c.id}`} className="text-sm" title={c.note}>
                <span className="text-ink">{c.label}</span>
                
              </label>
              <Switch id={`share-${c.id}`} data-testid={`share-${c.id}`} checked={local[c.id] !== false} onCheckedChange={(v) => toggle(c.id, v)} aria-label={`Share ${c.label} with Earth`} />
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 border-t border-line pt-2">
            <span className="text-sm"><span className="text-ink">Private journal</span></span>
            <span className="flex items-center gap-1 font-mono text-xs uppercase text-soft"><IconLock /> Private</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

export function RemindersCard({ reminders, day }: { reminders: { id: number; title: string; detail: string | null; missionDay: number; done: boolean; origin: string }[]; day: number }) {
  const router = useRouter();
  const [, start] = React.useTransition();
  return (
    <Card data-testid="reminders-card">
      <CardHeader><CardTitle>Reminders</CardTitle></CardHeader>
      <CardContent>
        {reminders.length === 0 ? <p className="text-sm text-soft">Nothing due.</p> : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5">
                <input
                  id={`rem-${r.id}`} type="checkbox" defaultChecked={r.done}
                  onChange={(e) => start(async () => { await setReminderDone(r.id, e.target.checked); router.refresh(); })}
                  className="mt-1 h-4 w-4 cursor-pointer accent-[#3dd6c4]"
                />
                <label htmlFor={`rem-${r.id}`} className="text-sm">
                  <span className={r.done ? "text-soft line-through" : "text-ink"}>{r.title}</span>
                  <span className="block text-xs text-soft">
                    {r.missionDay === day ? "Today" : r.missionDay < day ? `Day ${r.missionDay} (overdue)` : `Day ${r.missionDay}`}
                    {r.detail ? ` · ${r.detail}` : ""}{r.origin === "timeline" ? " · from the mission timeline" : r.origin === "agent" ? " · set by the assistant" : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
