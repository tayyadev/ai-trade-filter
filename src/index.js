
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export default {
  async fetch(request, env) {

    console.log(
      "REQUEST",
      request.method,
      new URL(request.url).pathname
    );

    if (request.method === "OPTIONS") {
      return respond(null, 204);
    }

    if (request.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    if (env.AUTH_SECRET) {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token !== env.AUTH_SECRET) {
        return respond({ error: "Unauthorized" }, 401);
      }
    }

    const url = new URL(request.url);

    let body;

    try {
      body = await request.json();
    } catch {
      return respond({ error: "Invalid JSON body" }, 400);
    }

    // ---------- Embeddings endpoint ----------
    if (url.pathname === "/embeddings") {
      const model =
        "@cf/baai/bge-small-en-v1.5";

      try {

        const result = await env.AI.run(
          model,
          {
            text: [body.input]
          }
        );

        console.log("EMBED RESULT", JSON.stringify(result));

        return respond(
          {
            data: [
              {
                embedding: result.data[0]
              }
            ]
          },
          200
        );

      } catch (e) {

        console.log("EMBED ERROR", String(e));

        return respond({
          error: String(e)
        }, 500);

      }

    }

    const model = body.model || env.AI_MODEL || DEFAULT_MODEL;
    const system_prompt = body.system_prompt;
    const user_content = body.user_content;

    if (!system_prompt || !user_content) {
      return respond({ answer:"", grounded:false }, 200);
    }

    try {

      console.log("START CHAT", model);

      const aiResp = await env.AI.run(model, {
        messages: [
          { role: "system", content: system_prompt },
          { role: "user", content: user_content }
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 512
      });

      let raw = aiResp?.response ?? aiResp;

      if (typeof raw !== "object") {
        let text = String(raw).trim();
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
        if (text.startsWith("```")) {
          const p = text.split("```");
          text = (p[1] || text).replace(/^json/i,"").trim();
        }
        const s = text.indexOf("{");
        const e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) text = text.slice(s,e+1);
        raw = JSON.parse(text);
      }

      return respond({
        answer: raw.answer || "",
        grounded: !!raw.grounded,
        source_index: typeof raw.source_index === "number" ? raw.source_index : 0
      }, 200);

    } catch (e) {

      console.log("CHAT ERROR", String(e));

      return respond({
        answer: "I could not verify a grounded answer from the authorized documents.",
        grounded: false
      },200);
    }
  }
};

function respond(body,status){
  return new Response(body ? JSON.stringify(body):null,{
    status,
    headers:{
      "Content-Type":"application/json",
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"Authorization, Content-Type"
    }
  });
}
