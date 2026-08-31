import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check AI API keys
  const aiKeys = ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"];
  aiKeys.forEach((key) => {
    if (!process.env[key]) {
      errors.push(`${key} not configured`);
    }
  });

  // Check for Redis/KV setup (support both Upstash direct and Vercel KV)
  const hasUpstashDirect =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
  const hasVercelKV =
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

  if (!hasUpstashDirect && !hasVercelKV) {
    errors.push(`Redis not configured (need either Upstash or Vercel KV)`);
  }

  if (errors.length > 0) {
    console.error("[CONFIG] MISSING ENVIRONMENT VARIABLES:");
    errors.forEach((e) => console.error(`  ${e}`));
  } else {
    console.log("[CONFIG] All required env vars present");
    if (hasVercelKV) {
      console.log("[CONFIG] Using Vercel KV for Redis");
    } else {
      console.log("[CONFIG] Using Upstash Redis");
    }
  }

  return { valid: errors.length === 0, errors };
}

function initGroq() {
  return new OpenAI({
    baseURL: "htttps://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
  });
}

function initOpenRouter() {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

let groq: ReturnType<typeof initGroq>;
let openrouter: ReturnType<typeof initOpenRouter>;

const redis = Redis.fromEnv();

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const FORCE_LIVE_AI = process.env.FORCE_LIVE_AI === "true";
const USE_MOCK_AI = !IS_PRODUCTION && !FORCE_LIVE_AI;
const CACHE_ENV_PREFIX = IS_PRODUCTION ? "prod" : "dev";

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: `ratelimit:questions:${CACHE_ENV_PREFIX}`,
});

