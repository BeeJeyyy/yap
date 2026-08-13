import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// GROQ

const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

// OPENROUTER

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// REDIS

const redis = Redis.fromEnv();

// RATE LIMIT

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "ratelimit:questions",
});

// TYPES

interface RequestBody {
  topic: string;
}

interface ResponseData {
  questions: string[];
}

type Provider = "groq" | "gemini" | "openrouter";

interface TopicAIConfig {
  primary: Provider;
  fallback: Provider[];
  openrouterModel: string;
}

// SETTINGS

const QUESTIONS_PER_DAY = 25;

// Token budgets
const GROQ_MAX_TOKENS = 3000;
const GEMINI_MAX_TOKENS = 3000;
const OPENROUTER_MAX_TOKENS = 3000;

// Models
const GROQ_MODEL = "llama-3.3-70b-versatile";

const GEMINI_MODEL = "gemini-3.5-flash";

// TOPIC AI CONFIGURATION

const TOPIC_AI_MAP: Record<string, TopicAIConfig> = {
  comfort: {
    primary: "groq",
    fallback: ["gemini", "openrouter"],
    openrouterModel: "anthropic/claude-haiku-4.5",
  },

  icebreakers: {
    primary: "gemini",
    fallback: ["groq", "openrouter"],
    openrouterModel: "openai/gpt-4o-mini",
  },

  deeptalk: {
    primary: "openrouter",
    fallback: ["groq", "gemini"],
    openrouterModel: "openai/gpt-4o-mini",
  },

  couples: {
    primary: "gemini",
    fallback: ["groq", "openrouter"],
    openrouterModel: "anthropic/claude-haiku-4.5",
  },

  family: {
    primary: "openrouter",
    fallback: ["gemini", "groq"],
    openrouterModel: "openai/gpt-4o-mini",
  },

  friends: {
    primary: "groq",
    fallback: ["openrouter", "gemini"],
    openrouterModel: "openai/gpt-4o-mini",
  },

  self: {
    primary: "gemini",
    fallback: ["groq", "openrouter"],
    openrouterModel: "openai/gpt-4o-mini",
  },

  funny: {
    primary: "openrouter",
    fallback: ["groq", "gemini"],
    openrouterModel: "openai/gpt-4o-mini",
  },

  career: {
    primary: "gemini",
    fallback: ["openrouter", "groq"],
    openrouterModel: "openai/gpt-4o-mini",
  },

  nostalgia: {
    primary: "groq",
    fallback: ["gemini", "openrouter"],
    openrouterModel: "anthropic/claude-haiku-4.5",
  },
};

const VALID_TOPICS = Object.keys(TOPIC_AI_MAP);

// VALIDATE TOPIC

function isValidTopic(topic: unknown): topic is string {
  return typeof topic === "string" && VALID_TOPICS.includes(topic);
}

// CACHE KEY

function getCacheKey(topic: string): string {
  const today = new Date().toISOString().split("T")[0];

  return `questions:${topic}:${today}`;
}

// SYSTEM PROMPT

const SYSTEM_PROMPT = `
You are generating conversation card questions for an app called Yap.

Your questions must be:

- warm
- thoughtful
- reflective
- emotionally safe
- natural
- relatable
- realistic
- useful for real-world conversations
- not generic
- not childish
- not repetitive

Match every question strongly to the requested topic.

Questions should feel like something real people would actually ask
each other during a conversation.

Mix different types when appropriate:

- light
- meaningful
- reflective
- situational
- personal
- deeper questions

Avoid:

- generic motivational questions
- therapy-like language
- overly dramatic questions
- questions that sound like school assignments
- repeated ideas
- simple rewording of the same question

Every question must be meaningfully different.

Keep each question concise,
preferably under 20 words.

Return ONLY valid JSON.

Do NOT use markdown.
Do NOT use code fences.
Do NOT add explanations.
Do NOT add commentary.

Required JSON format:

{
    "questions": [
        "question 1",
        "question 2"
    ]
}
`;

// USER PROMPT

function getUserPrompt(topic: string): string {
  return `
Generate up to ${QUESTIONS_PER_DAY} unique conversation questions
on the topic: ${topic}.

Prioritize quality, realism, variety, and natural conversation.

Do NOT sacrifice question quality just to reach the number.

If you cannot fit all ${QUESTIONS_PER_DAY} questions naturally,
return as many high-quality unique questions as possible.

Keep every question concise.
`;
}

// PARSE AI RESPONSE

