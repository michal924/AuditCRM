// LFA Hub: agent planowania (etap 2b). Cienki serwer: trzyma klucz Anthropic i definicje narzędzi.
// Narzędzia wykonuje przeglądarka (dane z SharePoint i kalendarzy zalogowanego właściciela), tu tylko wywołanie modelu.
// Agent niczego nie zapisuje: narzędzie zaproponuj_zmiane pokazuje propozycję, decyzja należy do właściciela.
import { app } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";

const TENANT_ID = process.env.LFA_TENANT_ID || "8ac2d776-ee71-46a1-a2ca-da0553d51285";
const CLIENT_ID = process.env.LFA_CLIENT_ID || "4f387d2a-b650-4ebc-b2c2-7bfa29dee540";
const ALLOWED_OIDS = String(process.env.LFA_ALLOWED_OIDS || "").split(",").map(s => s.trim()).filter(Boolean);
const MODEL = process.env.LFA_MODEL || "claude-opus-5-5";
const MAX_BODY = 400_000;
const JWKS = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`));

const SYSTEM = `Jesteś asystentem planowania audytów LF Assurance (jednostki certyfikujące CU i SGS). Rozmawiasz z właścicielem, audytorem.
Zasady:
- Odpowiadasz po polsku, krótko i prosto. Nie używasz myślników w zdaniach. Daty piszesz jako dzień.miesiąc (np. 3.12), godziny jako 9:00.
- Dane pochodzą wyłącznie z narzędzi. Nie zgadujesz terminów, odległości ani reguł. Gdy czegoś brakuje, pytasz.
- Klienci mają pseudonimy (KL-...), audyty identyfikatory (A-...). Używasz ich dokładnie tak, jak podają narzędzia.
- Niczego nie zapisujesz ani nie wysyłasz. Zmianę terminu proponujesz narzędziem zaproponuj_zmiane, a właściciel sam ją zatwierdza w karcie audytu. Nigdy nie piszesz, że coś zostało zmienione.
- Reguły twarde (bezstronność, rozdział CU i SGS, terminy jednostki, nocleg w tygodniu opieki) nie mogą być złamane. Reguły miękkie (sobota, dwa audyty dziennie, kolizje) możesz zaproponować z wyraźnym uzasadnieniem.
- Przy przesunięciu najpierw użyj inne_terminy, potem wybierz najlepszy wariant i wyjaśnij dlaczego w jednym lub dwóch zdaniach.`;

const TOOLS = [
  { name: "pobierz_tydzien", description: "Tydzień planu: audyty (z dojazdem, ustaleniami reguł i terminami jednostki), zajętość kalendarzy, tygodnie opieki, propozycje bloków na raporty. Podaj dowolny dzień tygodnia.",
    input_schema: { type: "object", properties: { data: { type: "string", description: "Dzień w formacie RRRR-MM-DD" } }, required: ["data"] } },
  { name: "szukaj_audytow", description: "Szuka audytów po pseudonimie klienta, mieście albo programie w podanym okresie. Zwraca identyfikatory A-..., daty, jednostkę i miasto.",
    input_schema: { type: "object", properties: { fraza: { type: "string", description: "Pseudonim KL-..., miasto lub program; puste = wszystkie" }, od: { type: "string", description: "RRRR-MM-DD" }, do: { type: "string", description: "RRRR-MM-DD" } }, required: ["od", "do"] } },
  { name: "inne_terminy", description: "Do trzech innych dni dla audytu, policzone regułami (opieka, kalendarze, terminy wysyłki planu), z uzasadnieniem.",
    input_schema: { type: "object", properties: { audyt: { type: "string", description: "Identyfikator A-..." } }, required: ["audyt"] } },
  { name: "pobierz_reguly", description: "Aktualne reguły planowania właściciela.", input_schema: { type: "object", properties: {} } },
  { name: "zaproponuj_zmiane", description: "Pokazuje właścicielowi propozycję zmiany terminu audytu do zatwierdzenia. Niczego nie zapisuje.",
    input_schema: { type: "object", properties: { audyt: { type: "string" }, nowa_data: { type: "string", description: "RRRR-MM-DD" }, nowa_godzina: { type: "string", description: "GG:MM, opcjonalnie" }, uzasadnienie: { type: "string" } }, required: ["audyt", "nowa_data", "uzasadnienie"] } },
];
TOOLS[TOOLS.length - 1].cache_control = { type: "ephemeral" };

let client = null;
const json = (status, body) => ({ status, jsonBody: body, headers: { "Cache-Control": "no-store" } });

async function verify(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const { payload } = await jwtVerify(token, JWKS, { issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`, audience: CLIENT_ID });
  if (payload.tid !== TENANT_ID) return null;
  if (ALLOWED_OIDS.length && !ALLOWED_OIDS.includes(payload.oid)) return null;
  return payload;
}

// Wiadomości przychodzą z przeglądarki: tylko role user/assistant, bez własnego promptu systemowego
function cleanMessages(m) {
  if (!Array.isArray(m) || !m.length || m.length > 80) return null;
  for (const x of m) if (!x || (x.role !== "user" && x.role !== "assistant")) return null;
  return m;
}

app.http("agent", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "agent",
  handler: async (req, ctx) => {
    let user;
    try { user = await verify(req); } catch (e) { return json(401, { error: "Brak uprawnień" }); }
    if (!user) return json(401, { error: "Brak uprawnień" });
    if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "Brak klucza API Anthropic w ustawieniach aplikacji" });
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { error: "Rozmowa za długa, zacznij nową" });
    let body; try { body = JSON.parse(raw); } catch { return json(400, { error: "Błędne dane" }); }
    const messages = cleanMessages(body.messages);
    if (!messages) return json(400, { error: "Błędne wiadomości" });
    client = client || new Anthropic();
    try {
      const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
      const r = await client.messages.create({
        model: MODEL,
        max_tokens: 6000,
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: "Dzisiaj jest " + today + "." }],
        tools: TOOLS,
        messages,
      });
      ctx.log(`agent: ${r.stop_reason}, in ${r.usage.input_tokens} (cache ${r.usage.cache_read_input_tokens || 0}), out ${r.usage.output_tokens}`);
      return json(200, { content: r.content, stop_reason: r.stop_reason, usage: r.usage });
    } catch (e) {
      ctx.error("agent", e && e.status, e && e.message);
      const status = e && e.status === 429 ? 429 : 502;
      return json(status, { error: status === 429 ? "Model chwilowo przeciążony, spróbuj za chwilę" : "Błąd modelu: " + ((e && e.message) || "nieznany").slice(0, 200) });
    }
  },
});
