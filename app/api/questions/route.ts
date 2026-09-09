import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

interface QuestionScore {
  question: string;
  score: number;
  reasons: string[];
  issues: string[];
}

interface ResponseData {
  questions: string[];
}

function isInstructionText(text: string): boolean {
  const instructionPatterns = [
    /^/,
    /^(getting|making|being|creating|overuse|using)\s+/i,
    /—/,
    /^bad example/i,
    /^common mistake/i,
    /should\s+(be|not be|avoid|use)/i,
    /^(getting|making|becoming|being|over-?)(.*?)—/i,
    /^(do|dont|don't|avoid|never|always)[\s:]/i,
    /^(ensure|verify|validate|check|confirm)/i,
    /is\s+not\s+[a-z]+,\s+it'/i,
  ];

  const trimmed = text.trim().toLowerCase();
  
  return instructionPatterns.some(pattern => pattern.test(trimmed));
}

function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[?.!,;:—–]/g, "").split(/\s+/).sort().join(" ");

  const n1 = normalize(str1);
  const n2 = normalize(str2);

  if (n1 === n2) return 1;

  const words1 = new Set(n1.split(" "));
  const words2 = new Set(n2.split(" "));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function isDuplicateOrTooSimilar(
  question: string,
  existing: string[],
  threshold: number = 0.65
): boolean {
  return existing.some((existing) => {
    const similarity = calculateSimilarity(question, existing);
    if (similarity >= threshold) {
      console.log(
        `[SIMILARITY] "${question}" is ${(similarity * 100).toFixed(0)}% similar to "${existing}"`
      );
      return true;
    }
    return false;
  });
}

function hasRedFlags(question: string, profile: TopicProfile): boolean {
  const lowerQuestion = question.toLowerCase();

  const redFlagPatterns = profile.redFlags.map((flag) => {
    const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "gi");
  });

  const foundFlags = redFlagPatterns.filter((pattern) =>
    pattern.test(lowerQuestion)
  );

  if (foundFlags.length > 0) {
    console.log(
      `[VALIDATION] Red flags in "${question}" for ${profile.label}`
    );
    return true;
  }

  if (profile.emotionalIntensity === "gentle") {
    const heavyMarkers =
      /\b(fear|trauma|death|suffer|painful|terrify|devastat|dark|pain|tragedy|loss|grief)\b/i;
    if (heavyMarkers.test(question)) {
      console.log(
        `[VALIDATION] Heavy emotional marker in gentle deck: "${question}"`
      );
      return true;
    }

    const philosophicalMarkers =
      /\b(meaning|purpose|existence|philosophy|identity)\b/i;
    if (philosophicalMarkers.test(question)) {
      console.log(
        `[VALIDATION] Too philosophical for comfort deck: "${question}"`
      );
      return true;
    }
  }

  if (profile.emotionalIntensity === "chaotic") {
    const sincereMarkers =
      /\b(deeply|truly|genuinely|heartfelt|meaningful|soulful|profound|sacred)\b/i;
    if (sincereMarkers.test(question)) {
      console.log(
        `[VALIDATION] Too sincere for party deck: "${question}"`
      );
      return true;
    }

    const wholesomeMarkers =
      /\b(love|beautiful|grateful|appreciate|cherish|blessed)\b/i;
    const wholesomeCount = (question.match(wholesomeMarkers) || []).length;
    if (wholesomeCount >= 2) {
      console.log(
        `[VALIDATION] Too wholesome for party deck: "${question}"`
      );
      return true;
    }
  }

  if (profile.emotionalIntensity === "intimate") {
    const explicitMarkers =
      /\b(sex|fuck|cum|pussy|cock|dick|suck|porn|orgasm)\b/i;
    if (explicitMarkers.test(question)) {
      console.log(
        `[VALIDATION] Too explicit for intimacy deck: "${question}"`
      );
      return true;
    }

    if (question.toLowerCase().includes("do you love me")) {
      console.log(
        `[VALIDATION] Too generic couples for intimacy: "${question}"`
      );
      return true;
    }
  }

  if (profile.emotionalIntensity === "reflective") {
    const shallowMarkers =
      /\b(favorite|like|dislike|prefer|enjoy|fun|cool|nice|good)\b/i;
    const shallowCount = (question.match(shallowMarkers) || []).length;
    if (shallowCount >= 3) {
      console.log(
        `[VALIDATION] Too surface-level for deep talk: "${question}"`
      );
      return true;
    }
  }

  return false;
}

