import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis'
import { Ratelimit }  from '@upstash/ratelimit';

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

const redis = Redis.fromEnv();

const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix: "ratelimit:generate-questions",
})

interface RequestBody {
    topic: string,
}

interface ResponseData {
    questions: string[];
}

const deckModelMap: Record<string, string> = {
    comfort: "anthropic/claude-haiku-4.5",
    icebreakers: "openai/gpt-4o-mini",
    deeptalk: "openai/gpt-4o",
    couples: "anthropic/claude-haiku-4.5",
    family: "openai/gpt-4o-mini",
    friends: "openai/gpt-4o-mini",
    self: "openai/gpt-4o",
    funny: "openai/gpt-4o-mini",
    career: "openai/gpt-4o",
    nostalgia: "anthropic/claude-haiku-4.5",
};

const VALID_TOPICS = Object.keys(deckModelMap);

function isValidTopic(topic: unknown): topic is string {
    return typeof topic === 'string' && VALID_TOPICS.includes(topic);
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const QUESTIONS_PER_DAY = 30;

function getCacheKey(topic: string): string {
    const today = new Date().toISOString().split("T")[0];
    return `questions:${topic}:${today}`;
}

async function generateQuestions(topic: string): Promise<string[]> {
    const model = deckModelMap[topic] ?? DEFAULT_MODEL;

    const completion = await openai.chat.completions.create({
        model,
        max_tokens: 2500,
        messages: [
            {
                role: "system",
                content: 
                "You are generating conversation card questions for an app called Yap. Tone: warm, reflective, emotionally safe. Return ONLY raw JSON (no markdown, no code fences, no commentary) matching this exact shape: {\"questions\": string[]}.",
            },
            {
                role: "user",
                content: `Generate ${QUESTIONS_PER_DAY} unique questions on the topic: ${topic}`,
            },
        ],
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;

    if(!content) {
        throw new Error("No content returned from model.");
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if(!jsonMatch) {
        throw new Error("No JSON found in model output");
    }

    const data: ResponseData = JSON.parse(jsonMatch[0]);

    if(!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("Model returned no questions");
    }

    if(data.questions.length < QUESTIONS_PER_DAY) {
        throw new Error(
            `Model returned only ${data.questions.length} questions, expected ${QUESTIONS_PER_DAY}`
        );
    }
    return data.questions.slice(0, QUESTIONS_PER_DAY);
}

async function generateQuestionsWithLock(topic: string): Promise<string[]> {
    const cacheKey = getCacheKey(topic);
    const lockKey = `lock:${cacheKey}`;

    const gotLock = await redis.set(lockKey, "1", { nx: true, ex:15 });

    if(!gotLock) {
        await new Promise((r) => setTimeout(r, 1500));
        const cached = await redis.get<string[]>(cacheKey);
        if(cached && cached.length > 0) return cached;
    }

    try {
        const questions = await generateQuestions(topic);
        await redis.set(cacheKey, questions, { ex: 60 * 60 * 25 });
        return questions;
    } finally {
        await redis.del(lockKey);
    }
}

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    const { success } = await ratelimit.limit(ip);
    if(!success) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    } 

    const { topic }: RequestBody = await req.json();

    if(!isValidTopic(topic)) {
        return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
    }

    const cacheKey = getCacheKey(topic);

    try {
        const cached = await redis.get<string[]>(cacheKey);

        if(cached && cached.length > 0) {
            return NextResponse.json({ questions: cached.slice(0, QUESTIONS_PER_DAY) });
        }

        const questions = await generateQuestionsWithLock(topic);

        return NextResponse.json({ questions });
    } catch(err) {
        console.error("Error in generate-questions:", err);
        return NextResponse.json(
            { error: "Couldn't load questions" },
            { status: 500 }
        );
    }
}