function parseQuestions(content: string): string[] {
  let parsed: ResponseData;

  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No valid JSON found in model output.");
    }

    parsed = JSON.parse(jsonMatch[0]);
  }

  if (!Array.isArray(parsed.questions)) {
    throw new Error("Model did not return a valid questions array.");
  }

  const seen = new Set<string>();

  const questions = parsed.questions
    .filter(
      (question): question is string =>
        typeof question === "string" && question.trim().length > 0,
    )
    .map((question) => question.trim())
    .filter((question) => {
      const normalized = question
        .toLowerCase()
        .replace(/[?.!,]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);

      return true;
    });

  if (questions.length === 0) {
    throw new Error("Model returned zero valid questions.");
  }

  return questions.slice(0, QUESTIONS_PER_DAY);
}

// GROQ

async function generateWithGroq(topic: string): Promise<string[]> {
  console.log(`[AI] Trying Groq (${GROQ_MODEL}) for "${topic}"`);

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,

    max_tokens: GROQ_MAX_TOKENS,

    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: getUserPrompt(topic),
      },
    ],

    response_format: {
      type: "json_object",
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned no content.");
  }

  return parseQuestions(content);
}

// GEMINI

async function generateWithGemini(topic: string): Promise<string[]> {
  console.log(`[AI] Trying Gemini (${GEMINI_MODEL}) for "${topic}"`);

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        "x-goog-api-key": apiKey,
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_PROMPT,
            },
          ],
        },

        contents: [
          {
            role: "user",

            parts: [
              {
                text: getUserPrompt(topic),
              },
            ],
          },
        ],

        generationConfig: {
          maxOutputTokens: GEMINI_MAX_TOKENS,

          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error("Gemini returned no content.");
  }

  return parseQuestions(content);
}

// OPENROUTER

async function generateWithOpenRouter(
  topic: string,
  model: string,
): Promise<string[]> {
  console.log(`[AI] Trying OpenRouter (${model}) for "${topic}"`);

  const completion = await openrouter.chat.completions.create({
    model,

    max_tokens: OPENROUTER_MAX_TOKENS,

    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: getUserPrompt(topic),
      },
    ],

    response_format: {
      type: "json_object",
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter returned no content.");
  }

  return parseQuestions(content);
}

// COMPLETE MISSING QUESTIONS

async function completeQuestionsWithGroq(
  topic: string,
  existingQuestions: string[],
): Promise<string[]> {
  const missing = QUESTIONS_PER_DAY - existingQuestions.length;

  if (missing <= 0) {
    return existingQuestions.slice(0, QUESTIONS_PER_DAY);
  }

  console.log(`[AI] Completing ${missing} missing questions for "${topic}"`);

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,

    max_tokens: 1200,

    messages: [
      {
        role: "system",

        content: `
You are completing a conversation card deck for Yap.

Generate ONLY missing questions.

Rules:

- natural
- realistic
- thoughtful
- conversational
- emotionally safe
- strongly related to the topic
- meaningfully different
- do not repeat existing questions
- do not create simple rewordings
- preferably under 20 words

Return ONLY JSON:

{
    "questions": ["question 1"]
}
`,
      },

      {
        role: "user",

        content: `
Topic: ${topic}

Existing questions:

${existingQuestions.map((q, index) => `${index + 1}. ${q}`).join("\n")}

Generate exactly ${missing} NEW questions.

Do not repeat or closely rephrase
any existing question.
`,
      },
    ],

    response_format: {
      type: "json_object",
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned no content while completing questions.");
  }

  const additional = parseQuestions(content);

  const combined = [...existingQuestions, ...additional];

  if (combined.length < QUESTIONS_PER_DAY) {
    throw new Error(
      `Could only generate ${combined.length}/${QUESTIONS_PER_DAY} questions.`,
    );
  }

  return combined.slice(0, QUESTIONS_PER_DAY);
}

// GENERATE QUESTIONS

