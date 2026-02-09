/*
  Cloudflare Worker: secure proxy for Gemini feedback (Adapted for METALS)
  
  What this Worker does:
  1) Receives learner responses from Captivate.
  2) Uses the GEMINI_API_KEY stored as a Cloudflare Secret.
  3) Calls Gemini 1.5 Flash to evaluate PM strategy.
  4) Returns structured JSON feedback.
*/

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = isAllowedOrigin(origin);

    // Preflight (browser permission check).
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin)
      });
    }

    // Only allow POST requests.
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Block disallowed origins.
    if (!allowedOrigin) {
      return new Response(JSON.stringify({ error: "Origin not allowed", origin }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse JSON body from the browser.
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

    // Simple guardrails.
    if (responseText.length < 10 || responseText.length > 2000) {
      return new Response(JSON.stringify({ error: "Response length out of range" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    // Verify Gemini Secret
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) }
      });
    }

    /*
      ============================
      SECTION STUDENTS MUST EDIT
      ============================
    */

    const systemPrompt = 
      "You are a Senior VP of Product at an EdTech firm. Your tone is professional, critical, and constructive. " +
      "You value data privacy (COPPA/GDPR compliance) and cost-efficiency in deployment strategies. " +
      "Return ONLY valid JSON (no markdown, no extra text).";

    const userPrompt = 
      `Learning objective:\n${learningObjective}\n\n` +
      `Evaluation criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\n` +
      `Learner response:\n${responseText}\n\n` +
      "Evaluate the learner's deployment strategy for 'BookBuddy'. " +
      "Your output MUST be ONLY JSON with exactly these keys:\n" +
      "- verdict (must be: Correct, Not quite right, or Incorrect)\n" +
      "- summary (1 to 3 sentences, referencing the learning objective or criteria)\n" +
      "- criteria_feedback (array of objects with: criterion, met, comment)\n" +
      "- next_step (one concrete improvement suggestion regarding cost or privacy)\n";

    /*
      ============================
      END STUDENT EDIT SECTION
      ============================
    */

    // Call Gemini API (Adapted from OpenAI template for Gemini 1.5 Flash)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    const geminiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    if (!geminiResp.ok) {
      const err = await geminiResp.text();
      return new Response(JSON.stringify({ error: "Gemini error", detail: err.slice(0, 300) }), {
        status: 502,
        headers: { "Content-Type": "application/json",
