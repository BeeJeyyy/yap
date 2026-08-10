interface QuestionsResponse {
    questions: string[];
}

async function fetchQuestions(topic: string): Promise<string[]> {
    const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
    });

    if(!res.ok) {
        throw new Error("Failed to fetch questions");
    }

    const data: QuestionsResponse = await res.json();
    return data.questions;
}