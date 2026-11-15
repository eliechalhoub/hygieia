"use client";

import * as React from "react";
import { sendMessage } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { IconSend, IconX } from "@/components/icons";

interface Turn {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  draft?: { subject: string; body: string; state: "pending" | "sent" | "discarded" };
  notice?: string;
}

const SUGGESTIONS = ["Why is my status what it is today?", "What is the smallest change I can make tonight?", "Is there a radiation risk right now?", "Draft a short note to Houston about my sleep."];

export function ChatPanel({ astronautId, crew, onClose }: { astronautId: number; crew: { id: number; name: string; shortName: string }[]; onClose: () => void }) {
  const me = crew.find((c) => c.id === astronautId) ?? crew[0];
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns]);

  const patchLast = (fn: (t: Turn) => Turn) => setTurns((all) => all.map((t, i) => (i === all.length - 1 ? fn(t) : t)));

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const history = [...turns.filter((t) => t.content), { role: "user" as const, content: question }];
    setTurns([...turns, { role: "user", content: question }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ astronautId: me.id, messages: history.map((t) => ({ role: t.role, content: t.content })) }),
      });
      if (res.status === 503 || !res.body) {
        const data = await res.json().catch(() => ({}));
        setUnavailable(data.message ?? "Chat unavailable offline — everything else works.");
        patchLast((t) => ({ ...t, notice: data.message ?? "Chat unavailable offline — everything else works." }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") patchLast((t) => ({ ...t, content: t.content + ev.delta }));
          else if (ev.type === "tool") patchLast((t) => ({ ...t, tools: [...(t.tools ?? []), ev.label] }));
          else if (ev.type === "draft") patchLast((t) => ({ ...t, draft: { subject: ev.subject, body: ev.body, state: "pending" } }));
          else if (ev.type === "unavailable") { setUnavailable(ev.message); patchLast((t) => ({ ...t, notice: ev.message })); }
          else if (ev.type === "error") patchLast((t) => ({ ...t, notice: ev.message }));
        }
      }
    } catch {
      const msg = "Chat unavailable offline — everything else works.";
      setUnavailable(msg);
      patchLast((t) => ({ ...t, notice: msg }));
    } finally {
      setBusy(false);
    }
  }

  async function approve(index: number) {
    const t = turns[index];
    if (!t.draft) return;
    await sendMessage({ direction: "to_earth", subject: t.draft.subject, body: t.draft.body, author: me.name, kind: "note" });
    setTurns((all) => all.map((x, i) => (i === index && x.draft ? { ...x, draft: { ...x.draft, state: "sent" } } : x)));
  }

  return (
    <aside data-testid="chat-panel" aria-label="AI assistant" className="sticky top-[57px] flex h-[calc(100vh-57px)] w-full max-w-sm shrink-0 flex-col border-l border-line bg-bg-alt">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold">Ask Hygieia</h2>
          <p className="text-xs text-soft">For {me.name}. Uses a cloud model that stands in for a future onboard one.</p>
          <p data-testid="chat-si-label" className="si-mark mt-0.5">Responses are SI-generated</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close chat" onClick={onClose}><IconX /></Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-soft">Ask about your own data. I read it through the same tools you see on the dashboard, quote the numbers I use, and never see your private journal or categories you do not share.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="block w-full cursor-pointer rounded-md border border-line px-3 py-2 text-left text-sm text-ink hover:border-teal/60">{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "ml-6 rounded-lg bg-panel-hi px-3 py-2 text-sm" : "mr-3 text-sm"}>
            {t.tools && t.tools.length > 0 && (
              <ul className="mb-1.5 space-y-0.5">
                {t.tools.map((label, j) => (<li key={j} className="font-mono text-[11px] text-teal">↳ {label}</li>))}
              </ul>
            )}
            {t.content && <p className="whitespace-pre-wrap leading-relaxed">{t.content}</p>}
            {t.role === "assistant" && !t.content && !t.notice && busy && i === turns.length - 1 && <p className="text-soft">Reading your data…</p>}
            {t.notice && <p data-testid="chat-notice" className="mt-1 rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-warn">{t.notice}</p>}
            {t.draft && (
              <div className="mt-2 rounded-lg border border-coral/50 bg-coral/5 p-3">
                <p className="label !text-coral">Draft to Houston — not sent</p>
                <p className="mt-1 font-medium">{t.draft.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-soft">{t.draft.body}</p>
                {t.draft.state === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="coral" onClick={() => approve(i)}>Approve and send</Button>
                    <Button size="sm" variant="ghost" onClick={() => setTurns((all) => all.map((x, k) => (k === i && x.draft ? { ...x, draft: { ...x.draft, state: "discarded" } } : x)))}>Discard</Button>
                  </div>
                ) : (
                  <p className="mt-2 font-mono text-xs text-soft">{t.draft.state === "sent" ? "Approved. In transit on the delayed link." : "Discarded."}</p>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        {unavailable && <p className="mb-2 text-xs text-warn">{unavailable}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Message"
            data-testid="chat-input"
            value={input}
            rows={2}
            placeholder="Ask about your data…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            className="min-h-0"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send"><IconSend /></Button>
        </div>
        <p className="mt-1.5 text-[11px] text-soft">SI-generated, not a diagnosis. Emergency? Use the red button — it works without this chat.</p>
      </form>
    </aside>
  );
}
