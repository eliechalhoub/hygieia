"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createStandingOrder, sendMessage, setStandingOrderEnabled } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/controls";

export function StandingOrderForm({ metrics, crew, surgeon }: { metrics: { id: string; label: string; unit: string }[]; crew: { id: number; name: string }[]; surgeon: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [metric, setMetric] = React.useState("sleep_hours");
  const [operator, setOperator] = React.useState<"<" | "<=" | ">" | ">=">("<");
  const [value, setValue] = React.useState("6.5");
  const [days, setDays] = React.useState("2");
  const [who, setWho] = React.useState("");
  const [advice, setAdvice] = React.useState("");
  const [name, setName] = React.useState(surgeon);
  const [note, setNote] = React.useState<string | null>(null);
  const unit = metrics.find((m) => m.id === metric)?.unit ?? "";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNote(null);
    start(async () => {
      try {
        await createStandingOrder({ metric, operator, value: Number(value), consecutiveDays: Number(days), advice: advice.trim(), surgeon: name.trim(), astronautId: who ? Number(who) : null });
        setAdvice("");
        setNote("Order sent. It becomes active on board when it arrives.");
        router.refresh();
      } catch {
        setNote("Could not send. Check the value and write the advice.");
      }
    });
  };

  return (
    <form onSubmit={submit} data-testid="order-form" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1.4fr_0.6fr_0.7fr_0.8fr]">
        <Field label="When this measure">
          <Select data-testid="order-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
            {metrics.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
          </Select>
        </Field>
        <Field label="Is">
          <Select data-testid="order-operator" value={operator} onChange={(e) => setOperator(e.target.value as typeof operator)}>
            <option value="<">below</option><option value="<=">at or below</option><option value=">">above</option><option value=">=">at or above</option>
          </Select>
        </Field>
        <Field label={`Value${unit ? ` (${unit})` : ""}`}>
          <Input data-testid="order-value" type="number" step="any" required value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="For days in a row">
          <Input data-testid="order-days" type="number" min={1} max={14} required value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      <Field label="Then tell the crew member">
        <Textarea data-testid="order-advice" required minLength={3} value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Plain instructions the crew can act on without waiting for you." />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Applies to">
          <Select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Whole crew</option>
            {crew.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </Select>
        </Field>
        <Field label="Signed by"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="coral" disabled={pending} data-testid="order-submit">{pending ? "Sending…" : "Send standing order to the ship"}</Button>
        {note && <span data-testid="order-note" className="text-sm text-soft">{note}</span>}
      </div>
    </form>
  );
}

export function OrderToggle({ id, enabled }: { id: number; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = React.useState(enabled);
  const [, start] = React.useTransition();
  return (
    <Switch
      checked={on} aria-label="Order enabled"
      onCheckedChange={(v) => { setOn(v); start(async () => { await setStandingOrderEnabled(id, v); router.refresh(); }); }}
    />
  );
}

export function ComposeMessage({ direction, author, label, testid }: { direction: "to_earth" | "to_ship"; author: string; label: string; testid: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  return (
    <form
      data-testid={testid}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => { await sendMessage({ direction, subject: subject.trim(), body: body.trim(), author }); setSubject(""); setBody(""); router.refresh(); });
      }}
    >
      <Input aria-label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      <Textarea aria-label="Message" required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>{pending ? "Sending…" : label}</Button>
    </form>
  );
}
