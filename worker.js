export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = isAllowedOrigin(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Secret GEMINI_API_KEY is missing in Cloudflare" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    try {
      const body = await request.json();
      const { response_text, learning_objective, criteria } = body;

      // Professional VP Persona and structured feedback rules
      const systemPrompt = "You are a Senior VP of Product at an EdTech firm. Evaluate the learner's PM strategy for 'BookBuddy'. Return ONLY valid JSON.";
      const userPrompt = `Learning objective: ${learning_objective}\nCriteria: ${criteria.join(", ")}\nLearner response: ${response_text}\n\nEvaluate and return JSON with these keys: verdict (Correct, Not quite right, or Incorrect), summary (2-3 sentences), criteria_feedback (array of objects with criterion, met, comment), and next_step.`;

      // Specific API URL for Google Gemini 1.5 Flash
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
        const errorDetail = await resp.text();
        return new Response(JSON.stringify({ error: "Gemini API Error", detail: errorDetail }), {
          status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
        });
      }

      const data = await resp.json();
      const jsonResponseText = data.candidates[0].content.parts[0].text;
      
      return new Response(jsonResponseText, {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Worker Crash", message: err.message }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }
  }
};

function isAllowedOrigin(origin) {
  // Allows both your GitHub Pages domain and local testing
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