interface RequestBody {
  topics: string[] | string;
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

interface TopicProfile {
  label: string;
  description: string;
  tone: string;
  mustHave: string[];
  redFlags: string[];
  avoid: string[];
  examples: string[];
  commonMistakes: string[];
  variationPatterns: Array<{
    angle: string;
    examples: string[];
  }>;
  emotionalIntensity: "gentle" | "reflective" | "intimate" | "bold" | "chaotic";
}

const QUESTIONS_PER_DAY = 25;
const GROQ_MAX_TOKENS = 3000;
const GEMINI_MAX_TOKENS = 3000;
const OPENROUTER_MAX_TOKENS = 3000;
const GENERATION_TEMPERATURE = 0.95;

const GROQ_MODEL = "llama-3.1-70b-versatile";
const GEMINI_MODEL = "gemini-3.5-flash";

const TOPIC_AI_MAP: Record<string, TopicAIConfig> = {
  comfort: {
    primary: "groq",
    fallback: ["gemini", "openrouter"],
    openrouterModel: "anthropic/claude-haiku-4.5",
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
  intimacy: {
    primary: "gemini",
    fallback: ["groq", "openrouter"],
    openrouterModel: "anthropic/claude-haiku-4.5",
  },
  shotoranswer: {
    primary: "groq",
    fallback: ["openrouter", "gemini"],
    openrouterModel: "openai/gpt-4o-mini",
  },
};

const TOPIC_PROFILES: Record<string, TopicProfile> = {
  comfort: {
    label: "Comfort",
    description:
      "Questions that make someone feel held, seen, and deeply cared for. Not surface-level warmth—genuine, tender moments that remind people they're safe. Covers moments of quiet joy, unconditional belonging, memories that still make your heart ache in a good way, and the people who make you feel like home.",
    tone: "Warm, genuine, unhurried. Ranges from light and easy to quietly moving—the kind of question that makes someone pause and feel a little tender inside. Never clinical. Always feels like you truly care about their answer.",

    mustHave: [
      "Makes the person feel genuinely held or seen",
      "Evokes warmth or gentle emotion—not saccharine",
      "Creates a moment of belonging or safety",
      "Feels like genuine curiosity about who they are",
      "Opens up real, honest answers (not one-word)",
    ],

    redFlags: [
      "cold or clinical language",
      "questions about fears, trauma, or suffering",
      "anything flirty or romantic",
      "dare-like or challenging tone",
      "questions that demand long, exhausting answers",
      "generic self-help or motivational speak",
      "anything that feels like a therapy worksheet",
    ],

    avoid: [
      "deep existential or identity questions (that's Deep Talk)",
      "romantic or physical intimacy questions (that's Couples or Intimacy)",
      "bold, provocative, or dare-you-to-answer questions (that's Shot or Answer)",
    ],

    examples: [
      "Who in your life makes you feel most like yourself?",
      "What's a moment with someone that still makes you smile?",
      "What does being truly cared for feel like to you?",
      "Who's someone that's shown up for you in a quiet way?",
    ],

    commonMistakes: [
      "Making it too heavy—'Tell me about your trauma' is not comfort, it's interrogation",
      "Getting saccharine—comfort is genuine, not Hallmark-card platitudes",
      "Becoming a therapy session—avoid clinical language",
      "Making it impossible to answer—keep it conversational and grounded",
    ],

    variationPatterns: [
      {
        angle: "moments of true connection",
        examples: [
          "What's a moment with someone that made you feel truly seen?",
          "When do you feel most at ease with someone?",
          "Who makes you feel safe enough to just be yourself?",
        ],
      },
      {
        angle: "quiet joy and belonging",
        examples: [
          "What's a simple moment that reminds you life is good?",
          "What makes you feel like you belong somewhere?",
          "What's something that feels like home to you?",
        ],
      },
      {
        angle: "love in small gestures",
        examples: [
          "What's something small someone did for you that meant everything?",
          "How does someone show you they care without saying it?",
          "What's a gesture that never fails to make you feel loved?",
        ],
      },
    ],

    emotionalIntensity: "gentle",
  },

  deeptalk: {
    label: "Deep Talk",
    description:
      "Real questions about who someone is, who they're becoming, what they've actually done, regrets they carry, and what they genuinely want from their life. For people ready to be honest—with themselves and others. These questions sit with someone; they make you think about roads taken and not taken.",
    tone: "Thoughtful, genuine, unhurried. Feels like a real conversation between people who trust each other. Never pretentious. Always conversational, never like a therapy session or interview.",

    mustHave: [
      "Makes someone genuinely pause and reflect",
      "Reveals something true about who they are or who they're becoming",
      "Philosophical without being abstract or untethered",
      "Feels like a real conversation, not a worksheet",
      "Natural, honest phrasing—like a friend would ask it",
    ],

    redFlags: [
      "surface-level or lighthearted tone",
      "anything flirty, romantic, or intimate",
      "silly or party-game energy",
      "generic self-help language ('What are your goals?')",
      "therapy-worksheet phrasing ('How has your worldview evolved?')",
      "anything that sounds like it's trying too hard to be deep",
      "overly dramatic or sensationalized language",
    ],

    avoid: [
      "light icebreaker-style or nostalgic questions (that's Comfort)",
      "romantic-relationship-specific questions (that's Couples or Intimacy)",
      "bold party-dare questions (that's Shot or Answer)",
    ],

    examples: [
      "What belief have you changed your mind about?",
      "What version of yourself have you had to let go?",
      "What do you wish you'd done differently?",
      "What would you tell your younger self that they wouldn't listen to?",
    ],

    commonMistakes: [
      "Making it interrogatory—'What trauma defines you?' is not deep, it's intrusive",
      "Getting too abstract—ground it in their actual life, not philosophy",
      "Sounding clinical—use conversational language, not formal speech",
      "Generic platitudes—'What are your dreams?' is shallow, not deep",
    ],

    variationPatterns: [
      {
        angle: "identity and change",
        examples: [
          "How have you changed in ways you didn't expect?",
          "What part of your old self do you miss?",
          "Who were you that you're not anymore?",
        ],
      },
      {
        angle: "regret and wisdom",
        examples: [
          "What do you wish you'd been braver about?",
          "What do you know now that you wish you'd known then?",
          "What chance have you turned down that you still think about?",
        ],
      },
      {
        angle: "values and what matters",
        examples: [
          "What actually matters to you when you strip everything away?",
          "What do you want to be remembered for?",
          "What are you willing to lose for what you believe in?",
        ],
      },
    ],

    emotionalIntensity: "reflective",
  },

  couples: {
    label: "Couples",
    description:
      "Questions that deepen the bond between romantic partners. About the relationship itself, what they see in each other, moments that shifted something between them, and what they want to build together. These questions make partners feel truly seen and understood by someone they love.",
    tone: "Warm, intimate, vulnerable—but playful too. Always about 'us', never cold. Feels like a conversation between people who are genuinely curious about each other and the world they're building together.",

    mustHave: [
      "Specifically about the relationship or what they mean to each other",
      "Reveals how they experience each other or the relationship",
      "Creates a moment where someone feels truly seen",
      "Makes them think about their partner in a new way",
      "Intimate without being physical",
    ],

    redFlags: [
      "generic self-reflection with no relationship angle",
      "explicit sexual or desire content",
      "silly or party-game phrasing",
      "anything that could fit a single person",
      "logistics-focused questions",
      "questions about external life instead of 'us'",
      "clinical or survey-like language",
    ],

    avoid: [
      "generic self-reflection questions (that's Deep Talk)",
      "explicit physical/sexual questions (that's Intimacy)",
      "bold party-dare questions (that's Shot or Answer)",
    ],

    examples: [
      "When did you first realize I was going to matter to you?",
      "What's something about me that surprised you?",
      "What do you never want to lose about us?",
      "What moment with me changed something in you?",
    ],

    commonMistakes: [
      "Relationship logistics—'What's our biggest expense?' is not a couples question",
      "Generic romance—'Do you love me?' doesn't belong here",
      "Self-focused—make it about the 'us' in the relationship",
      "Too sexual—that's Intimacy, not Couples",
      "Surface-level—dig into what the relationship actually means",
    ],

    variationPatterns: [
      {
        angle: "how they see each other",
        examples: [
          "What do you think I don't know about how you see me?",
          "What quality of mine do you think I underestimate?",
          "When do you feel most understood by me?",
        ],
      },
      {
        angle: "shared moments and turning points",
        examples: [
          "What moment between us do you think about when you're alone?",
          "When did you know this mattered more than you expected?",
          "What's something we've overcome that made us stronger?",
        ],
      },
      {
        angle: "the future and meaning",
        examples: [
          "What do you hope we build together that no one else knows about?",
          "What do you never want to lose about us?",
          "What do you want us to be in 10 years?",
        ],
      },
    ],

    emotionalIntensity: "intimate",
  },

  intimacy: {
    label: "Intimacy",
    description:
      "Questions for romantic partners about desire, attraction, and emotional and physical closeness. These are sensual, flirty, and warm—they explore what makes them feel desired, what creates chemistry between them, vulnerability around attraction, and the warmth of being close. Tasteful and mature, focused on the genuine experience of intimacy and connection.",
    tone: "Warm, a little charged, genuinely curious. Flirty without being crude. The kind of question that makes someone blush a little or smile knowing. Feels intimate and safe, never interrogating or clinical.",

    mustHave: [
      "About desire, attraction, or emotional/physical closeness",
      "Reveals what makes them feel desired or connected",
      "Warm and genuinely sensual—not explicit",
      "Creates a sense of safety around vulnerability",
      "Feels intimate and playful, never clinical",
    ],

    redFlags: [
      "graphic, explicit, or crude sexual language",
      "clinical or survey-like phrasing",
      "funny or silly framing—that's Shot or Answer",
      "generic relationship questions with no intimacy angle",
      "questions that feel interrogating rather than curious",
      "anything that objectifies or depersonalizes",
    ],

    avoid: [
      "explicit sexual descriptions or graphic language",
      "generic relationship-logistics questions (that's Couples)",
      "playful/silly framing (that's Shot or Answer)",
      "clinical or therapy-worksheet questions",
    ],

    examples: [
      "What makes you feel most desired by me?",
      "When do you feel closest to me—physically or emotionally?",
      "What's something you've been wanting to tell me but felt shy?",
      "What moment with me makes your heart race?",
    ],

    commonMistakes: [
      "Getting graphic—keep it sensual and warm, never explicit",
      "Becoming generic Couples—'Do you love me?' is couples, not intimacy",
      "Getting silly—that's Shot or Answer",
      "Clinical language—avoid surveys, focus on genuine sensation and emotion",
      "Missing the warmth—intimacy is tender and safe, not interrogating",
    ],

    variationPatterns: [
      {
        angle: "physical attraction and closeness",
        examples: [
          "What's something about your body that you think I find attractive?",
          "When do you feel most drawn to me?",
          "What kind of physical closeness makes you feel most connected?",
        ],
      },
      {
        angle: "vulnerability and desire",
        examples: [
          "What's something you want from me but feel nervous to ask?",
          "What makes you feel most vulnerable with me?",
          "What turns you on about me that surprises even you?",
        ],
      },
      {
        angle: "chemistry and connection",
        examples: [
          "What moment between us made you think, 'Wow, this is different'?",
          "When do you feel the most chemistry between us?",
          "What's the most intimate conversation we've had?",
        ],
      },
    ],

    emotionalIntensity: "bold",
  },

  shotoranswer: {
    label: "Shot or Answer",
    description:
      "Bold, provocative, high-stakes party questions that make people hesitate. The kind of dare-you-to-answer questions where the first instinct is to take a shot. Ranges from embarrassing confessions to risky admissions—genuinely uncomfortable but fun, never mean-spirited. These are questions people would normally dodge.",
    tone: "Cheeky, high-energy, genuinely daring. Makes people squirm a little—in that fun, exciting way. Funny but with an edge. The kind of thing that creates those memorable, 'I can't believe they said that' moments.",

    mustHave: [
      "Makes someone think 'There's no way I'm answering that'",
      "Genuinely high-pressure or uncomfortable",
      "Creates real hesitation—answer or take a shot?",
      "Funny or shocking or both",
      "Generates reactions—laughter, awkward silence, surprise",
    ],

    redFlags: [
      "sincere or genuinely vulnerable tone",
      "anything that feels warm or comforting",
      "philosophical or introspective language",
      "romantic framing",
      "mean-spirited or cruel intent",
      "questions that only make sense if drunk",
      "anything that feels like it's trying to hurt someone",
    ],

    avoid: [
      "gentle or sincere reflective questions (that's Comfort or Deep Talk)",
      "romantic-intimacy framing (that's Intimacy or Couples)",
      "questions designed to be cruel or humiliating",
    ],

    examples: [
      "What's the most embarrassing thing you've done for a crush?",
      "What's something you'd never tell most people here?",
      "If no one would ever find out, what's something you'd do?",
      "Who in this room would you least want to know the truth about you?",
    ],

    commonMistakes: [
      "Making it too sincere—'Tell us about your biggest fear' is Deep Talk, not a dare",
      "Getting mean-spirited—questions should be daring, not cruel",
      "Being too tame—this needs to make people actually hesitate",
      "Getting too romantic—that kills the party energy",
      "Over-explaining—let the question sit uncomfortably",
    ],

    variationPatterns: [
      {
        angle: "embarrassing confessions",
        examples: [
          "What's the pettiest thing you've actually done?",
          "What's something you're ashamed of but still do?",
          "What lie have you told that no one knows about?",
        ],
      },
      {
        angle: "risky admissions and choices",
        examples: [
          "What would you do if you knew you wouldn't get caught?",
          "What's something you've wanted to do but were too scared?",
          "Have you ever done something you swore you'd never do?",
        ],
      },
      {
        angle: "uncomfortable truths",
        examples: [
          "Who in this room would you trust least?",
          "What's something you think about this group that you'd never say?",
          "What's the most judgmental thought you've had about someone here?",
        ],
      },
    ],

    emotionalIntensity: "chaotic",
  },
};

const VALID_TOPICS = Object.keys(TOPIC_AI_MAP);

function getUserIdFromRequest(req: NextRequest): string | null {
  // Option 1: From custom header (you set this from frontend)
  const userIdHeader = req.headers.get("x-user-id");
  if (userIdHeader?.trim()) {
    console.log(`[AUTH] userId from x-user-id header: ${userIdHeader}`);
    return userIdHeader.trim();
  }

  // Option 2: From Authorization header (JWT)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        const id = payload.sub || payload.email || payload.userId || payload.id;
        if (id) {
          console.log(`[AUTH] userId from JWT: ${id}`);
          return String(id);
        }
      }
    } catch (e) {
      console.log(`[AUTH] JWT decode failed`);
    }
  }

  // Option 3: From cookies (common for session-based auth)
  const cookies = req.headers.get("cookie");
  if (cookies) {
    const patterns = [/userId=([^;]+)/, /user_id=([^;]+)/, /auth=([^;]+)/];

    for (const pattern of patterns) {
      const match = cookies.match(pattern);
      if (match?.[1]) {
        console.log(`[AUTH] userId from cookie: ${match[1]}`);
        return match[1];
      }
    }
  }

  console.error(`[AUTH] NO USER ID FOUND in any location`);
  return null;
}

