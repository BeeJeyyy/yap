import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function GET(req: NextRequest) {
  const results: any = {};

  // Test Groq
  try {
    console.log("[TEST] Testing Groq...");
    const groq = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    });

    const groqResponse = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768",
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 100,
    });

    results.groq = {
      status: "WORKING",
      message: groqResponse.choices[0]?.message?.content?.substring(0, 50),
    };
    console.log("[TEST] Groq: OK");
  } catch (error) {
    results.groq = {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
    console.error("[TEST] Groq failed:", results.groq.error);
  }

  // Test Gemini
  try {
    console.log("[TEST] Testing Gemini...");
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not set");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "Say hello" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 100,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    results.gemini = {
      status: "WORKING",
      message: data?.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 50),
    };
    console.log("[TEST] Gemini: OK");
  } catch (error) {
    results.gemini = {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
    console.error("[TEST] Gemini failed:", results.gemini.error);
  }

  // Test OpenRouter
  try {
    console.log("[TEST] Testing OpenRouter...");
    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    const orResponse = await openrouter.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 100,
    });

    results.openrouter = {
      status: "WORKING",
      message: orResponse.choices[0]?.message?.content?.substring(0, 50),
    };
    console.log("[TEST] OpenRouter: OK");
  } catch (error) {
    results.openrouter = {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
    console.error("[TEST] OpenRouter failed:", results.openrouter.error);
  }

  // Check env vars
  results.env = {
    GROQ_API_KEY: process.env.GROQ_API_KEY ? "SET" : "MISSING",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "SET" : "MISSING",
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? "SET" : "MISSING",
    KV_REST_API_URL: process.env.KV_REST_API_URL ? "SET" : "MISSING",
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? "SET" : "MISSING",
  };

  return NextResponse.json(results, { status: 200 });
}