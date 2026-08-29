export async function fetchQuestions(
  topic: string,
  userId: string
): Promise<string[]> {
  if (!userId) {
    throw new Error("User not authenticated");
  }

  // ✅ Use localStorage instead (persists across tabs)
  const cacheKey = `yapcard_${topic}_${userId}`;
  const cached = localStorage.getItem(cacheKey);
  
  if (cached) {
    console.log(`✅ From localStorage: ${topic}`);
    return JSON.parse(cached);
  }

  console.log(`🔄 Fetching from API: ${topic}`);

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
    throw new Error(data?.error || "Failed to fetch questions");
  }

  if (!Array.isArray(data.questions)) {
    throw new Error("Invalid questions response");
  }

  // ✅ Save to localStorage (survives tab switches)
  localStorage.setItem(cacheKey, JSON.stringify(data.questions));
  console.log(`💾 Saved to localStorage: ${topic}`);

  return data.questions;
}

// Call this when user logs out
export function clearQuestionsCache() {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('yapcard_')) {
      localStorage.removeItem(key);
    }
  });
  console.log("🧹 Cleared questions cache");
}