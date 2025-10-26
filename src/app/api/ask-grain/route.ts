import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

type ClientMessage = {
  role: "assistant" | "user";
  text: string;
};

const SYSTEM_PROMPT = `
You are Grain, a Canada-first personal finance guide. You know the user's monthly budget, debts, and goals.
Keep replies short (3–6 sentences), actionable, and warm. Prioritise Canadian accounts (FHSA, TFSA, RRSP, RESP).
If the user is dealing with debt, emphasise high-interest payoff before aggressive investing.
Suggest next steps or clarification questions when useful. Format with short paragraphs or bullet lists when it improves clarity.
`;

export async function POST(req: NextRequest) {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return NextResponse.json(
        {
          error:
            "The AI coach is currently offline. Add an OPENAI_API_KEY environment variable to re-enable it.",
        },
        { status: 503 },
      );
    }

    const body = (await req.json()) as { messages?: ClientMessage[]; context?: string };
    const { messages = [], context } = body;

    const chatMessages = [
      {
        role: "system" as const,
        content: SYSTEM_PROMPT.trim() + (context ? `\n\nContext:\n${context.trim()}` : ""),
      },
      ...messages.map((message) => ({
        role: message.role,
        content: message.text,
      })),
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatMessages,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "Grain could not craft a reply. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Grain ran into an unexpected issue while talking to OpenAI.";

    console.error("ask-grain API error", error);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
