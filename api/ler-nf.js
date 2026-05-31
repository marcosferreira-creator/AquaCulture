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
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: mediaType, data: base64 } };

    const prompt = `Voce esta lendo uma nota fiscal brasileira de racao para piscicultura.

REGRA PRINCIPAL: Se a nota tiver MAIS DE UM produto/item de racao diferente, retorne um array com CADA item separado. Nao agrupe itens diferentes em um so.

Analise cada linha da tabela DADOS DO PRODUTO/SERVICOS e crie um objeto separado para cada linha de produto diferente.

Responda SOMENTE com JSON puro, sem markdown, sem texto adicional.

Se houver UM produto: retorne um objeto simples.
Se houver MULTIPLOS produtos: retorne um array de objetos.

Campos de cada objeto:
{
  "supplier": "razao social do fornecedor",
  "nfNumber": "numero da NF so digitos",
  "date": "data de emissao YYYY-MM-DD",
  "feedType": "tipo EXATO da racao incluindo granulometria. Ex: Extrusada 28% 08-10mm, Extrusada 36% 02-05mm",
  "feedBrand": "marca comercial. Ex: Multi-Peixe, Guabi Nautilus",
  "proteinPct": "% proteina bruta escolha entre 45% 40% 36% 32% 28%",
  "bags": "quantidade de sacos de 25kg deste item como numero inteiro",
  "totalValue": "valor total SO DESTE ITEM em reais sem R$",
  "costPerBag": "valor unitario por saco deste item",
  "payMethod": "PIX A vista Boleto 30d Boleto 60d Cartao Transferencia",
  "obs": "vencimento frete desconto ou observacoes"
}

Exemplo com 2 produtos:
[
  {"supplier":"Risadinha LTDA","nfNumber":"655498","date":"2026-05-23","feedType":"Extrusada 28% 08-10mm","feedBrand":"Multi-Peixe","proteinPct":"28%","bags":8,"totalValue":"613.36","costPerBag":"76.67","payMethod":"A vista","obs":""},
  {"supplier":"Risadinha LTDA","nfNumber":"655498","date":"2026-05-23","feedType":"Extrusada 28% 04-06mm","feedBrand":"Multi-Peixe","proteinPct":"28%","bags":12,"totalValue":"920.04","costPerBag":"76.67","payMethod":"A vista","obs":""},
  {"supplier":"Risadinha LTDA","nfNumber":"655498","date":"2026-05-23","feedType":"Extrusada 36% 02-05mm","feedBrand":"Multi-Peixe","proteinPct":"36%","bags":1,"totalValue":"121.49","costPerBag":"121.49","payMethod":"A vista","obs":"Deposito em conta a vista. Vencimento 23/05/26"}
]`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: prompt }] }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return res.status(resp.status).json({ error: `Claude API ${resp.status}: ${t.slice(0,200)}` });
    }

    const data = await resp.json();
    const raw  = data.content?.map(c => c.text || "").join("").replace(/```json|```/g, "").trim();

    let extracted = {};
    try {
      extracted = JSON.parse(raw);
      // If array returned, wrap as { items: [...] }
      if (Array.isArray(extracted)) {
        extracted = { items: extracted, isMultiple: true };
      }
    } catch(e) {
      return res.status(422).json({ error: "Resposta invalida da IA", raw });
    }

    return res.status(200).json({ ok: true, data: extracted });
  } catch(err) {
    console.error("ler-nf error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
