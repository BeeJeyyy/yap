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

// Defines what makes a topic's questions distinct from every other deck.
// This is the piece that was missing before: without it, every topic used
// the same generic tone instructions and questions started blending together
// across decks (e.g. "self" sounding like "deeptalk", "comfort" sounding like "family").
interface TopicProfile {
  label: string;
  description: string; // what this deck is actually about
  tone: string; // how it should feel to read
  avoid: string[]; // topics/styles it must NOT drift into
  examples: string[]; // 2-3 short style-reference questions (not to be reused verbatim)
}

// SETTINGS

const QUESTIONS_PER_DAY = 25;

// Token budgets
const GROQ_MAX_TOKENS = 3000;
const GEMINI_MAX_TOKENS = 3000;
const OPENROUTER_MAX_TOKENS = 3000;

// Slightly high temperature so tone/phrasing actually varies between decks
// instead of every provider converging on the same "safe" reflective register.
const GENERATION_TEMPERATURE = 0.95;

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

// TOPIC PROFILES
// This is what actually makes each deck sound like itself instead of a
// reshuffled version of the neighboring deck.

const TOPIC_PROFILES: Record<string, TopicProfile> = {
  comfort: {
    label: "Comfort",
    description:
      "Gentle, soothing questions for someone who wants a calm, low-pressure conversation. About feeling safe, cared for, and understood in the moment.",
    tone: "Soft, warm, slow-paced. Feels like a quiet check-in, not an interview.",
    avoid: [
      "deep existential or identity questions (that's deeptalk)",
      "childhood/nostalgia-specific prompts (that's nostalgia)",
      "advice-seeking or problem-solving framing",
    ],
    examples: [
      "What's something small that instantly makes you feel better?",
      "What does feeling 'safe' with someone actually look like to you?",
    ],
  },

  icebreakers: {
    label: "Icebreakers",
    description:
      "Light, easy, low-stakes questions for people who don't know each other well yet, or are just starting to talk. Meant to get a conversation moving fast.",
    tone: "Casual, quick, easy to answer in one sentence. No vulnerability required.",
    avoid: [
      "emotionally heavy or personal-history questions",
      "anything requiring a long or deep answer",
      "couple- or family-specific framing",
    ],
    examples: [
      "Would you rather explore space or the deep ocean?",
      "What's a food you'll never get tired of?",
    ],
  },

  deeptalk: {
    label: "Deep Talk",
    description:
      "Existential, philosophical, identity, and meaning-of-life questions. For people ready to go beneath the surface.",
    tone: "Reflective, unhurried, genuinely thought-provoking — but never clinical or therapy-scripted.",
    avoid: [
      "light icebreaker-style trivia",
      "purely nostalgic 'remember when' framing (that's nostalgia)",
      "romantic-relationship-specific questions (that's couples)",
    ],
    examples: [
      "What belief have you changed your mind about in the last few years?",
      "What would you want people to understand about you that they usually miss?",
    ],
  },

  couples: {
    label: "Couples",
    description:
      "Questions specifically for romantic partners — about the relationship itself, intimacy, shared future, and how they experience each other.",
    tone: "Warm and intimate, sometimes playful, sometimes vulnerable — always about 'us', not just 'me'.",
    avoid: [
      "generic self-reflection questions with no relationship angle",
      "family-dynamics framing (that's family)",
      "platonic-friendship framing (that's friends)",
    ],
    examples: [
      "What's a small thing I do that makes you feel loved?",
      "What does our relationship give you that you didn't expect?",
    ],
  },

  family: {
    label: "Family",
    description:
      "Questions about family relationships, upbringing, family dynamics, and connecting across generations.",
    tone: "Warm, respectful, sometimes nostalgic, but centered on family roles and bonds specifically.",
    avoid: [
      "romantic/couples framing",
      "pure childhood-memory nostalgia with no family angle (that's nostalgia)",
      "career or self-identity questions unrelated to family",
    ],
    examples: [
      "What's a family tradition you want to keep going?",
      "What's something you appreciate about how you were raised?",
    ],
  },

  friends: {
    label: "Friends",
    description:
      "Questions about friendship — trust, shared memories, what makes the friendship work, and getting to know a friend better.",
    tone: "Casual but genuine, warmer than icebreakers, lighter than deeptalk.",
    avoid: [
      "romantic or couples framing",
      "family-specific framing",
      "overly heavy existential questions",
    ],
    examples: [
      "What's something you've never told me but probably should?",
      "What makes a friendship last, in your experience?",
    ],
  },

  self: {
    label: "Self",
    description:
      "Introspective questions about personal growth, values, self-awareness, and who the person is becoming. Answered alone or shared with others.",
    tone: "Reflective and personal, focused inward on identity and growth — not on relationships with others.",
    avoid: [
      "questions framed around another specific person (partner, friend, family)",
      "philosophical/universal questions with no personal angle (that's deeptalk)",
      "career-specific framing (that's career)",
    ],
    examples: [
      "What's a habit you're proud of building?",
      "What does 'success' mean to you today, versus five years ago?",
    ],
  },

  funny: {
    label: "Funny",
    description:
      "Playful, silly, absurd, or humorous questions meant to make people laugh. Low stakes, high entertainment.",
    tone: "Light, witty, playful, sometimes absurd. NOT reflective, emotional, or sincere.",
    avoid: [
      "any emotionally deep or vulnerable question",
      "sincere relationship or self-reflection questions",
      "questions that could be mistaken for deeptalk or comfort",
    ],
    examples: [
      "What's the weirdest food combo you secretly love?",
      "If you had to be banned from one everyday object, what would it be?",
    ],
  },

  career: {
    label: "Career",
    description:
      "Questions about work, ambition, career path, professional growth, and work-life identity.",
    tone: "Thoughtful and grounded, focused specifically on work and professional life.",
    avoid: [
      "general self-growth questions with no career angle (that's self)",
      "family or relationship framing",
      "purely nostalgic framing",
    ],
    examples: [
      "What's a skill you're proud you developed?",
      "What would your ideal workday actually look like?",
    ],
  },

  nostalgia: {
    label: "Nostalgia",
    description:
      "Questions about the past — childhood, growing up, past eras, old memories, and how things used to be.",
    tone: "Warm, wistful, memory-focused. Always anchored in 'back then' or 'when you were younger'.",
    avoid: [
      "present-day self-reflection with no memory angle (that's self)",
      "family-relationship-dynamics questions with no memory angle (that's family)",
      "future-oriented questions",
    ],
    examples: [
      "What's a toy or game you were obsessed with as a kid?",
      "What's something from your childhood you didn't appreciate until later?",
    ],
  },
};

