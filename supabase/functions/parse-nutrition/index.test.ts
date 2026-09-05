import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import app from "./index.ts";

Deno.env.set("SUPABASE_URL", "https://mock.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "mock-anon-key");

Deno.test("parse-nutrition should return 401 when Authorization header is missing or not Bearer", async () => {
    const reqMissing = new Request("http://localhost/parse-nutrition", {
        method: "POST",
        body: JSON.stringify({ input: "Had 3 eggs" })
    });

    const resMissing = await app.fetch(reqMissing);
    assertEquals(resMissing.status, 401);
    const dataMissing = await resMissing.json();
    assertEquals(dataMissing.error, "Missing or invalid Authorization header. Authentication required.");

    const reqInvalid = new Request("http://localhost/parse-nutrition", {
        method: "POST",
        headers: { "Authorization": "Basic 12345" },
        body: JSON.stringify({ input: "Had 3 eggs" })
    });

    const resInvalid = await app.fetch(reqInvalid);
    assertEquals(resInvalid.status, 401);
    const dataInvalid = await resInvalid.json();
    assertEquals(dataInvalid.error, "Missing or invalid Authorization header. Authentication required.");
});

Deno.test("parse-nutrition should return 401 when token is invalid or rejected by Supabase Auth", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | Request | URL): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ message: "Invalid JWT" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input);
    };

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer counterfeit-invalid-token" },
            body: JSON.stringify({ input: "3 eggs" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 401);
        const data = await res.json();
        assertEquals(data.error, "Unauthorized: Invalid token");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("parse-nutrition should return 400 when input text is empty", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | Request | URL): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input);
    };

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: "   " })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 400);

        const data = await res.json();
        assertEquals(data.error, "Input text is required for nutrition parsing.");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("parse-nutrition should return valid JSON macro payload when authorized", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    const originalFetch = globalThis.fetch;
    const mockFetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("generativelanguage.googleapis.com")) {
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "3 Eggs",
                                        calories: 210,
                                        protein: 18,
                                        carbs: 2,
                                        fat: 15,
                                        fiber: 0,
                                        explanation: "3 large eggs (210 kcal, 18g P, 2g C, 15g F)",
                                        items: [
                                            {
                                                name: "Eggs",
                                                portion: "3 large",
                                                calories: 210,
                                                protein: 18,
                                                carbs: 2,
                                                fat: 15,
                                                fiber: 0
                                            }
                                        ]
                                    })
                                }
                            ]
                        }
                    }
                ]
            };
            return new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input, init);
    };

    globalThis.fetch = mockFetch;

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: "Had 3 eggs", custom_dishes: [{ name: "Protein Shake", calories: 300 }] })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertExists(data.calories);
        assertEquals(data.calories, 210);
        assertEquals(data.protein, 18);
        assertEquals(data.fiber, 0);
        assertExists(data.name);
        assertEquals(data.name, "3 Eggs");
        assertExists(data.items);
        assertEquals(data.items.length, 1);
        assertEquals(data.items[0].name, "Eggs");
        assertExists(data.explanation);

    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition should strip markdown code fences from Gemini response", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    const originalFetch = globalThis.fetch;
    const mockFetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("generativelanguage.googleapis.com")) {
            const rawPayload = {
                name: "Oatmeal Bowl",
                calories: 350,
                protein: 12,
                carbs: 60,
                fat: 6,
                fiber: 8,
                explanation: "Oats with berries",
                items: [
                    { name: "Oats", portion: "1 cup", calories: 300, protein: 10, carbs: 54, fat: 5, fiber: 7 },
                    { name: "Berries", portion: "0.5 cup", calories: 50, protein: 2, carbs: 6, fat: 1, fiber: 1 }
                ]
            };
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: "```json\n" + JSON.stringify(rawPayload) + "\n```"
                                }
                            ]
                        }
                    }
                ]
            };
            return new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input, init);
    };

    globalThis.fetch = mockFetch;

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: "1 cup oatmeal and berries" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "Oatmeal Bowl");
        assertEquals(data.calories, 350);
        assertEquals(data.fiber, 8);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition should return 500 when Gemini API encounters a rate limit or service error", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    const originalFetch = globalThis.fetch;
    const mockFetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("generativelanguage.googleapis.com")) {
            return new Response(JSON.stringify({ error: { message: "Resource has been exhausted (rate limit 429)" } }), {
                status: 429,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input, init);
    };

    globalThis.fetch = mockFetch;

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: "Had 3 eggs" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 500);

        const data = await res.json();
        assertEquals(data.error, "Failed to parse meal nutrition. Please check your connection or use manual entry.");
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition handles conversational multi-dish meal input (Com Tam & Eggs) and elaborates dishes into components", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    const originalFetch = globalThis.fetch;
    const mockFetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("generativelanguage.googleapis.com")) {
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Com Tam & Eggs",
                                        calories: 650,
                                        protein: 38,
                                        carbs: 70,
                                        fat: 23,
                                        fiber: 1,
                                        explanation: "300 kcal (Broken Rice) + 260 kcal (Grilled Pork Chop) + 90 kcal (Fried Egg) = 650 kcal",
                                        items: [
                                            { name: "Broken Rice (Cơm Tấm)", portion: "1.5 cups (240g)", calories: 300, protein: 6, carbs: 65, fat: 1, fiber: 1 },
                                            { name: "Grilled Pork Chop (Sườn Nướng)", portion: "1 chop (120g)", calories: 260, protein: 26, carbs: 4, fat: 15, fiber: 0 },
                                            { name: "Fried Egg", portion: "1 large", calories: 90, protein: 6, carbs: 1, fat: 7, fiber: 0 }
                                        ]
                                    })
                                }
                            ]
                        }
                    }
                ]
            };
            return new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input, init);
    };

    globalThis.fetch = mockFetch;

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: "I ate Com Tam & Eggs" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "Com Tam & Eggs");
        assertEquals(data.calories, 650);
        assertEquals(data.items.length, 3);
        assertEquals(data.items[0].name, "Broken Rice (Cơm Tấm)");
        assertEquals(data.items[1].name, "Grilled Pork Chop (Sườn Nướng)");
        assertEquals(data.items[2].name, "Fried Egg");
        assertEquals(data.items[1].protein, 26);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition accurately preserves pre-analyzed structured breakdown text verbatim", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    const structuredInput = `Food Item: High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)