function checkIntentMatch(question: string, profile: TopicProfile): boolean {
  const description = profile.description.toLowerCase();
  const descriptionKeywords = description
    .split(/\s+/)
    .filter((word) => word.length > 5)
    .slice(0, 15);

  const questionLower = question.toLowerCase();
  const matches = descriptionKeywords.filter((keyword) =>
    questionLower.includes(keyword)
  );

  return matches.length > 0;
}

function scoreQuestion(
  question: string,
  profile: TopicProfile,
  existing: string[] = []
): QuestionScore {
  const score: QuestionScore = {
    question,
    score: 100,
    reasons: [],
    issues: [],
  };

  if (!question || question.trim().length === 0) {
    score.score = 0;
    score.issues.push("Empty question");
    return score;
  }

  if (isInstructionText(question)) {
    score.score = 0;
    score.issues.push("Is instruction text, not a real question");
    console.log(`[VALIDATION] Filtered instruction text: "${question}"`);
    return score;
  }

  if (question.length > 150) {
    score.score -= 20;
    score.issues.push("Too long (>150 chars)");
  }

  if (isDuplicateOrTooSimilar(question, existing, 0.6)) {
    score.score = 0;
    score.issues.push("Too similar to existing question");
    return score;
  }

  if (hasRedFlags(question, profile)) {
    score.score = 0;
    score.issues.push("Contains red flags for this deck");
    return score;
  }

  const mustHaveMatches = profile.mustHave.filter((criterion) => {
    const keywords = criterion.toLowerCase().split(/\s+/).slice(0, 3);
    return keywords.some((keyword) =>
      question.toLowerCase().includes(keyword)
    );
  });

  if (mustHaveMatches.length === 0) {
    const intentMatch = checkIntentMatch(question, profile);
    if (!intentMatch) {
      score.score -= 30;
      score.issues.push("Doesn't match deck intent");
    } else {
      score.reasons.push("Matches deck intent indirectly");
    }
  } else {
    score.reasons.push(
      `Matches ${mustHaveMatches.length} must-have criteria`
    );
  }

  const emotionalMatch = validateEmotionalIntensity(question, profile);
  if (!emotionalMatch) {
    score.score -= 40;
    score.issues.push("Emotional intensity mismatch");
  } else {
    score.reasons.push("Emotional intensity appropriate");
  }

  const structure = getQuestionStructure(question);
  score.reasons.push(`Uses "${structure}" structure`);

  if (question.includes("?")) {
    score.reasons.push("Ends with question mark");
  } else {
    score.score -= 10;
    score.issues.push("Not phrased as a question");
  }

  if (question.split(" ").length <= 15) {
    score.score += 10;
    score.reasons.push("Concise (≤15 words)");
  }

  // Deck-specific scoring
  if (profile.label === "Comfort") {
    if (/who|what.*feel|how.*feel/i.test(question)) {
      score.score += 15;
      score.reasons.push("Emotion-focused (great for Comfort)");
    }
    if (/\b(someone|people|memory|moment)\b/i.test(question)) {
      score.score += 10;
      score.reasons.push("Relationship-focused (good for Comfort)");
    }
  }

  if (profile.label === "Deep Talk") {
    if (/change|believe|regret|wisdom|identity|yourself/i.test(question)) {
      score.score += 20;
      score.reasons.push("Deep topic (great for Deep Talk)");
    }
    if (/have you|would you|do you|what.*/i.test(question)) {
      score.score += 10;
      score.reasons.push("Self-reflective structure");
    }
  }

  if (profile.label === "Couples") {
    if (/us|we|our|together|between|me\s/i.test(question)) {
      score.score += 20;
      score.reasons.push("Relationship-focused (essential for Couples)");
    }
    if (/see|understand|mean|matter|feel.*you/i.test(question)) {
      score.score += 15;
      score.reasons.push("About partners' perspective");
    }
  }

  if (profile.label === "Intimacy") {
    if (/desire|attracted|close|vulnerable|want/i.test(question)) {
      score.score += 20;
      score.reasons.push("Intimacy-focused (great for Intimacy)");
    }
    if (/feel|make|you.*me|chemistry/i.test(question)) {
      score.score += 15;
      score.reasons.push("Sensual/emotional focus");
    }
  }

  if (profile.label === "Shot or Answer") {
    if (/would you|have you.*done|never told|secret|lie|worst/i.test(
      question
    )) {
      score.score += 20;
      score.reasons.push("Daring premise (great for Shot)");
    }
    if (/embarrass|ashamed|judge|truth|confess/i.test(question)) {
      score.score += 15;
      score.reasons.push("Confession angle");
    }
  }

  score.score = Math.max(0, Math.min(100, score.score));

  return score;
}

