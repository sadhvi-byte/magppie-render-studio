import OpenAI from "openai";

export const config = { maxDuration: 30 };

const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o";

const MAGPPIE_CONTEXT = `You are an AI sales assistant for Magppie, a premium luxury kitchen brand in India.

Key product lines:
- Silverstone Surfaces: engineered stone countertops and cabinet finishes (Bianco Lasa, Statuario Gold, Onyx Gold, Taj, Cosmic, Trevi)
- Modular Kitchen Systems: fully customizable Italian-style modular kitchens
- Glass Options: Clear, Frosted, Fluted, Bronze-tinted glass for upper cabinets
- Hardware: Brushed brass frames, satin-finish handles, premium fittings
- Render Studio: AI-powered photorealistic kitchen visualization tool

Magppie differentiators:
- Premium engineered stone that rivals natural marble at better durability
- Book-matched slab installations for seamless veining
- Integrated warm LED lighting systems (under-cabinet, in-cabinet, plinth, skirting)
- Italian design aesthetic with Indian market understanding
- AI-powered Render Studio for instant photorealistic kitchen previews
- End-to-end design, manufacture, and installation

Price positioning: Premium segment, competing with imported Italian kitchens but with local manufacturing advantages.

Target customers: High-net-worth individuals building or renovating luxury homes, interior designers, architects, real estate developers for premium projects.`;

function buildScriptPrompt(lead, action) {
  const base = `${MAGPPIE_CONTEXT}

Lead information:
- Name: ${lead.name || "Unknown"}
- Company/Role: ${lead.company || "Not specified"}
- Phone: ${lead.phone || "Not provided"}
- Email: ${lead.email || "Not provided"}
- Source: ${lead.source || "Unknown"}
- Interest: ${lead.interest || "General inquiry"}
- Budget Range: ${lead.budget || "Not discussed"}
- Timeline: ${lead.timeline || "Not specified"}
- Status: ${lead.status || "new"}
- Previous Notes: ${lead.notes || "None"}
- Call History: ${lead.callHistory || "No previous calls"}`;

  if (action === "cold-call") {
    return `${base}

Generate a natural, warm cold-call script for this lead. Structure it as:

1. OPENING (warm greeting, introduce yourself and Magppie, reason for calling)
2. DISCOVERY (3-4 questions to understand their kitchen needs, timeline, and preferences)
3. VALUE PITCH (2-3 key Magppie differentiators relevant to their profile)
4. RENDER STUDIO HOOK (mention our AI visualization tool as a no-commitment next step)
5. OBJECTION HANDLING (3 common objections with smooth responses)
6. CLOSE (propose a specific next step - studio visit, virtual consultation, or render demo)

Keep the tone conversational, not salesy. Use the lead's name naturally. Be culturally appropriate for the Indian luxury market.`;
  }

  if (action === "follow-up") {
    return `${base}

Generate a follow-up call script based on their history. Structure it as:

1. RE-ENGAGEMENT (warm reconnection referencing previous interaction)
2. PROGRESS CHECK (ask about their project timeline and any changes)
3. NEW VALUE (share something new - a finish they haven't seen, a recent project, or the Render Studio)
4. ADVANCE (move them to the next stage in the pipeline)
5. CLOSE (specific next step with a date/time suggestion)

Be warm and personal, reference their previous interactions naturally.`;
  }

  if (action === "objection-handling") {
    return `${base}

Generate responses to the 6 most likely objections this lead might raise, based on their profile. For each objection:

1. The likely objection
2. Acknowledge & empathize (1 sentence)
3. Reframe (1-2 sentences)
4. Evidence/proof point (1 sentence)
5. Redirect to next step (1 sentence)

Common objections in luxury kitchens: price, timeline, quality vs imported brands, design flexibility, durability, installation disruption.`;
  }

  if (action === "email-draft") {
    return `${base}

Draft a personalized sales email for this lead. Include:
- Subject line (compelling, not clickbait)
- Warm greeting using their name
- 2-3 sentences connecting to their specific needs/interest
- One compelling Magppie differentiator
- Clear CTA (studio visit, call, or Render Studio demo link)
- Professional sign-off

Keep it under 150 words. Luxury tone, not pushy.`;
  }

  if (action === "whatsapp") {
    return `${base}

Draft a WhatsApp message for this lead. Requirements:
- Under 80 words
- Warm and personal tone
- Reference their specific interest if known
- Include one hook (new finish, project gallery, or Render Studio)
- End with a soft question, not a hard CTA
- Appropriate for Indian business communication style`;
  }

  return `${base}

Generate a comprehensive sales brief for this lead including:
1. Lead score (1-10) with reasoning
2. Recommended approach strategy
3. Key talking points (3-4 bullets)
4. Potential objections to prepare for
5. Suggested next steps
6. Best time/channel to reach out`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { lead, action } = req.body || {};

    if (!lead || !lead.name) {
      return res.status(400).json({ error: "Lead name is required." });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    }

    const client = new OpenAI({ apiKey });
    const prompt = buildScriptPrompt(lead, action || "brief");

    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: "You are a luxury kitchen sales expert. Respond in well-formatted markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const script = completion.choices?.[0]?.message?.content?.trim();
    if (!script) {
      return res.status(502).json({ error: "AI did not generate a response. Try again." });
    }

    return res.status(200).json({ script, action: action || "brief" });
  } catch (err) {
    const name = err?.name ? err.name + ": " : "";
    return res.status(500).json({ error: name + (err?.message || "Unexpected error.") });
  }
}
