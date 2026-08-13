export async function fetchQuestions(topic: string): Promise<string[]> {
    const res = await fetch("/api/questions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            topic,
        }),
    });

    const data = await res.json();

    if(!res.ok) {
        throw new Error(
            data?.error || "Failed to fetch questions"
        );
    }

    if(!Array.isArray(data.questions)) {
        throw new Error("Invalid questions response");
    }

    return data.questions;
}