Total Portion Size: 510 g

Component Breakdown:
* Scrambled Egg White (with hot sauce & black pepper): 150 g | 87 kcal | 14 g P | 1 g C | 3 g F | 0 g Fiber
* Sliced Turkey Breast: 60 g | 80 kcal | 10 g P | 1 g C | 4 g F | 0 g Fiber
* Smoked Salmon: 50 g | 68 kcal | 8 g P | 0 g C | 4 g F | 0 g Fiber
* Chocolate Coconut Chia Pudding: 150 g | 227 kcal | 5 g P | 18 g C | 15 g F | 8 g Fiber
* 2% Plain Greek Yogurt: 100 g | 88 kcal | 9 g P | 4 g C | 4 g F | 0 g Fiber

Total Calories: 550 kcal
Total Protein: 46 g
Total Carbs: 24 g
Total Fat: 30 g
Total Fiber: 8 g`;

    const originalFetch = globalThis.fetch;
    const mockFetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("generativelanguage.googleapis.com")) {
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)",
                                        calories: 550,
                                        protein: 46,
                                        carbs: 24,
                                        fat: 30,
                                        fiber: 8,
                                        explanation: "87 kcal (Egg White) + 80 kcal (Turkey) + 68 kcal (Salmon) + 227 kcal (Chia) + 88 kcal (Yogurt) = 550 kcal",
                                        items: [
                                            { name: "Scrambled Egg White (with hot sauce & black pepper)", portion: "150 g", calories: 87, protein: 14, carbs: 1, fat: 3, fiber: 0 },
                                            { name: "Sliced Turkey Breast", portion: "60 g", calories: 80, protein: 10, carbs: 1, fat: 4, fiber: 0 },
                                            { name: "Smoked Salmon", portion: "50 g", calories: 68, protein: 8, carbs: 0, fat: 4, fiber: 0 },
                                            { name: "Chocolate Coconut Chia Pudding", portion: "150 g", calories: 227, protein: 5, carbs: 18, fat: 15, fiber: 8 },
                                            { name: "2% Plain Greek Yogurt", portion: "100 g", calories: 88, protein: 9, carbs: 4, fat: 4, fiber: 0 }
                                        ]
                                    })
                                }
                            ]
                        }
                    }
                ]
            };
            return new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input, init);
    };

    globalThis.fetch = mockFetch;

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: structuredInput })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)");
        assertEquals(data.calories, 550);
        assertEquals(data.protein, 46);
        assertEquals(data.carbs, 24);
        assertEquals(data.fat, 30);
        assertEquals(data.fiber, 8);
        assertEquals(data.items.length, 5);
        assertEquals(data.items[0].calories, 87);
        assertEquals(data.items[3].name, "Chocolate Coconut Chia Pudding");
        assertEquals(data.items[3].fiber, 8);
        assertEquals(data.items[4].name, "2% Plain Greek Yogurt");
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition seamlessly falls back to secondary model when primary model encounters 503 or 404", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    const mockFetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("generativelanguage.googleapis.com")) {
            callCount += 1;
            if (urlString.includes("gemini-3.6-flash")) {
                // First candidate model fails with 503
                return new Response(JSON.stringify({ error: { code: 503, message: "Model is currently experiencing high demand" } }), {
                    status: 503,
                    headers: { "Content-Type": "application/json" }
                });
            }
            // Fallback candidate model (gemini-3.5-flash) succeeds
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Com Tam & Eggs",
                                        calories: 650,
                                        protein: 38,
                                        carbs: 70,
                                        fat: 23,
                                        fiber: 1,
                                        explanation: "Broken rice, pork chop, and egg",
                                        items: [
                                            { name: "Broken Rice (Cơm Tấm)", portion: "1.5 cups (240g)", calories: 300, protein: 6, carbs: 65, fat: 1, fiber: 1 },
                                            { name: "Grilled Pork Chop (Sườn Nướng)", portion: "1 chop (120g)", calories: 260, protein: 26, carbs: 4, fat: 15, fiber: 0 },
                                            { name: "Fried Egg", portion: "1 large", calories: 90, protein: 6, carbs: 1, fat: 7, fiber: 0 }
                                        ]
                                    })
                                }
                            ]
                        }
                    }
                ]
            };
            return new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input, init);
    };

    globalThis.fetch = mockFetch;

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: "Com Tam & Eggs" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "Com Tam & Eggs");
        assertEquals(data.calories, 650);
        assertEquals(data.items.length, 3);
        // Verify at least 2 models were attempted
        assertEquals(callCount >= 2, true);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition preserves structured breakdown text with portion size and macros even when all AI models fail", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    const structuredInput = `+++++++++