async function checkRedisHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const testKey = `health:${Date.now()}`;
    await redis.set(testKey, "ok", { ex: 10 });
    const result = await redis.get(testKey);
    await redis.del(testKey);

    if (result === "ok") {
      console.log("[REDIS] Health check passed");
      return { ok: true };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[REDIS] Health check failed:", msg);
    return { ok: false, error: msg };
  }
  return { ok: false, error: "Unknown error" };
}

function isValidTopic(topic: unknown): topic is string {
  return typeof topic === "string" && VALID_TOPICS.includes(topic);
}

function normalizeTopics(topics: string[] | string): string[] {
  const arr = Array.isArray(topics) ? topics : [topics];
  return arr.filter(isValidTopic);
}

function getTopicProfile(topic: string): TopicProfile {
  const profile = TOPIC_PROFILES[topic];
  if (!profile) {
    throw new Error(`No topic profile found for topic: ${topic}`);
  }
  return profile;
}

function getCacheKey(topics: string[], userId: string): string {
  const today = new Date().toISOString().split("T")[0];
  const sortedTopics = topics.sort().join(":");
  return `questions:${CACHE_ENV_PREFIX}:${userId}:${sortedTopics}:${today}`;
}

function hasGenericAIMarkers(question: string): boolean {
  const markers = [
    /^(what|which|how|why|when|who|have you ever)\s+(is|are|does|did|do|can|could|should|would)\s+(you|your)/i,
    /\b(think about|consider|reflect on|imagine|tell me about)\s+(your|the)\b/i,
    /\b(in what way|to what extent|for you personally)\b/i,
    /\b(share your thoughts|be honest|open up|reveal|discuss)\b/i,
  ];

  return markers.some((marker) => marker.test(question));
}

