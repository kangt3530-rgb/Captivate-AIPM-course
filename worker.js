export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = isAllowedOrigin(origin);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    // Verify your Cloudflare Secret
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Cloudflare Secret GEMINI_API_KEY is missing." }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    try {
      const body = await request.json();
      const { response_text, learning_objective, criteria } = body;

      // Define the VP persona and evaluation rules
      const systemPrompt = "You are a Senior VP of Product. Evaluate the PM's strategy for 'BookBuddy'. Return ONLY valid JSON.";
      const userPrompt = `Learning objective: ${learning_objective}\nEvaluation criteria: ${criteria.join(", ")}\nLearner response: ${response_text}\n\nTask: Evaluate the response and return JSON with keys: verdict (must be 'Correct', 'Not quite right', or 'Incorrect'), summary (2-3 sentences), criteria_feedback (array of objects with 'criterion', 'met', and 'comment'), and next_step.`;

      // Call Google Gemini 1.5 Flash
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

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
        return new Response(JSON.stringify({ error: "Gemini API Refused Request", detail: errorText }), {
          status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
        });
      }

      const data = await resp.json();
      const jsonResponse = data.candidates[0].content.parts[0].text;
      
      return new Response(jsonResponse, {
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
  // Allow your GitHub domain and local testing
  if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || origin === "https://kangt3530-rgb.github.io") return origin;
  return null;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