Food Item: High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)
Total Portion Size: 510 g

Component Breakdown:
* Scrambled Egg White (with hot sauce & black pepper): 150 g | 87 kcal | 14 g P | 1 g C | 3 g F | 0 g Fiber
* Sliced Turkey Breast: 60 g | 80 kcal | 10 g P | 1 g C | 4 g F | 0 g Fiber
* Smoked Salmon: 50 g | 68 kcal | 8 g P | 0 g C | 4 g F | 0 g Fiber
* Chocolate Coconut Chia Pudding: 150 g | 227 kcal | 5 g P | 18 g C | 15 g F | 8 g Fiber
* 2% Plain Greek Yogurt: 100 g | 88 kcal | 9 g P | 4 g C | 4 g F | 0 g Fiber

Total Calories: 550 kcal
Total Protein: 46 g
Total Carbs: 24 g
Total Fat: 30 g
Total Fiber: 8 g
+++++++++`;

    const originalFetch = globalThis.fetch;
    const mockFetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "mock-user-id", email: "athlete@cybergym.io" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("generativelanguage.googleapis.com")) {
            // All AI model attempts fail
            return new Response(JSON.stringify({ error: { code: 503, message: "AI Service Unavailable" } }), {
                status: 503,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input, init);
    };

    globalThis.fetch = mockFetch;

    try {
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({ input: structuredInput })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)");
        assertEquals(data.calories, 550);
        assertEquals(data.protein, 46);
        assertEquals(data.carbs, 24);
        assertEquals(data.fat, 30);
        assertEquals(data.fiber, 8);
        assertEquals(data.serving_size, 510);
        assertEquals(data.serving_unit, "g");
        assertEquals(data.items.length, 5);
        assertEquals(data.items[0].name, "Scrambled Egg White (with hot sauce & black pepper)");
        assertEquals(data.items[3].calories, 227);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});



