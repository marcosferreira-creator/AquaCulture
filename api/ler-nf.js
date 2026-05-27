
export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido" });

  const { base64, mediaType, fileName } = req.body || {};
  if (!base64 || !mediaType) return res.status(400).json({ error: "base64 e mediaType obrigatorios" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY nao configurada" });

  try {
    const isPDF = mediaType === "application/pdf" || String(fileName||"").toLowerCase().endsWith(".pdf");
    const fileBlock = isPDF
      ? { type:"document", source:{ type:"base64", media_type:"application/pdf", data:base64 } }
      : { type:"image",    source:{ type:"base64", media_type:mediaType, data:base64 } };

    const prompt = `Voce esta lendo uma nota fiscal brasileira de racao para piscicultura. Extraia os dados e responda SOMENTE em JSON puro, sem markdown. Se nao encontrar um campo use string vazia. {"supplier":"razao social do fornecedor","nfNumber":"numero da nota so digitos","date":"data YYYY-MM-DD","feedType":"tipo de racao","feedBrand":"marca ou fabricante","proteinPct":"% proteina bruta entre: 45%, 40%, 36%, 32%, 28%","bags":"sacos de 25kg como numero inteiro","totalValue":"valor total so o numero","costPerBag":"valor por saco 25kg","payMethod":"PIX, A vista, Boleto 30d, Boleto 60d, Cartao ou Transferencia","obs":"vencimento frete ou observacoes"}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        messages: [{ role:"user", content:[fileBlock,{type:"text",text:prompt}] }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(()=>"");
      return res.status(resp.status).json({ error:`Claude API ${resp.status}: ${t.slice(0,200)}` });
    }

    const data = await resp.json();
    const raw = data.content?.map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
    let extracted = {};
    try { extracted = JSON.parse(raw); }
    catch(e) { return res.status(422).json({ error:"Resposta invalida", raw }); }

    return res.status(200).json({ ok:true, data:extracted });
  } catch(err) {
    return res.status(500).json({ error: err.message||String(err) });
  }
}
