// api/render.js
//
// Vercel serverless function for Magppie Render Studio.
// Receives a PaletteCAD view plus the dropdown selections, assembles the
// render prompt, sends it to Higgsfield with the view as the structural
// reference, and returns the finished image URL.
//
// Credentials and the model endpoint are read from environment variables,
// so nothing sensitive ever reaches the browser.

import { createHiggsfieldClient } from "@higgsfield/client/v2";

export const config = { maxDuration: 60 };

// HIGGSFIELD_MODEL is the editing endpoint the render runs on. Confirmed in
// testing that Nano Banana Pro handles this edit well; set HIGGSFIELD_MODEL in
// Vercel to its exact Cloud API endpoint string from your Higgsfield catalogue.
const MODEL = process.env.HIGGSFIELD_MODEL || "flux-pro/kontext/max/image-to-image";

// ---- Silverstone finishes (used for both countertop and cabinet) ----
const STONES = {
  "bianco-lasa":   { name: "Bianco Lasa",    desc: "a warm ivory-white engineered stone crossed by soft, feather-fine diagonal striations in pale taupe-grey, delicate and linear, with a polished surface that catches light softly" },
  "statuario-gold":{ name: "Statuario Gold", desc: "a crisp bright-white marble-look stone with bold flowing grey veining from charcoal to soft silver, threaded with fine warm golden-ochre accent veins, polished and reflective" },
  "onyx-gold":     { name: "Onyx Gold",      desc: "a milky ivory translucent onyx with swirling agate-like rings and warm golden-amber veins, a luminous high-gloss surface where light appears to glow from within" },
  "taj":           { name: "Taj",            desc: "a warm sandy-beige quartzite-look stone with soft feathered, brushstroke-like movement in tonal beige and light taupe, in a satin-honed low sheen" },
  "cosmic":        { name: "Cosmic",         desc: "a soft sand-beige limestone-look stone with a finely mottled, lightly pitted surface, small natural inclusions and gentle cloudy variation, in a matte honed finish" },
  "trevi":         { name: "Trevi",          desc: "a soft, even light-grey stone with a smooth concrete-like surface, subtle vertical cloud movement and faint hairline veining, in a quiet matte finish" }
};

// ---- Glass options ----
const GLASS = {
  clear:   "clear glass, fully transparent with crisp clean edges",
  frosted: "frosted glass, softly opaque and evenly diffusing",
  fluted:  "vertical fluted glass with a soft ribbed texture, semi-translucent and gently diffusing the light behind it",
  bronze:  "bronze-tinted glass, smoky and warm, semi-transparent"
};

// ---- Lighting presets. "default" is the Magppie multi-level setup. ----
const LIGHTING = {
  default: "Integrated lighting, shown as real installed LED, warm and subtle and never theatrical: soft daylight from a ceiling sunroof above; under-counter LED beneath the countertop overhang; under-cabinet LED washing down onto the countertop and backsplash; a skirting LED at the plinth glowing softly onto the floor; and vertical LED strips inside the glass-fronted upper cabinets lighting the shelves. Render realistic soft shadows and gentle reflections on the stone surfaces."
};

// ---- Fixed profile (not user-selectable in the current layout) ----
const PROFILE = "slim brushed brass frames with a warm satin finish and soft highlights";

function buildPrompt({ stone, cabinet, glass, lighting }) {
  return [
    "Photorealistic architectural render of the exact kitchen shown in the reference image, looking like a real photograph of an installed luxury kitchen.",
    "Preserve the layout precisely: keep all cabinet and shutter positions, the island and appliance placement, window positions, and the camera angle exactly as shown. Do not move, add, or remove any cabinetry.",
    "",
    "Re-render the surfaces:",
    "- Countertop and backsplash: " + stone + ".",
    "- Cabinet shutters, clad in " + cabinet + ".",
    "- Upper glass shutters: " + glass + ", framed in " + PROFILE + ".",
    "",
    lighting,
    "",
    "Accurate to a real, buildable Magppie kitchen, with no exaggerated glow, no impossible reflections, and no fantasy elements. A wide 16:9 composition. No people, no text, no watermarks, no logos."
  ].join("\n");
}

function mimeToFormat(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/.exec(dataUrl || "");
  if (!m) return null;
  const t = m[1];
  if (t === "jpg" || t === "jpeg") return "jpeg";
  return t;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image, countertop, cabinet, glass, lighting } = req.body || {};

    const stone = STONES[countertop];
    if (!stone) return res.status(400).json({ error: "Pick a countertop finish before rendering." });
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Upload a PaletteCAD view before rendering." });
    }

    const format = mimeToFormat(image);
    if (!format) return res.status(400).json({ error: "The uploaded view must be a PNG or JPG image." });

    const apiKey = process.env.HIGGSFIELD_API_KEY;
    const apiSecret = process.env.HIGGSFIELD_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: "Higgsfield credentials are not configured on the server." });
    }

    const client = createHiggsfieldClient({
      credentials: apiKey + ":" + apiSecret,
      pollInterval: 2000,
      maxPollTime: 55000
    });

    const buffer = Buffer.from(image.split(",")[1], "base64");
    const inputUrl = await client.uploadImage(buffer, format);

    const cabinetStone = STONES[cabinet] || STONES["taj"];
    const prompt = buildPrompt({
      stone: stone.desc,
      cabinet: cabinetStone.desc,
      glass: GLASS[glass] || GLASS.fluted,
      lighting: LIGHTING[lighting] || LIGHTING.default
    });

    const jobSet = await client.subscribe(MODEL, {
      input: {
        prompt,
        aspect_ratio: "16:9",
        input_images: [{ type: "image_url", image_url: inputUrl }]
      },
      withPolling: true
    });

    if (jobSet.isNsfw) {
      return res.status(422).json({ error: "The render was flagged by moderation. Please try a different view." });
    }
    if (!jobSet.isCompleted) {
      return res.status(502).json({ error: "The render did not complete. Please try again." });
    }

    const url = jobSet.jobs?.[0]?.results?.raw?.url;
    if (!url) return res.status(502).json({ error: "The render finished but returned no image. Please try again." });

    return res.status(200).json({ url, finish: stone.name });
  } catch (err) {
    const name = err && err.name ? err.name + ": " : "";
    return res.status(500).json({ error: name + (err && err.message ? err.message : "Unexpected render error.") });
  }
}
