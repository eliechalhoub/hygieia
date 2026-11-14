import { z } from "zod";
import { AGENT_TOOLS, runAgentTool } from "@/lib/server/agent-tools";
import { getAstronaut, getMission } from "@/lib/server/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "none";
const MAX_TOOL_ROUNDS = 8;
const SYSTEM = `You are Hygieia's crew-health assistant for deep-space missions. The flight surgeon on Earth can be up to 22 minutes away each way.

How to work
- Before stating anything about an astronaut's health, read it with a tool. Quote the numbers, units and mission day used.
- If data is missing or a forecast abstains, say so. Never fill gaps from memory.
- Before explaining a spaceflight health risk, call search_medical_kb and base the explanation on its results.
- Never diagnose or prescribe. Explain data and engine suggestions, and when to involve the crew medical officer or flight surgeon.
- Research countermeasures are not treatments. Thresholds and recovery coefficients are engineering defaults, not medical advice.
- Respect sharing choices. Tools cannot access the private journal or categories the astronaut did not share.
- A Houston message is only a draft. Tell the astronaut it needs approval before sending.
- For emergencies such as chest pain, trouble breathing, collapse or severe bleeding, tell them to press the red Emergency button now. Triage works without AI or network.

Use plain words, short sentences and a calm tone. Lead with the answer. Keep replies brief, usually under 120 words. Plain text only, with short lists if useful.`;
const bodySchema = z.object({
  astronautId: z.number().int(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(40),
});
const UNAVAILABLE = "Chat unavailable — configure an OpenAI API key. Everything else works.";
type Event =
  | { type: "text"; delta: string }
  | { type: "tool"; label: string }
  | { type: "draft"; subject: string; body: string }
  | { type: "unavailable"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

type OpenAIOutputItem = { type: string; role?: string; content?: { type: string; text?: string }[]; call_id?: string; name?: string; arguments?: string };
type OpenAIInput =
  | { role: "user" | "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

const tools = AGENT_TOOLS.map((tool) => ({
  type: "function" as const,
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema,
  strict: false,
}));

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { astronautId, messages: history } = parsed.data;
  const astronaut = getAstronaut(astronautId);
  if (!astronaut) return Response.json({ error: "Unknown astronaut" }, { status: 404 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ unavailable: true, message: UNAVAILABLE }, { status: 503 });

  const mission = getMission();
  const context = `You are talking with ${astronaut.name} (${astronaut.role}). Mission Day ${mission.currentDay}. Environment: ${mission.profile.label} (${mission.profile.subtitle}); one-way link delay ${mission.profile.comms.label.toLowerCase()}.`;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const input: OpenAIInput[] = history.map((message) => ({ role: message.role, content: message.content }));
      try {
        let answer = "";
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({
              model: MODEL,
              instructions: `${SYSTEM}\n\n${context}`,
              input,
              tools,
              tool_choice: "auto",
              reasoning: { effort: REASONING_EFFORT },
              max_output_tokens: 2048,
            }),
            signal: AbortSignal.timeout(120_000),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const status = response.status;
            if (status === 401 || status === 403) send({ type: "unavailable", message: "OpenAI rejected the API key or account access. Check the configured key and model." });
            else if (status === 429) send({ type: "error", message: "The chat service is busy or out of API quota. Try again later." });
            else send({ type: "error", message: `OpenAI error (${status}). Everything else in Hygieia still works.` });
            break;
          }
          const output = payload.output as OpenAIOutputItem[] | undefined;
          if (!output) throw new Error("OpenAI returned no response output.");
          const calls = output.filter((item) => item.type === "function_call");
          if (!calls.length) {
            answer = output.filter((item) => item.type === "message").flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
            break;
          }
          for (const call of calls) {
            let toolInput: unknown;
            try { toolInput = JSON.parse(call.arguments || "{}"); }
            catch { toolInput = {}; }
            const outcome = await runAgentTool(call.name ?? "", toolInput, astronautId);
            send({ type: "tool", label: outcome.label });
            if (outcome.draft) send({ type: "draft", ...outcome.draft });
            if (!call.call_id || !call.name) throw new Error("OpenAI returned an incomplete tool call.");
            input.push({ type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments ?? "{}" });
            input.push({ type: "function_call_output", call_id: call.call_id, output: outcome.content });
          }
        }
        if (answer) send({ type: "text", delta: answer });
        send({ type: "done" });
      } catch (error) {
        const unavailable = error instanceof Error && (error.name === "TimeoutError" || error.name === "TypeError");
        send(unavailable
          ? { type: "unavailable", message: "Could not reach OpenAI. Check the server connection and try again." }
          : { type: "error", message: "Chat failed. Everything else in Hygieia still works." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
