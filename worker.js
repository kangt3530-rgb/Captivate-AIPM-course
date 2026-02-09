export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = isAllowedOrigin(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY in Cloudflare." }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    try {
      const body = await request.json();
      const { response_text, learning_objective, criteria } = body;

      const systemPrompt = "You are a Senior VP of Product. Evaluate the PM's strategy for 'BookBuddy'. Return ONLY valid JSON.";
      const userPrompt = `Objective: ${learning_objective}\nCriteria: ${criteria.join(", ")}\nResponse: ${response_text}\n\nReturn JSON: verdict (Correct, Not quite right, Incorrect), summary, criteria_feedback (array), and next_step.`;

      // FIXED: Using the stable v1 endpoint to match the model
      const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

      const resp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        return new Response(JSON.stringify({ error: "Gemini API Error", detail: errorText }), {
          status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
        });
      }

      const data = await resp.json();
      const jsonText = data.candidates[0].content.parts[0].text;
      
      return new Response(jsonText, {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Worker Internal Error", message: err.message }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }
  }
};

function isAllowedOrigin(origin) {
  if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) return origin;
  // Your GitHub domain
  if (origin === "https://kangt3530-rgb.github.io") return origin;
  return null;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
