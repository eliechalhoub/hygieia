import Link from "next/link";
import { SourceLink } from "@/components/source-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { evidenceFor, loadKb, loadOsdrStudies } from "@/lib/server/kb";

export const dynamic = "force-dynamic";

const COVERAGE: Record<string, { word: string; cls: string }> = {
  monitored: { word: "Monitored", cls: "border-ok/50 text-ok" },
  "self-check": { word: "Self-check or triage only", cls: "border-warn/50 text-warn" },
  "knowledge-base": { word: "Knowledge base only", cls: "border-line text-soft" },
};

/** Minimal Markdown: "## " headings and paragraphs. The notes use nothing else. */
function Body({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm">
      {text.split(/\n\s*\n/).map((block, i) =>
        block.startsWith("## ")
          ? <h3 key={i} className="label pt-1">{block.slice(3)}</h3>
          : <p key={i} className="leading-relaxed text-ink">{block}</p>,
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const notes = loadKb();
  const osdr = loadOsdrStudies();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="label">Knowledge base · works offline · searched by the AI assistant</p>
        <h1 className="font-display text-2xl font-semibold">Spaceflight health risks</h1>
        <p className="mt-1 text-sm text-soft">
          One note for each of NASA&apos;s 17 Human Research Program risks: what it is, and what Hygieia can and cannot observe. <SourceLink id="nasa-hrp-risks" />{" "}
          Evidence links are study records in NASA&apos;s Open Science Data Repository <SourceLink id="nasa-osdr-biodata" /> (metadata fetched {osdr.fetched_at?.slice(0, 10) ?? "—"}).
        </p>
      </div>
      <nav aria-label="Notes" className="flex flex-wrap gap-2">
        {notes.map((n) => (<a key={n.slug} href={`#${n.slug}`} className="rounded-md border border-line px-2 py-1 text-xs text-soft hover:text-ink">{n.title.replace(/^Risk of /, "")}</a>))}
      </nav>
      {notes.map((n) => {
        const evidence = evidenceFor(n, osdr.studies);
        const cov = COVERAGE[n.coverage] ?? COVERAGE["knowledge-base"];
        return (
          <Card key={n.slug} id={n.slug} data-testid="kb-note" className="scroll-mt-20 target:border-teal">
            <CardHeader>
              <CardTitle>{n.title}</CardTitle>
              <span className={`rounded-full border px-2.5 py-0.5 font-mono text-xs uppercase ${cov.cls}`}>{cov.word}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <Body text={n.body} />
              <p className="text-xs text-soft">Source: {n.source} <SourceLink id={n.sourceId} /></p>
              {evidence.length > 0 && (
                <div data-testid="kb-evidence">
                  <p className="label">Evidence in NASA OSDR</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {evidence.map((s) => (
                      <li key={s.osd_id}>
                        <a href={s.link} target="_blank" rel="noreferrer" className="text-teal hover:underline"><span className="num">{s.osd_id}</span> ↗</a>{" "}
                        <span className="text-soft">{s.title} ({s.organism})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-soft">Related open datasets, not proof of any claim in this note.</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-sm"><Link href="/about" className="text-teal hover:underline">← How these risks map to Hygieia&apos;s features</Link></p>
    </div>
  );
}
