function isInstructionText(text: string): boolean {
  const instructionPatterns = [
    /^(getting|making|being|creating|overuse|using|avoid|ensure|verify)\s+/i,
    /—/,
    /^bad example/i,
    /^common mistake/i,
    /should\s+(be|not be|avoid|use|never|always)/i,
    /^(getting|making|becoming|being|over-?)(.*?)—/i,
    /^(do|dont|don't|avoid|never|always)[\s:]/i,
    /^(ensure|verify|validate|check|confirm)\s+/i,
    /is\s+not\s+[a-z]+,\s+it'/i,
    /^(when|at\s+what\s+point|under\s+what)\s+.*—/i,
  ];

  const trimmed = text.trim().toLowerCase();

  return instructionPatterns.some(pattern => pattern.test(trimmed));
}

export async function fetchQuestions(
  topic: string,
  userId: string
): Promise<string[]> {
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const cacheKey = `yapcard_${topic}_${userId}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    console.log(`From localStorage: ${topic}`);
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(q => !isInstructionText(q));
        if (valid.length === parsed.length) {
          return parsed;
        } else {
          console.warn(`Cached data contained invalid items, removing cache`);
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (e) {
      console.error(`Failed to parse cached questions: ${e}`);
      localStorage.removeItem(cacheKey);
    }
  }

  console.log(`Fetching from API: ${topic}`);

  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({
        topics: topic,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || `API error: ${res.status}`);
    }

    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("Invalid or empty questions response");
    }

    const validQuestions = data.questions.filter((q: string) => {
      if (typeof q !== "string") {
        console.warn(`Filtered out non-string: ${typeof q}`);
        return false;
      }

      const trimmed = q.trim();

      if (isInstructionText(trimmed)) {
        console.warn(`Filtered out instruction text: "${trimmed}"`);
        return false;
      }

      if (!trimmed.includes("?")) {
        console.warn(`Filtered out non-question: "${trimmed}"`);
        return false;
      }

      if (trimmed.length < 8 || trimmed.length > 150) {
        console.warn(`Filtered out invalid length (${trimmed.length}): "${trimmed}"`);
        return false;
      }

      return true;
    });

    if (validQuestions.length === 0) {
      console.error("CRITICAL: No valid questions after filtering", {
        totalReceived: data.questions.length,
        sampleQuestions: data.questions.slice(0, 3),
      });
      throw new Error("No valid questions received from API - all questions failed validation");
    }

    if (validQuestions.length < data.questions.length) {
      const filtered = data.questions.length - validQuestions.length;
      console.warn(
        `WARNING: Filtered out ${filtered} invalid question(s)`,
        {
          received: data.questions.length,
          valid: validQuestions.length,
          ratio: `${((validQuestions.length / data.questions.length) * 100).toFixed(1)}%`,
        }
      );
    }

    localStorage.setItem(cacheKey, JSON.stringify(validQuestions));
    console.log(`Saved to localStorage: ${topic}`);

    return validQuestions;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch questions: ${errorMsg}`);
    throw error;
  }
}

export async function fetchMultipleTopics(
  topics: string[],
  userId: string
): Promise<Record<string, string[]>> {
  const results: Record<string, string[]> = {};
  const errors: Record<string, string> = {};

  for (const topic of topics) {
    try {
      results[topic] = await fetchQuestions(topic, userId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors[topic] = errorMsg;
      console.error(`Failed to fetch ${topic}: ${errorMsg}`);
    }
  }

  if (Object.keys(errors).length > 0) {
    console.warn("Errors fetching some topics:", errors);
  }

  return results;
}

export function clearQuestionsCacheForTopic(topic: string, userId?: string) {
  if (userId) {
    const cacheKey = `yapcard_${topic}_${userId}`;
    localStorage.removeItem(cacheKey);
    console.log(`Cleared cache for ${topic}`);
  } else {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith("yapcard_")) {
        localStorage.removeItem(key);
      }
    });
    console.log("Cleared all questions cache");
  }
}

export function clearAllQuestionsCache() {
  const keys = Object.keys(localStorage);
  let cleared = 0;

  keys.forEach((key) => {
    if (key.startsWith("yapcard_")) {
      localStorage.removeItem(key);
      cleared++;
    }
  });

  console.log(`Cleared ${cleared} cached question sets`);
}

export function getQuestionsGacheStats(): {
  totalCached: number;
  topics: string[];
  cacheSize: string;
} {
  const keys = Object.keys(localStorage);
  const cachedKeys = keys.filter((k) => k.startsWith("yapcard_"));

  let totalSize = 0;
  cachedKeys.forEach((key) => {
    const item = localStorage.getItem(key);
    if (item) {
      totalSize += item.length;
    }
  });

  const topics = Array.from(
    new Set(
      cachedKeys.map((key) => {
        const parts = key.split("_");
        return parts[1];
      })
    )
  );

  return {
    totalCached: cachedKeys.length,
    topics,
    cacheSize: `${(totalSize / 1024).toFixed(2)} KB`,
  };
}

export async function prefetchQuestions(
  topics: string[],
  userId: string
): Promise<void> {
  console.log(`Prefetching ${topics.length} topics...`);

  for (const topic of topics) {
    try {
      await fetchQuestions(topic, userId);
    } catch (error) {
      console.warn(`Prefetch failed for ${topic}:`, error);
    }
  }

  console.log("Prefetch complete");
}

export async function refreshQuestions(
  topic: string,
  userId: string
): Promise<string[]> {
  console.log(`Refreshing ${topic}...`);

  const cacheKey = `yapcard_${topic}_${userId}`;
  localStorage.removeItem(cacheKey);

  const questions = await fetchQuestions(topic, userId);
  console.log(`Refreshed ${topic}`);

  return questions;
}

export function getCachedQuestions(topic: string, userId: string): string[] | null {
  const cacheKey = `yapcard_${topic}_${userId}`;
  const cached = localStorage.getItem(cacheKey);

  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return null;

    const valid = parsed.filter(q => !isInstructionText(q));
    if (valid.length === parsed.length) {
      return parsed;
    } else {
      localStorage.removeItem(cacheKey);
      return null;
    }
  } catch {
    return null;
  }
}

export function hasQuestionsInCache(topic: string, userId: string): boolean {
  const questions = getCachedQuestions(topic, userId);
  return questions !== null && questions.length > 0;
}