const VALID_TOPICS = Object.keys(TOPIC_AI_MAP);

// VALIDATE TOPIC

function isValidTopic(topic: unknown): topic is string {
  return typeof topic === "string" && VALID_TOPICS.includes(topic);
}

function getTopicProfile(topic: string): TopicProfile {
  const profile = TOPIC_PROFILES[topic];

  if (!profile) {
    throw new Error(`No topic profile found for topic: ${topic}`);
  }

  return profile;
}

// CACHE KEY

function getCacheKey(topic: string): string {
  const today = new Date().toISOString().split("T")[0];

  return `questions:${topic}:${today}`;
}

// SYSTEM PROMPT
// Now built per-topic so the model is anchored to what THIS deck is about,
// not a one-size-fits-all "warm and reflective" instruction that made every
// deck sound alike.

function getSystemPrompt(profile: TopicProfile): string {
  return `
You are generating conversation card questions for an app called Yap.

You are writing ONLY for the "${profile.label}" deck.

DECK DEFINITION:
${profile.description}

REQUIRED TONE:
${profile.tone}

This deck must NOT drift into these other decks' territory:
${profile.avoid.map((item) => `- ${item}`).join("\n")}

Style reference (for tone only — do NOT reuse these questions):
${profile.examples.map((example) => `- ${example}`).join("\n")}

Your questions must be:

- strongly and clearly about the "${profile.label}" topic as defined above
- natural, realistic, and something real people would actually ask each other
- not generic
- not childish
- not repetitive
- meaningfully different from each other

Avoid:

- generic motivational questions
- therapy-like language
- overly dramatic questions
- questions that sound like school assignments
- repeated ideas
- simple rewording of the same question
- questions that would fit better in a different deck (see "must NOT drift into" above)

Keep each question concise, preferably under 20 words.

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
}

// USER PROMPT

function getUserPrompt(profile: TopicProfile): string {
  return `
Generate up to ${QUESTIONS_PER_DAY} unique conversation questions
for the "${profile.label}" deck, strictly matching its definition and tone
described in the system prompt.

Prioritize quality, realism, variety, and staying on-topic for this specific deck.

Do NOT sacrifice question quality or topic accuracy just to reach the number.

If you cannot fit all ${QUESTIONS_PER_DAY} questions naturally,
return as many high-quality, clearly on-topic, unique questions as possible.

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
  const profile = getTopicProfile(topic);

  console.log(`[AI] Trying Groq (${GROQ_MODEL}) for "${topic}"`);

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,

    max_tokens: GROQ_MAX_TOKENS,

    temperature: GENERATION_TEMPERATURE,

    messages: [
      {
        role: "system",
        content: getSystemPrompt(profile),
      },
      {
        role: "user",
        content: getUserPrompt(profile),
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
  const profile = getTopicProfile(topic);

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
              text: getSystemPrompt(profile),
            },
          ],
        },

        contents: [
          {
            role: "user",

            parts: [
              {
                text: getUserPrompt(profile),
              },
            ],
          },
        ],

        generationConfig: {
          maxOutputTokens: GEMINI_MAX_TOKENS,

          temperature: GENERATION_TEMPERATURE,

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
  const profile = getTopicProfile(topic);

  console.log(`[AI] Trying OpenRouter (${model}) for "${topic}"`);

  const completion = await openrouter.chat.completions.create({
    model,

    max_tokens: OPENROUTER_MAX_TOKENS,

    temperature: GENERATION_TEMPERATURE,

    messages: [
      {
        role: "system",
        content: getSystemPrompt(profile),
      },
      {
        role: "user",
        content: getUserPrompt(profile),
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

  const profile = getTopicProfile(topic);

  console.log(`[AI] Completing ${missing} missing questions for "${topic}"`);

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,

    max_tokens: 1200,

    temperature: GENERATION_TEMPERATURE,

    messages: [
      {
        role: "system",

        content: `
You are completing a conversation card deck for Yap.

You are completing ONLY the "${profile.label}" deck.

DECK DEFINITION:
${profile.description}

REQUIRED TONE:
${profile.tone}

This deck must NOT drift into these other decks' territory:
${profile.avoid.map((item) => `- ${item}`).join("\n")}

Generate ONLY missing questions.

Rules:

- strongly related to the "${profile.label}" topic as defined above
- natural, realistic, thoughtful, conversational
- meaningfully different from each other
- do not repeat existing questions
- do not create simple rewordings
- do not write a question that would fit better in a different deck
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
Deck: ${profile.label}

Existing questions:

${existingQuestions.map((q, index) => `${index + 1}. ${q}`).join("\n")}

Generate exactly ${missing} NEW questions, strictly on-topic for the "${profile.label}" deck.

Do not repeat or closely rephrase any existing question.
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

  // Fail fast if a topic exists in TOPIC_AI_MAP but has no profile —
  // better to surface this at generation time than silently fall back
  // to a generic prompt again.
  getTopicProfile(topic);

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