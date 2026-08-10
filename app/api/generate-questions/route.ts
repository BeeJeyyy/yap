import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis'

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

const redis = Redis.fromEnv();

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
    return data.questions;
}

export async function POST(req: NextRequest) {
    const { topic }: RequestBody = await req.json();

    if(!topic) {
        return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    }

    const cacheKey = getCacheKey(topic);

    try {
        const cached = await redis.get<string[]>(cacheKey);

        if(cached && cached.length > 0) {
            return NextResponse.json({ questions: cached });
        }

        const questions = await generateQuestions(topic);

        await redis.set(cacheKey, questions, { ex: 60 * 60 * 25 });

        return NextResponse.json({ questions });
    } catch(err) {
        console.error("Error in generate-questions:", err);
        return NextResponse.json(
            { error: "Couldn't load questions" },
            { status: 500 }
        );
    }
}