async function generateQuestions(topic: string): Promise<string[]> {
  const config = TOPIC_AI_MAP[topic];

  if (!config) {
    throw new Error(`No AI configuration found for topic: ${topic}`);
  }

  const providers: Provider[] = [config.primary, ...config.fallback];

  let lastQuestions: string[] | null = null;

  for (const provider of providers) {
    try {
      console.log(`[AI] Trying ${provider.toUpperCase()} for "${topic}"`);

      let questions: string[];

      switch (provider) {
        case "groq":
          questions = await generateWithGroq(topic);

          break;

        case "gemini":
          questions = await generateWithGemini(topic);

          break;

        case "openrouter":
          questions = await generateWithOpenRouter(
            topic,
            config.openrouterModel,
          );

          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      console.log(
        `[AI] ✅ ${provider.toUpperCase()} generated ${questions.length} questions`,
      );

      if (questions.length >= QUESTIONS_PER_DAY) {
        return questions.slice(0, QUESTIONS_PER_DAY);
      }

      lastQuestions = questions;

      console.log(
        `[AI] ⚠️ ${provider.toUpperCase()} returned ${questions.length}/${QUESTIONS_PER_DAY}`,
      );

      try {
        const completed = await completeQuestionsWithGroq(topic, questions);

        if (completed.length >= QUESTIONS_PER_DAY) {
          console.log(`[AI] ✅ Completed ${completed.length} questions`);

          return completed;
        }
      } catch (completionError) {
        console.error(
          `[AI] ❌ Could not complete missing questions:`,
          completionError,
        );
      }

      console.log(`[AI] ⚠️ Moving to next provider for "${topic}"`);
    } catch (error) {
      console.error(
        `[AI] ❌ ${provider.toUpperCase()} failed for "${topic}":`,
        error,
      );
    }
  }

  if (lastQuestions && lastQuestions.length >= QUESTIONS_PER_DAY) {
    return lastQuestions.slice(0, QUESTIONS_PER_DAY);
  }

  throw new Error(`All AI providers failed for topic "${topic}".`);
}

// REDIS LOCK

async function generateQuestionsWithLock(topic: string): Promise<string[]> {
  const cacheKey = getCacheKey(topic);

  const lockKey = `lock:${cacheKey}`;

  const gotLock = await redis.set(lockKey, "1", {
    nx: true,
    ex: 120,
  });

  // ANOTHER REQUEST IS GENERATING

  if (!gotLock) {
    console.log(`[REDIS] Waiting for another request: ${topic}`);

    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const cached = await redis.get<string[]>(cacheKey);

      if (cached && cached.length >= QUESTIONS_PER_DAY) {
        console.log(`[REDIS] ✅ Received cached questions for "${topic}"`);

        return cached.slice(0, QUESTIONS_PER_DAY);
      }
    }

    throw new Error("Question generation timed out. Please try again.");
  }

  try {
    // DOUBLE CHECK CACHE

    const cached = await redis.get<string[]>(cacheKey);

    if (cached && cached.length >= QUESTIONS_PER_DAY) {
      console.log(`[REDIS] ✅ Cache found after lock: ${topic}`);

      return cached.slice(0, QUESTIONS_PER_DAY);
    }

    // GENERATE

    const questions = await generateQuestions(topic);

    // SAVE CACHE

    await redis.set(cacheKey, questions, {
      ex: 60 * 60 * 25,
    });

    console.log(
      `[REDIS] 💾 Saved ${questions.length} questions for "${topic}"`,
    );

    return questions;
  } finally {
    await redis.del(lockKey);

    console.log(`[REDIS] 🔓 Released lock for "${topic}"`);
  }
}

// POST /api/questions

export async function POST(req: NextRequest) {
  try {
    // REQUEST BODY

    const body: RequestBody = await req.json();

    const { topic } = body;

    // VALIDATE TOPIC

    if (!isValidTopic(topic)) {
      return NextResponse.json(
        {
          error: "Invalid topic",
        },
        {
          status: 400,
        },
      );
    }

    // CACHE

    const cacheKey = getCacheKey(topic);

    console.log(`[REDIS] Checking cache: ${cacheKey}`);

    const cached = await redis.get<string[]>(cacheKey);

    if (cached && cached.length >= QUESTIONS_PER_DAY) {
      console.log(`[REDIS] ✅ CACHE HIT: ${topic}`);

      return NextResponse.json({
        questions: cached.slice(0, QUESTIONS_PER_DAY),
      });
    }

    console.log(`[REDIS] ❌ CACHE MISS: ${topic}`);

    // RATE LIMIT

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    const { success } = await ratelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
        },
        {
          status: 429,
        },
      );
    }

    // GENERATE

    const questions = await generateQuestionsWithLock(topic);

    return NextResponse.json({
      questions,
    });
  } catch (error) {
    console.error("[API] Error in /api/questions:", error);

    return NextResponse.json(
      {
        error: "Couldn't load questions. Please try again.",
      },
      {
        status: 500,
      },
    );
  }
}
