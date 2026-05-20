export type ChatTurn = { role: "user" | "model"; text: string };

export type ConciergeMode = "chat" | "enhance";

const SYSTEM_PROMPT = `You are Concierge, the onchain intelligence partner for Executive Lounge — a private intelligence terminal for macro, crypto, DeFi, Solana, and equities.

Tone: institutional, analytical, calm. No hype or emojis.
Use 2–4 short HTML paragraphs wrapped in <p> tags. Use <strong> for tickers and key levels (BTC, ETH, DXY, SOL, SPX).
You may use <em> sparingly. Do not use markdown, code fences, or headings.
Do not invent live prices unless the user provides them; speak in regimes and positioning language.
If asked for financial advice, frame as scenario analysis, not personal advice.`;

const ENHANCE_PROMPT = `Rewrite the signal copy for Executive Lounge. Return JSON only: {"title":"...","summary":"...","implication":"..."}.
Keep institutional tone. Title under 120 chars. Summary 2–3 sentences. Implication 2 sentences on market impact.`;

const MODEL = "gemini-2.0-flash";

type GeminiContent = { role: string; parts: { text: string }[] };

function buildContents(history: ChatTurn[], message: string): GeminiContent[] {
  const contents: GeminiContent[] = history.slice(-8).map((t) => ({
    role: t.role === "user" ? "user" : "model",
    parts: [{ text: t.text }],
  }));
  contents.push({ role: "user", parts: [{ text: message }] });
  return contents;
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function runConciergeGemini(options: {
  apiKey: string;
  mode: ConciergeMode;
  message: string;
  history?: ChatTurn[];
  signal?: { title?: string; summary?: string };
}): Promise<{ reply: string } | { title: string; summary: string; implication: string }> {
  const { apiKey, mode, message, history = [], signal } = options;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  if (mode === "enhance") {
    const userText = [
      "Enhance this signal draft.",
      signal?.title ? `Title: ${signal.title}` : "",
      signal?.summary ? `Summary: ${signal.summary}` : "",
      message ? `Editor note: ${message}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ENHANCE_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 800 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Enhance: invalid model response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      summary?: string;
      implication?: string;
    };
    return {
      title: parsed.title ?? signal?.title ?? "",
      summary: parsed.summary ?? signal?.summary ?? "",
      implication: parsed.implication ?? "",
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: buildContents(
        history.map((h) => ({
          role: h.role,
          text: h.role === "model" ? stripHtmlToText(h.text) : h.text,
        })),
        message,
      ),
      generationConfig: { temperature: 0.65, maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  let reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!reply) throw new Error("Empty response from Gemini");

  if (!reply.includes("<p>")) {
    reply = `<p>${reply.replace(/\n\n/g, "</p><p>").replace(/\n/g, " ")}</p>`;
  }

  return { reply };
}

export async function readJsonBody<T>(body: string): Promise<T> {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}