function hasRedFlags(question: string, profile: TopicProfile): boolean {
  const lowerQuestion = question.toLowerCase();
  return profile.redFlags.some((flag) => lowerQuestion.includes(flag));
}

function validateEmotionalIntensity(
  question: string,
  profile: TopicProfile,
): boolean {
  const intensity = profile.emotionalIntensity;

  if (intensity === "gentle") {
    const heavyMarkers =
      /\b(fear|trauma|death|suffer|painful|terrify|devastat)\b/i;
    if (heavyMarkers.test(question)) return false;
  }

  if (intensity === "chaotic") {
    const sincereMarkers =
      /\b(deeply|truly|genuinely|heartfelt|meaningful|soulful)\b/i;
    if (sincereMarkers.test(question)) return false;
  }

  return true;
}

function isValidQuestion(question: string, profile: TopicProfile): boolean {
  if (!question || question.trim().length === 0) return false;

  if (hasGenericAIMarkers(question)) {
    console.log(
      `[VALIDATION] Generic AI marker detected: "${question}" (${profile.label})`,
    );
    return false;
  }

  if (hasRedFlags(question, profile)) {
    console.log(
      `[VALIDATION] Red flag detected: "${question}" (${profile.label})`,
    );
    return false;
  }

  if (!validateEmotionalIntensity(question, profile)) {
    console.log(
      `[VALIDATION] Emotional intensity mismatch: "${question}" (${profile.label})`,
    );
    return false;
  }

  return true;
}

