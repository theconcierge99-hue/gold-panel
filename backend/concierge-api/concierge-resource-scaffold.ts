/**
 * Lightweight single-page HTML scaffold via Gemini (Edge-safe).
 */
import { normalizeGeminiApiKey } from "./concierge-gemini";

const TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const SCAFFOLD_SYSTEM = `You are a web scaffold generator for The Concierge.
Return JSON only: {"title":"...","html":"..."}.
- html must be a complete single-file HTML document (inline CSS, no external scripts except https CDN if needed).
- Mobile-friendly, dark theme, professional typography.
- No markdown fences. Escape quotes in HTML properly for JSON.`;

export type ResourceScaffoldResult = {
  title: string;
  html: string;
  slug: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "page";
}

async function geminiScaffold(
  apiKey: string,
  prompt: string,
): Promise<{ title: string; html: string }> {
  const userText = `Build a single-page site: ${prompt.slice(0, 2_000)}`;
  const errors: string[] = [];

  for (const model of TEXT_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SCAFFOLD_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(22_000),
      });
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        errors.push(`${model}: no JSON`);
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]) as { title?: string; html?: string };
      if (!parsed.html?.trim()) {
        errors.push(`${model}: empty html`);
        continue;
      }
      return {
        title: (parsed.title ?? prompt.slice(0, 80)).trim(),
        html: parsed.html.trim(),
      };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new Error(errors.length ? errors.join("; ") : "Scaffold generation failed");
}

export async function runResourceScaffold(prompt: string): Promise<ResourceScaffoldResult> {
  const apiKey = normalizeGeminiApiKey(process.env.GEMINI_API_KEY);
  const { title, html } = await geminiScaffold(apiKey, prompt);
  return { title, html, slug: slugify(title) };
}
