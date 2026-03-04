import { NextResponse } from "next/server";
import { config } from "@/config";

function truncateData(data: Record<string, unknown>): Record<string, string> {
  const truncated: Record<string, string> = {};

  for (const [scope, value] of Object.entries(data)) {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    truncated[scope] = raw.length > 500_000 ? raw.slice(0, 500_000) + "..." : raw;
  }

  return truncated;
}

export async function POST(request: Request) {
  try {
    const { connectorData } = (await request.json()) as {
      connectorData: Record<string, unknown>;
    };

    if (!connectorData || Object.keys(connectorData).length === 0) {
      return NextResponse.json(
        { error: "No connector data provided" },
        { status: 400 },
      );
    }

    const truncated = truncateData(connectorData);
    const dataSourcesList = Object.keys(connectorData);

    const systemPrompt = `You are a cognitive performance analyst specializing in sleep-cognition correlations. You analyze Oura ring sleep/readiness data alongside ChatGPT conversation history to find patterns in when a person does their best thinking.

You MUST respond with valid JSON matching this exact schema:
{
  "overallScore": <number 0-100, composite cognitive performance score>,
  "sleepImpactScore": <number 0-100, how much sleep quality affects thinking>,
  "thinkingQualityScore": <number 0-100, overall thinking quality from conversations>,
  "summary": "<2-3 sentences summarizing the key finding about their sleep-think patterns>",
  "correlations": [
    {
      "title": "<short title, 3-5 words, e.g. 'Deep Sleep & Creativity'>",
      "finding": "<one concise sentence about the pattern, e.g. 'More deep sleep correlates with longer, more creative conversations the next day'. NO specific dates or day references — focus on the general correlation.>",
      "impact": "high" | "medium" | "low",
      "direction": "positive" | "negative"
    }
  ],
  "weeklyPattern": [
    {
      "day": "Monday",
      "sleepQuality": <number 1-5>,
      "thinkingQuality": <number 1-5>,
      "readiness": <number 1-5>
    }
  ],
  "conversationBreakdown": [
    {
      "category": "<e.g. Technical, Creative, Strategic, Analytical, Casual>",
      "percentage": <number, all should sum to 100>,
      "quality": <number 1-5, average depth/quality>,
      "description": "<brief description of patterns in this category>"
    }
  ],
  "peakConditions": [
    {
      "condition": "<specific measurable condition, e.g. '7+ hours sleep + readiness > 85'>",
      "effect": "<what happens to thinking quality>",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "recommendations": [
    {
      "title": "<actionable title>",
      "detail": "<specific, personalized recommendation based on the data>",
      "priority": "high" | "medium" | "low"
    }
  ],
  "insights": [
    {
      "category": "<e.g. Sleep Pattern, Cognitive Rhythm, Recovery, Focus Window>",
      "detail": "<specific cross-data observation>"
    }
  ],
  "dataSourcesUsed": ${JSON.stringify(dataSourcesList)}
}

Important guidelines:
- Provide 3-5 correlations, focusing on the most interesting sleep-cognition links
- Include all 7 days (Monday through Sunday) in weeklyPattern, derived from actual data patterns. IMPORTANT: Use the FULL 1-5 range — compute averages per day-of-week from Oura scores (sleep score, readiness score) and map them: <65=1, 65-72=2, 73-79=3, 80-86=4, >=87=5. There MUST be meaningful variation between days — if data shows weekends differ from weekdays, reflect that clearly. Do NOT cluster all values around 3-4.
- Provide 4-6 conversation categories
- Provide 3-5 peak conditions with specific thresholds from the data
- Provide 3-5 actionable recommendations
- Provide 4-6 cross-data insights
- Be specific — reference actual numbers, patterns, and data points
- Frame everything through the lens of "when do you think best and why"`;

    const userPrompt = `Here is the user's data from connected sources:\n\n${Object.entries(
      truncated,
    )
      .map(([scope, data]) => `### ${scope}\n${data}`)
      .join("\n\n")}`;

    const llmRequestBody = {
      model: config.llm.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    };

    console.log(
      "[analyze] LLM request:",
      JSON.stringify(
        {
          url: config.llm.apiUrl,
          model: llmRequestBody.model,
          systemPromptLength: systemPrompt.length,
          userPromptLength: userPrompt.length,
          dataScopes: dataSourcesList,
          truncatedSizes: Object.fromEntries(
            Object.entries(truncated).map(([k, v]) => [k, v.length]),
          ),
        },
        null,
        2,
      ),
    );
    console.log(
      "[analyze] Full user prompt:\n",
      userPrompt.slice(0, 2000),
      userPrompt.length > 2000
        ? `\n... (${userPrompt.length} chars total)`
        : "",
    );

    const response = await fetch(config.llm.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify(llmRequestBody),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[analyze] LLM error:", err);
      return NextResponse.json(
        { error: "Analysis failed \u2014 LLM returned an error" },
        { status: 502 },
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    console.log("[analyze] LLM response tokens:", result.usage);

    if (!content) {
      return NextResponse.json(
        { error: "Empty response from LLM" },
        { status: 502 },
      );
    }

    const analysis = JSON.parse(content);
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { error: "Failed to analyze data" },
      { status: 500 },
    );
  }
}