function getQuestionStructure(question: string): string {
  const q = question.trim();

  if (q.match(/^what\s+/i)) return "what";
  if (q.match(/^when\s+/i)) return "when";
  if (q.match(/^who\s+/i)) return "who";
  if (q.match(/^why\s+/i)) return "why";
  if (q.match(/^how\s+/i)) return "how";
  if (q.match(/^if\s+/i)) return "if";
  if (q.match(/^have you\s+/i)) return "have-you";
  if (q.match(/^do you\s+/i)) return "do-you";
  if (q.match(/^can you\s+/i)) return "can-you";
  if (q.match(/^would you\s+/i)) return "would-you";

  return "other";
}

function validateQuestionVariety(questions: string[]): string[] {
  const structures = new Map<string, number>();
  const maxPerStructure = Math.ceil(questions.length / 8);

  return questions.filter((question) => {
    const structure = getQuestionStructure(question);
    const current = structures.get(structure) || 0;

    if (current >= maxPerStructure) {
      console.log(
        `[VALIDATION] Too many '${structure}' questions, skipping: "${question}"`,
      );
      return false;
    }

    structures.set(structure, current + 1);
    return true;
  });
}

function mergeProfiles(topics: string[]): {
  profile: TopicProfile;
  topics: string[];
} {
  if (topics.length === 1) {
    return { profile: getTopicProfile(topics[0]), topics };
  }

  const profiles = topics.map(getTopicProfile);
  const combinedLabel = profiles.map((p) => p.label).join(" + ");

  const merged: TopicProfile = {
    label: combinedLabel,
    description: profiles.map((p) => p.description).join("\n\n"),
    tone: `Blend of: ${profiles.map((p) => p.tone).join(" + ")}`,
    mustHave: Array.from(new Set(profiles.flatMap((p) => p.mustHave))),
    redFlags: Array.from(new Set(profiles.flatMap((p) => p.redFlags))),
    avoid: [],
    examples: profiles.flatMap((p) => p.examples.slice(0, 2)),
    commonMistakes: profiles.flatMap((p) => p.commonMistakes.slice(0, 1)),
    variationPatterns: profiles.flatMap((p) => p.variationPatterns),
    emotionalIntensity: "reflective",
  };

  return { profile: merged, topics };
}

function generateMockQuestions(
  topics: string[],
  merged: TopicProfile,
): string[] {
  const questions: string[] = [];
  const allExamples = [
    ...merged.examples,
    ...merged.variationPatterns.flatMap((p) => p.examples),
    ...merged.commonMistakes.slice(0, 3),
  ];

  const shuffled = [...allExamples].sort(() => Math.random() - 0.5);

  for (let i = 0; i < QUESTIONS_PER_DAY; i++) {
    const question = shuffled[i % shuffled.length];
    questions.push(`[DEV MOCK #${i + 1}] ${question}`);
  }

  return questions;
}

