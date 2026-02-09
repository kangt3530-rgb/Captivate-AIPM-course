export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = isAllowedOrigin(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    // 安全检查：确认你的 Secret 名字是否匹配
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Cloudflare Secret 'GEMINI_API_KEY' is missing!" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    try {
      const body = await request.json();
      const { response_text, learning_objective, criteria } = body;

      const systemPrompt = "You are a Senior VP of Product. Evaluate the PM's strategy for BookBuddy. Return ONLY valid JSON.";
      const userPrompt = `Learning objective: ${learning_objective}\nCriteria: ${criteria.join(", ")}\nLearner response: ${response_text}\n\nEvaluate and return JSON with: verdict (Correct, Not quite right, Incorrect), summary, criteria_feedback (array), and next_step.`;

      // 调用 Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

      const resp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { response_mime_type: "application/json" },
          // 加入安全设置，防止教育类评估被误拦截
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
          ]
        })
      });

      if (!resp.ok) {
        const errorDetail = await resp.text();
        return new Response(JSON.stringify({ error: "Gemini API Refused Request", detail: errorDetail }), {
          status: 502, // 这里的 502 会传回你的 Captivate
          headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
        });
      }

      const data = await resp.json();
      const jsonText = data.candidates[0].content.parts[0].text;
      
      return new Response(jsonText, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Worker Internal Error", message: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }
  }
};

function isAllowedOrigin(origin) {
  // 允许本地测试和你的 GitHub 域名
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