function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const aiKeys = ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"];
  aiKeys.forEach((key) => {
    if (!process.env[key]) {
      errors.push(`${key} not configured`);
    }
  });

  const hasUpstashDirect =
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN;
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

const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const redis = Redis.fromEnv();

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const FORCE_LIVE_AI = process.env.FORCE_LIVE_AI === "true";
const USE_MOCK_AI = true;
const CACHE_ENV_PREFIX = IS_PRODUCTION ? "prod" : "dev";

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: `ratelimit:questions:${CACHE_ENV_PREFIX}`,
});

interface RequestBody {
  topics: string[] | string;
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

const GROQ_MODEL = "llama-3.2-70b-versatile";
const GEMINI_MODEL = "gemini-3.5-flash";

const TOPIC_AI_MAP: Record<string, TopicAIConfig> = {
  comfort: {
    primary: "openrouter",
    fallback: ["gemini", "groq"],
    openrouterModel: "anthropic/claude-haiku-4.5",
  },
  deeptalk: {
    primary: "openrouter",
    fallback: ["gemini", "groq"],
    openrouterModel: "openai/gpt-4o-mini",
  },
  couples: {
    primary: "gemini",
    fallback: ["openrouter", "groq"],
    openrouterModel: "anthropic/claude-3.5-haiku",
  },
  intimacy: {
    primary: "gemini",
    fallback: ["openrouter", "groq"],
    openrouterModel: "anthropic/claude-3.5-haiku",
  },
  shotoranswer: {
    primary: "groq",
    fallback: ["gemini", "groq"],
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

function getDeckSpecificSystemPrompt(
  profile: TopicProfile,
  topics: string[]
): string {
  const isSingleDeck = topics.length === 1;
  const deckLabel = isSingleDeck
    ? `"${profile.label}"`
    : topics.map((t) => `"${t}"`).join(" + ");

  let basePrompt = `
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

${
  profile.avoid.length > 0
    ? `DECK BOUNDARY (Do not cross into these other decks):\n${profile.avoid
        .map((item) => `• ${item}`)
        .join("\n")}`
    : ""
}

${profile.variationPatterns
  .map(
    (pattern) => `
ANGLE: ${pattern.angle}
Examples: ${pattern.examples.join(" | ")}
`
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

  let deckSpecific = "";

  if (topics.includes("comfort")) {
    deckSpecific = `
COMFORT DECK SPECIFICS:
- Questions should feel like a friend asking, not a therapist
- Focus on moments that made someone feel HELD or SEEN
- Never ask about problems, pain, or difficulties
- "Who makes you feel..." "What's a moment..." "When do you feel..." patterns work well
- Should evoke a SMILE or gentle warmth, not tears or deep reflection

BAD examples for Comfort: "What trauma defines you?" "Tell me about your biggest fear" "What's your darkest secret?"
GOOD examples: "Who's someone that's shown up for you quietly?" "What moment still makes you smile?"
`;
  }

  if (topics.includes("deeptalk")) {
    deckSpecific = `
DEEPTALK SPECIFICS:
- Questions should make someone PAUSE and really think
- Focus on identity, change, values, wisdom, roads not taken
- Should feel like a real conversation between people who trust each other
- "What belief..." "What version of yourself..." "When have you..." patterns work
- Should reveal something TRUE about who they are or are becoming

BAD examples: "What are your goals?" "What do you like to do?" "Tell me about yourself"
GOOD examples: "What belief have you changed your mind about?" "What version of yourself have you had to let go?"
`;
  }

  if (topics.includes("couples")) {
    deckSpecific = `
COUPLES SPECIFICS:
- EVERY question must be about the RELATIONSHIP or how they see each other
- Focus on "us", "we", how they experience their partner
- "What do you see in me..." "When did you realize..." "What moment between us..."
- Should make partners feel TRULY SEEN by someone they love
- Do NOT ask generic self-reflection or relationship logistics

BAD examples: "What's your biggest dream?" "Do you love me?" "What's our biggest expense?"
GOOD examples: "When did you first realize I was going to matter to you?" "What moment with me changed something in you?"
`;
  }

  if (topics.includes("intimacy")) {
    deckSpecific = `
INTIMACY SPECIFICS:
- Questions about DESIRE, ATTRACTION, and CLOSENESS (emotional and physical)
- Should be warm, charged, and genuinely curious - NOT explicit or clinical
- "What makes you feel..." "When do you feel closest..." "What turns you on about..."
- Focus on genuine experience of closeness and connection
- Tasteful and mature - sensual without being crude

BAD examples: "Describe your sexual fantasies in detail" "Do you masturbate?" Generic couples questions
GOOD examples: "What makes you feel most desired by me?" "What moment with me makes your heart race?"
`;
  }

  if (topics.includes("shotoranswer")) {
    deckSpecific = `
SHOT OR ANSWER SPECIFICS:
- Questions that make people think "Do I HAVE to answer that?" or reach for a drink
- Bold, provocative, genuinely uncomfortable - but FUN, never mean
- Focus on embarrassing confessions, risky admissions, uncomfortable truths
- Should generate reactions - laughter, awkward silence, surprises
- "What's something you'd never tell..." "Have you ever..." "If no one would know..."

BAD examples: Deep, philosophical, sincere, romantic, or mean-spirited questions
GOOD examples: "What's the most embarrassing thing you've done for a crush?" "If no one would ever find out, what would you do?"
`;
  }

  return basePrompt + "\n\n" + deckSpecific;
}

function getUserIdFromRequest(req: NextRequest): string | null {
  const userIdHeader = req.headers.get("x-user-id");
  if (userIdHeader?.trim()) {
    console.log(`[AUTH] userId from x-user-id header: ${userIdHeader}`);
    return userIdHeader.trim();
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64").toString()
        );
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

  const cookies = req.headers.get("cookie");
  if (cookies) {
    const patterns = [
      /userId=([^;]+)/,
      /user_id=([^;]+)/,
      /auth=([^;]+)/,
    ];

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

function validateEmotionalIntensity(
  question: string,
  profile: TopicProfile
): boolean {
  const intensity = profile.emotionalIntensity;

  if (intensity === "gentle") {
    const heavyMarkers = /\b(fear|trauma|death|suffer|painful|terrify|devastat)\b/i;
    if (heavyMarkers.test(question)) return false;
  }

  if (intensity === "chaotic") {
    const sincereMarkers = /\b(deeply|truly|genuinely|heartfelt|meaningful|soulful)\b/i;
    if (sincereMarkers.test(question)) return false;
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
  const maxPerStructure = Math.ceil(questions.length / 4);

  return questions.filter((question) => {
    const structure = getQuestionStructure(question);
    const current = structures.get(structure) || 0;

    if (current >= maxPerStructure) {
      console.log(
        `[VALIDATION] Too many '${structure}' questions, skipping: "${question}"`
      );
      return false;
    }

    structures.set(structure, current + 1);
    return true;
  });
}

function mergeProfiles(
  topics: string[]
): { profile: TopicProfile; topics: string[] } {
  if (topics.length === 1) {
    return { profile: getTopicProfile(topics[0]), topics };
  }

  const profiles = topics.map(getTopicProfile);
  const combinedLabel = profiles.map((p) => p.label).join(" + ");

  const merged: TopicProfile = {
    label: combinedLabel,
    description: profiles.map((p) => p.description).join("\n\n"),
    tone: `Blend of: ${profiles.map((p) => p.tone).join(" + ")}`,
    mustHave: Array.from(
      new Set(profiles.flatMap((p) => p.mustHave))
    ),
    redFlags: Array.from(
      new Set(profiles.flatMap((p) => p.redFlags))
    ),
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
  merged: TopicProfile
): string[] {
  const questions: string[] = [];
  
  const allExamples = [
    ...merged.examples,
    ...merged.variationPatterns.flatMap((p) => p.examples),
  ];

  if (allExamples.length === 0) {
    console.warn(
      `[MOCK] No examples found for ${merged.label}, using fallback examples`
    );
    return merged.examples.slice(0, QUESTIONS_PER_DAY);
  }

  const shuffled = [...allExamples].sort(() => Math.random() - 0.5);

  for (let i = 0; i < QUESTIONS_PER_DAY; i++) {
    const question = shuffled[i % shuffled.length];
    
    if (!question || question.trim().length === 0) {
      console.warn(`[MOCK] Skipping empty question`);
      continue;
    }

    const trimmed = question.trim();

    if (isInstructionText(trimmed)) {
      console.error(
        `[MOCK] SECURITY: Filtered out instruction text: "${trimmed}"`
      );
      continue;
    }

    if (!trimmed.includes("?")) {
      console.warn(`[MOCK] Skipping non-question: "${trimmed}"`);
      continue;
    }

    questions.push(trimmed);
  }

  if (questions.length < QUESTIONS_PER_DAY) {
    console.warn(
      `[MOCK] Only generated ${questions.length} questions, padding with verified examples`
    );
    const padding = merged.examples
      .filter(q => q.includes("?") && !isInstructionText(q))
      .slice(0, QUESTIONS_PER_DAY - questions.length);
    questions.push(...padding);
  }

  const finalQuestions = questions.slice(0, QUESTIONS_PER_DAY);
  
  if (process.env.NODE_ENV === "development") {
    const audit = finalQuestions.filter(q => isInstructionText(q));
    if (audit.length > 0) {
      console.error(`[MOCK] AUDIT FAILED: Found ${audit.length} instruction items:`, audit);
    }
  }

  console.log(`[MOCK] Generated ${finalQuestions.length} verified questions for ${merged.label}`);
  return finalQuestions;
}

function getUserPrompt(
  profile: TopicProfile,
  existingCount: number = 0
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

function parseQuestionsWithScoring(
  content: string,
  profile: TopicProfile,
  existing: string[] = [],
  minScoreThreshold: number = 65
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

  const scored = parsed.questions
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .filter(q => !isInstructionText(q))
    .map((q) => scoreQuestion(q.trim(), profile, existing))
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score >= minScoreThreshold);

  if (scored.length === 0) {
    throw new Error(
      `No questions met quality threshold (${minScoreThreshold}/100) for ${profile.label}`
    );
  }

  console.log(`[SCORING] ${profile.label} - Top questions:`);
  scored.slice(0, 5).forEach((s, i) => {
    console.log(`  ${i + 1}. (${Math.round(s.score)}/100) "${s.question}"`);
    console.log(`      ${s.reasons.join(" | ")}`);
    if (s.issues.length > 0) {
      console.log(`      ${s.issues.join(" | ")}`);
    }
  });

  const validQuestions = scored
    .map((s) => s.question)
    .slice(0, QUESTIONS_PER_DAY);

  return validateQuestionVariety(validQuestions);
}

async function generateWithGroq(
  topics: string[],
  profile: TopicProfile,
  existing: string[] = []
): Promise<string[]> {
  console.log(
    `[AI] Trying Groq (${GROQ_MODEL}) for "${profile.label}"`
  );

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: GROQ_MAX_TOKENS,
    temperature: GENERATION_TEMPERATURE,
    messages: [
      {
        role: "system",
        content: getDeckSpecificSystemPrompt(profile, topics),
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

  return parseQuestionsWithScoring(content, profile, existing, 65);
}

async function generateWithGemini(
  topics: string[],
  profile: TopicProfile,
  existing: string[] = []
): Promise<string[]> {
  console.log(
    `[AI] Trying Gemini (${GEMINI_MODEL}) for "${profile.label}"`
  );

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
              text: getDeckSpecificSystemPrompt(profile, topics),
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
    }
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

  return parseQuestionsWithScoring(content, profile, existing, 65);
}

async function generateWithOpenRouter(
  topics: string[],
  profile: TopicProfile,
  model: string,
  existing: string[] = []
): Promise<string[]> {
  console.log(`[AI] Trying OpenRouter (${model}) for "${profile.label}"`);

  const completion = await openrouter.chat.completions.create({
    model,
    max_tokens: OPENROUTER_MAX_TOKENS,
    temperature: GENERATION_TEMPERATURE,
    messages: [
      {
        role: "system",
        content: getDeckSpecificSystemPrompt(profile, topics),
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

  return parseQuestionsWithScoring(content, profile, existing, 65);
}

async function completeQuestionsWithGroq(
  topics: string[],
  profile: TopicProfile,
  existingQuestions: string[]
): Promise<string[]> {
  const missing = QUESTIONS_PER_DAY - existingQuestions.length;

  if (missing <= 0) {
    return existingQuestions.slice(0, QUESTIONS_PER_DAY);
  }

  console.log(
    `[AI] Completing ${missing} missing questions for "${profile.label}"`
  );

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: 1500,
    temperature: GENERATION_TEMPERATURE,
    messages: [
      {
        role: "system",
        content: getDeckSpecificSystemPrompt(profile, topics),
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

  const additional = parseQuestionsWithScoring(
    content,
    profile,
    existingQuestions,
    55
  );
  const combined = [...existingQuestions, ...additional];

  if (combined.length < QUESTIONS_PER_DAY) {
    throw new Error(
      `Could only generate ${combined.length}/${QUESTIONS_PER_DAY} questions.`
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
    console.log(
      `[AI] Using MOCK questions for "${profile.label}" (dev mode)`
    );
    return generateMockQuestions(topics, profile);
  }

  const firstTopic = topics[0];
  const config = TOPIC_AI_MAP[firstTopic];

  if (!config) {
    throw new Error(`No AI configuration found for topic: ${firstTopic}`);
  }

  const providers: Provider[] = [config.primary, ...config.fallback];
  let lastQuestions: string[] | null = null;

  console.log(`[AI] Starting generation for "${profile.label}"`);
  console.log(`[AI] Provider order: ${providers.join(" → ")}`);

  for (const provider of providers) {
    try {
      console.log(
        `[AI] ========== TRYING ${provider.toUpperCase()} ==========`
      );

      let questions: string[];

      switch (provider) {
        case "groq":
          console.log(`[GROQ] API Key present: ${!!process.env.GROQ_API_KEY}`);
          console.log(`[GROQ] Model: ${GROQ_MODEL}`);
          questions = await generateWithGroq(topics, profile);
          break;

        case "gemini":
          console.log(`[GEMINI] API Key present: ${!!process.env.GEMINI_API_KEY}`);
          console.log(`[GEMINI] Model: ${GEMINI_MODEL}`);
          questions = await generateWithGemini(topics, profile);
          break;

        case "openrouter":
          console.log(`[OPENROUTER] API Key present: ${!!process.env.OPENROUTER_API_KEY}`);
          console.log(`[OPENROUTER] Model: ${config.openrouterModel}`);
          questions = await generateWithOpenRouter(
            topics,
            profile,
            config.openrouterModel
          );
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      console.log(
        `[AI] ${provider.toUpperCase()} SUCCESS: ${questions.length} questions`
      );

      if (questions.length >= QUESTIONS_PER_DAY) {
        return questions.slice(0, QUESTIONS_PER_DAY);
      }

      lastQuestions = questions;

      console.log(
        `[AI] ${provider.toUpperCase()} returned ${questions.length}/${QUESTIONS_PER_DAY} (trying to complete...)`
      );

      try {
        const completed = await completeQuestionsWithGroq(
          topics,
          profile,
          questions
        );

        if (completed.length >= QUESTIONS_PER_DAY) {
          console.log(`[AI] Completed to ${completed.length} questions`);
          return completed;
        }
      } catch (completionError) {
        console.error(
          `[AI] Completion failed:`,
          completionError instanceof Error
            ? completionError.message
            : completionError
        );
      }
    } catch (error) {
      console.error(
        `[AI] ${provider.toUpperCase()} FAILED:`,
        error instanceof Error ? error.message : String(error)
      );
      if (error instanceof Error && error.stack) {
        console.error(`[AI] Stack:`, error.stack);
      }
    }
  }

  console.error(`[AI] ALL PROVIDERS FAILED`);
  throw new Error(`All AI providers failed for ${profile.label}.`);
}

async function generateQuestionsWithLock(
  topics: string[],
  userId: string
): Promise<string[]> {
  const cacheKey = getCacheKey(topics, userId);
  const lockKey = `lock:${cacheKey}`;

  const gotLock = await redis.set(lockKey, "1", {
    nx: true,
    ex: 120,
  });

  if (!gotLock) {
    console.log(
      `[REDIS] Waiting for another request to finish: ${topics.join(
        ", "
      )} (user: ${userId})`
    );

    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const cached = await redis.get<string[]>(cacheKey);

      if (cached && cached.length >= QUESTIONS_PER_DAY) {
        console.log(
          `[REDIS] Received cached questions for "${topics.join(
            ", "
          )}" (${userId})`
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
        `[REDIS] Cache found after lock: ${topics.join(", ")} (${userId})`
      );
      return cached.slice(0, QUESTIONS_PER_DAY);
    }

    const questions = await generateQuestions(topics);

    await redis.set(cacheKey, questions, {
      ex: USE_MOCK_AI ? 60 * 10 : 60 * 60 * 25,
    });

    console.log(
      `[REDIS] Saved ${questions.length} questions for "${topics.join(
        ", "
      )}" (${userId}) (${CACHE_ENV_PREFIX})`
    );

    return questions;
  } finally {
    await redis.del(lockKey);
    console.log(
      `[REDIS] Released lock for "${topics.join(", ")}" (${userId})`
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (IS_PRODUCTION) {
      const { valid, errors } = validateConfig();
      if (!valid) {
        console.error("[API] Server misconfigured");
        return NextResponse.json(
          { error: "Server misconfigured", details: errors },
          { status: 500 }
        );
      }
    }

    const redisHealth = await checkRedisHealth();
    if (!redisHealth.ok && IS_PRODUCTION) {
      console.error("[API] Redis unavailable:", redisHealth.error);
      return NextResponse.json(
        { error: "Cache service unavailable. Please try again." },
        { status: 503 }
      );
    }

    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        {
          error: "Unauthorized: Please log in first",
        },
        {
          status: 401,
        }
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
        }
      );
    }

    const cacheKey = getCacheKey(normalized, userId);
    console.log(`[REDIS] Checking cache: ${cacheKey}`);

    const cached = await redis.get<string[]>(cacheKey);

    if (cached && cached.length >= QUESTIONS_PER_DAY) {
      console.log(
        `[REDIS] CACHE HIT: ${normalized.join(", ")} (${userId})`
      );
      return NextResponse.json({
        questions: cached.slice(0, QUESTIONS_PER_DAY),
      });
    }

    console.log(
      `[REDIS] CACHE MISS: ${normalized.join(", ")} (${userId})`
    );

    const { success } = await ratelimit.limit(userId);

    if (!success) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
        },
        {
          status: 429,
        }
      );
    }

    const questions = await generateQuestionsWithLock(normalized, userId);

    return NextResponse.json({
      questions,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error("[API] ERROR:");
    console.error("  Message:", errorMessage);
    console.error(
      "  Stack:",
      error instanceof Error ? error.stack : "N/A"
    );

    if (errorMessage.includes("GEMINI_API_KEY")) {
      return NextResponse.json(
        { error: "Gemini API not configured (server error)" },
        { status: 500 }
      );
    }

    if (errorMessage.includes("GROQ_API_KEY")) {
      return NextResponse.json(
        { error: "Groq API not configured (server error)" },
        { status: 500 }
      );
    }

    if (errorMessage.includes("All AI providers failed")) {
      return NextResponse.json(
        {
          error: "All AI providers failed. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    if (errorMessage.includes("timed out")) {
      return NextResponse.json(
        { error: "Request timed out. Please try again." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "Couldn't load questions. Please try again.",
      },
      {
        status: 500,
      }
    );
  }
}