function getSystemPrompt(profile: TopicProfile, topics: string[]): string {
  const isSingleDeck = topics.length === 1;
  const deckLabel = isSingleDeck
    ? `"${profile.label}"`
    : topics.map((t) => `"${t}"`).join(" + ");

  return `
You are generating conversation card questions for an app called YapCard.

${isSingleDeck ? `You are writing ONLY for the ${deckLabel} deck.` : `You are writing for a combination of decks: ${deckLabel}. Every question must satisfy ALL selected decks' requirements.`}

${profile.description}

EMOTIONAL INTENSITY: ${profile.emotionalIntensity}

REQUIRED TONE:
${profile.tone}

WHAT THIS DECK MUST HAVE:
${profile.mustHave.map((item) => `• ${item}`).join("\n")}

WHAT THIS DECK MUST AVOID (RED FLAGS):
${profile.redFlags.map((item) => `• ${item}`).join("\n")}

${profile.avoid.length > 0 ? `DECK BOUNDARY (Do not cross into these other decks):\n${profile.avoid.map((item) => `• ${item}`).join("\n")}` : ""}

${profile.commonMistakes.map((mistake) => `${mistake}`).join("\n")}

${profile.variationPatterns
  .map(
    (pattern) => `
ANGLE: ${pattern.angle}
Examples: ${pattern.examples.join(" | ")}
`,
  )
  .join("\n")}

Every question must:

✓ Clearly belong to the ${deckLabel} deck (not generic)
✓ Match the emotional intensity of "${profile.emotionalIntensity}"
✓ Feel like something real people would actually ask each other
✓ Be concise (preferably under 20 words)
✓ Have enough depth to create actual conversation, not a one-word answer
✓ Avoid sounding like an AI survey or therapy worksheet
✓ NOT repeat or closely rephrase other questions
✓ Vary sentence structure

DO NOT:
- Generate generic motivational questions
- Use corporate or clinical language
- Create questions from templates
- Sacrifice authenticity for quantity
- Sound like school assignments
- Overuse phrases like "Tell me about..." or "Share your..."

✓ DO:
- Prioritize authenticity and emotional resonance over quantity
- Create natural, conversational phrasing
- Make each question feel intentional for THIS deck
- Vary question openings and structures
- Use specificity over generality
- Create questions people will actually remember and feel

Return ONLY valid JSON. No markdown, no fences, no commentary.

{
    "questions": [
        "question 1",
        "question 2"
    ]
}
`;
}

function getUserPrompt(
  profile: TopicProfile,
  existingCount: number = 0,
): string {
  const needed =
    existingCount > 0
      ? `Generate ${Math.max(5, QUESTIONS_PER_DAY - existingCount)} additional`
      : `Generate up to ${QUESTIONS_PER_DAY}`;

  return `
${needed} conversation questions for the ${profile.label} deck.

Remember: These questions should feel REAL. Like something a real person would ask. They should create moments—laughter, vulnerability, connection, heat, whatever the deck calls for.

Guidelines:
- Every question must strictly match the deck definition and emotional tone
- Prioritize quality and authenticity over hitting exact count
- Keep every question concise and conversational
- If you reach high-quality questions before ${QUESTIONS_PER_DAY}, stop there
- Do not sacrifice deck identity for quantity
- Make people FEEL something—that's the point

Return ONLY JSON with a "questions" array.
`;
}

function parseQuestions(
  content: string,
  profile: TopicProfile,
  existing: string[] = [],
): string[] {
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
  const existingNormalized = new Set(
    existing.map((q) =>
      q
        .toLowerCase()
        .replace(/[?.!,]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );

  const validQuestions = parsed.questions
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

      if (existingNormalized.has(normalized)) {
        console.log(`[PARSE] Skipping duplicate of existing: "${question}"`);
        return false;
      }

      if (seen.has(normalized)) {
        console.log(
          `[PARSE] Skipping duplicate within batch: "${question}"`,
        );
        return false;
      }

      if (!isValidQuestion(question, profile)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });

  if (validQuestions.length === 0) {
    throw new Error("Model returned zero valid questions for this deck.");
  }

  const varied = validateQuestionVariety(validQuestions);

  return varied.slice(0, QUESTIONS_PER_DAY);
}

async function generateWithGroq(
  topics: string[],
  profile: TopicProfile,
  existing: string[] = [],
): Promise<string[]> {
  console.log(`[AI] Trying Groq (${GROQ_MODEL}) for "${profile.label}"`);

  groq = groq || initGroq();

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: GROQ_MAX_TOKENS,
    temperature: GENERATION_TEMPERATURE,
    messages: [
      {
        role: "system",
        content: getSystemPrompt(profile, topics),
      },
      {
        role: "user",
        content: getUserPrompt(profile, existing.length),
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

  return parseQuestions(content, profile, existing);
}

async function generateWithGemini(
  topics: string[],
  profile: TopicProfile,
  existing: string[] = [],
): Promise<string[]> {
  console.log(`[AI] Trying Gemini (${GEMINI_MODEL}) for "${profile.label}"`);

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
              text: getSystemPrompt(profile, topics),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: getUserPrompt(profile, existing.length),
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

  return parseQuestions(content, profile, existing);
}

async function generateWithOpenRouter(
  topics: string[],
  profile: TopicProfile,
  model: string,
  existing: string[] = [],
): Promise<string[]> {
  console.log(`[AI] Trying OpenRouter (${model}) for "${profile.label}"`);

  openrouter = openrouter || initOpenRouter();

  const completion = await openrouter.chat.completions.create({
    model,
    max_tokens: OPENROUTER_MAX_TOKENS,
    temperature: GENERATION_TEMPERATURE,
    messages: [
      {
        role: "system",
        content: getSystemPrompt(profile, topics),
      },
      {
        role: "user",
        content: getUserPrompt(profile, existing.length),
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

  return parseQuestions(content, profile, existing);
}

async function completeQuestionsWithGroq(
  topics: string[],
  profile: TopicProfile,
  existingQuestions: string[],
): Promise<string[]> {
  const missing = QUESTIONS_PER_DAY - existingQuestions.length;

  if (missing <= 0) {
    return existingQuestions.slice(0, QUESTIONS_PER_DAY);
  }

  console.log(
    `[AI] Completing ${missing} missing questions for "${profile.label}"`,
  );

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: 1500,
    temperature: GENERATION_TEMPERATURE,
    messages: [
      {
        role: "system",
        content: getSystemPrompt(profile, topics),
      },
      {
        role: "user",
        content: `
        Deck: ${profile.label}
        
        These questions already exist (do NOT repeat or rephrase):
        ${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
        
        Generate exactly ${missing} NEW, unique, high-quality questions that are DIFFERENT from these.
        
        Every question must:
        - Be completely different from the existing ones above
        - Match the deck definition strictly
        - Vary in structure from the existing questions
        - Not be a rephrase of any existing question
        - Feel authentic and real
        
        Return ONLY JSON:
        {
        "questions": ["question 1", "question 2"]
        }
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

  const additional = parseQuestions(content, profile, existingQuestions);
  const combined = [...existingQuestions, ...additional];

  if (combined.length < QUESTIONS_PER_DAY) {
    throw new Error(
      `Could only generate ${combined.length}/${QUESTIONS_PER_DAY} questions.`,
    );
  }

  return combined.slice(0, QUESTIONS_PER_DAY);
}

async function generateQuestions(topics: string[]): Promise<string[]> {
  if (topics.length === 0) {
    throw new Error("At least one topic is required.");
  }

  const { profile } = mergeProfiles(topics);

  if (USE_MOCK_AI) {
    console.log(`[AI] Using MOCK questions for "${profile.label}" (dev mode)`);
    return generateMockQuestions(topics, profile);
  }

  const firstTopic = topics[0];
  const config = TOPIC_AI_MAP[firstTopic];

  if (!config) {
    throw new Error(`No AI configuration found for topic: ${firstTopic}`);
  }

  const providers: Provider[] = [config.primary, ...config.fallback];
  let lastQuestions: string[] | null = null;

  for (const provider of providers) {
    try {
      console.log(
        `[AI] Trying ${provider.toUpperCase()} for "${profile.label}"`,
      );

      let questions: string[];

      switch (provider) {
        case "groq":
          questions = await generateWithGroq(topics, profile);
          break;

        case "gemini":
          questions = await generateWithGemini(topics, profile);
          break;

        case "openrouter":
          questions = await generateWithOpenRouter(
            topics,
            profile,
            config.openrouterModel,
          );
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      console.log(
        `[AI] ${provider.toUpperCase()} generated ${questions.length} questions`,
      );

      if (questions.length >= QUESTIONS_PER_DAY) {
        return questions.slice(0, QUESTIONS_PER_DAY);
      }

      lastQuestions = questions;

      console.log(
        `[AI] ${provider.toUpperCase()} returned ${questions.length}/${QUESTIONS_PER_DAY}`,
      );

      try {
        const completed = await completeQuestionsWithGroq(
          topics,
          profile,
          questions,
        );

        if (completed.length >= QUESTIONS_PER_DAY) {
          console.log(`[AI] Completed to ${completed.length} questions`);
          return completed;
        }
      } catch (completionError) {
        console.error(
          `[AI] Could not complete missing questions:`,
          completionError,
        );
      }

      console.log(`[AI] Moving to next provider for "${profile.label}"`);
    } catch (error) {
      console.error(
        `[AI] ${provider.toUpperCase()} failed for "${profile.label}":`,
        error,
      );
    }
  }

  if (lastQuestions && lastQuestions.length >= QUESTIONS_PER_DAY) {
    return lastQuestions.slice(0, QUESTIONS_PER_DAY);
  }

  throw new Error(`All AI providers failed for ${profile.label}.`);
}

async function generateQuestionsWithLock(
  topics: string[],
  userId: string,
): Promise<string[]> {
  const cacheKey = getCacheKey(topics, userId);
  const lockKey = `lock:${cacheKey}`;

  const gotLock = await redis.set(lockKey, "1", {
    nx: true,
    ex: 120,
  });

  if (!gotLock) {
    console.log(
      `[REDIS] Waiting for another request to finish: ${topics.join(", ")} (user: ${userId})`,
    );

    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const cached = await redis.get<string[]>(cacheKey);

      if (cached && cached.length >= QUESTIONS_PER_DAY) {
        console.log(
          `[REDIS] Received cached questions for "${topics.join(", ")}" (${userId})`,
        );
        return cached.slice(0, QUESTIONS_PER_DAY);
      }
    }

    throw new Error("Question generation timed out. Please try again.");
  }

  try {
    const cached = await redis.get<string[]>(cacheKey);

    if (cached && cached.length >= QUESTIONS_PER_DAY) {
      console.log(
        `[REDIS] Cache found after lock: ${topics.join(", ")} (${userId})`,
      );
      return cached.slice(0, QUESTIONS_PER_DAY);
    }

    const questions = await generateQuestions(topics);

    await redis.set(cacheKey, questions, {
      ex: USE_MOCK_AI ? 60 * 10 : 60 * 60 * 25,
    });

    console.log(
      `[REDIS] Saved ${questions.length} questions for "${topics.join(", ")}" (${userId}) (${CACHE_ENV_PREFIX})`,
    );

    return questions;
  } finally {
    await redis.del(lockKey);
    console.log(`[REDIS] Released lock for "${topics.join(", ")}" (${userId})`);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Validate config on startup
    if (IS_PRODUCTION) {
      const { valid, errors } = validateConfig();
      if (!valid) {
        console.error("[API] Server misconfigured");
        return NextResponse.json(
          { error: "Server misconfigured", details: errors },
          { status: 500 },
        );
      }
    }

    // Check Redis health
    const redisHealth = await checkRedisHealth();
    if (!redisHealth.ok && IS_PRODUCTION) {
      console.error("[API] Redis unavailable:", redisHealth.error);
      return NextResponse.json(
        { error: "Cache service unavailable. Please try again." },
        { status: 503 },
      );
    }

    // Get authenticated user ID
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        {
          error: "Unauthorized: Please log in first",
        },
        {
          status: 401,
        },
      );
    }

    const body: RequestBody = await req.json();
    let { topics } = body;

    if (!Array.isArray(topics)) {
      topics = topics ? [topics] : [];
    }

    const normalized = normalizeTopics(topics);

    if (normalized.length === 0) {
      return NextResponse.json(
        {
          error: "Invalid or missing topic(s)",
        },
        {
          status: 400,
        },
      );
    }

    const cacheKey = getCacheKey(normalized, userId);
    console.log(`[REDIS] Checking cache: ${cacheKey}`);

    const cached = await redis.get<string[]>(cacheKey);

    if (cached && cached.length >= QUESTIONS_PER_DAY) {
      console.log(`[REDIS] CACHE HIT: ${normalized.join(", ")} (${userId})`);
      return NextResponse.json({
        questions: cached.slice(0, QUESTIONS_PER_DAY),
      });
    }

    console.log(`[REDIS] CACHE MISS: ${normalized.join(", ")} (${userId})`);

    const { success } = await ratelimit.limit(userId);

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

    const questions = await generateQuestionsWithLock(normalized, userId);

    return NextResponse.json({
      questions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("[API] ERROR:");
    console.error("  Message:", errorMessage);
    console.error("  Stack:", error instanceof Error ? error.stack : "N/A");

    // Return specific error based on error type
    if (errorMessage.includes("GEMINI_API_KEY")) {
      return NextResponse.json(
        { error: "Gemini API not configured (server error)" },
        { status: 500 },
      );
    }

    if (errorMessage.includes("GROQ_API_KEY")) {
      return NextResponse.json(
        { error: "Groq API not configured (server error)" },
        { status: 500 },
      );
    }

    if (errorMessage.includes("All AI providers failed")) {
      return NextResponse.json(
        {
          error: "All AI providers failed. Please try again in a moment.",
        },
        { status: 503 },
      );
    }

    if (errorMessage.includes("timed out")) {
      return NextResponse.json(
        { error: "Request timed out. Please try again." },
        { status: 504 },
      );
    }

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
