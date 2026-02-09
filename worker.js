export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = isAllowedOrigin(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin)
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!allowedOrigin) {
      return new Response(JSON.stringify({ error: "Origin not allowed", origin }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    const responseText = String(body.response_text || "").trim();
    const learningObjective = String(body.learning_objective || "").trim();
    const criteria = Array.isArray(body.criteria) ? body.criteria : [];

    // 检查你的 Secret 名字是否匹配
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY in Cloudflare" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    /* ============================
       SECTION STUDENTS MUST EDIT
       ============================ */

    const systemPrompt = 
      "You are a Senior VP of Product. Evaluate the PM's strategy for BookBuddy. " +
      "Focus on data privacy (COPPA) and token costs. Return ONLY valid JSON.";

    const userPrompt = 
      `Learning objective: ${learningObjective}\n` +
      `Criteria: ${criteria.join(", ")}\n` +
      `Learner response: ${responseText}\n\n` +
      "Evaluate the response. Return JSON with keys: verdict (Correct, Not quite right, Incorrect), " +
      "summary (2-3 sentences), criteria_feedback (array), and next_step.";

    // 调用 Gemini API
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
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: "Gemini Error", detail: errText }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    const data = await resp.json();
    // 解析 Gemini 的返回结构
    const jsonText = data.candidates[0].content.parts[0].text;
    
    return new Response(jsonText, {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
    });
  }
};

function isAllowedOrigin(origin) {
  if (!origin) return null;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
  // 你的 GitHub Pages 域名
  if (origin === "https://kangt3530-rgb.github.io") return origin;
  return null;
}

function corsHeaders(origin) {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
