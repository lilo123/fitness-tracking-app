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

Deno.test("parse-nutrition should return 400 when input text and image are both empty", async () => {
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
        assertEquals(data.error, "Input text or meal photo is required for nutrition parsing.");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("parse-nutrition succeeds when input text is empty but image is present", async () => {
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
                                        name: "Avocado Toast",
                                        calories: 320,
                                        protein: 8,
                                        carbs: 35,
                                        fat: 18,
                                        fiber: 7,
                                        explanation: "1 slice avocado toast",
                                        items: [
                                            { name: "Avocado Toast", portion: "1 slice", calories: 320, protein: 8, carbs: 35, fat: 18, fiber: 7 }
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
            body: JSON.stringify({ input: "", image_base64: "iVBORw0KGgoAAAANSUhEUgAA" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "Avocado Toast");
        assertEquals(data.calories, 320);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition should return 400 when request body is malformed JSON", async () => {
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
            body: "invalid-json{{{"
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 400);

        const data = await res.json();
        assertEquals(data.error, "Malformed JSON or payload too large.");
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

Deno.test("parse-nutrition should return 429 with RATE_LIMITED code when Gemini API encounters rate limit", async () => {
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
            return new Response(JSON.stringify({ error: { code: 429, message: "Resource has been exhausted (rate limit 429)" } }), {
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
        assertEquals(res.status, 429);

        const data = await res.json();
        assertEquals(data.code, "RATE_LIMITED");
        assertEquals(data.retryAfter, 15);
        assertExists(data.error);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition should structure multimodal payload with inlineData and route to gemini-3.8-flash", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    let interceptedUrl = "";
    let interceptedBody: any = null;

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
            interceptedUrl = urlString;
            if (init?.body) {
                interceptedBody = JSON.parse(init.body as string);
            }
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Grilled Salmon Bowl",
                                        calories: 520,
                                        protein: 42,
                                        carbs: 45,
                                        fat: 18,
                                        fiber: 5,
                                        explanation: "Fresh salmon with brown rice and broccoli",
                                        items: [
                                            { name: "Salmon", portion: "1 fillet", calories: 280, protein: 34, carbs: 0, fat: 15, fiber: 0 },
                                            { name: "Brown Rice", portion: "1 cup", calories: 200, protein: 5, carbs: 40, fat: 2, fiber: 3 },
                                            { name: "Broccoli", portion: "1 cup", calories: 40, protein: 3, carbs: 5, fat: 1, fiber: 2 }
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
        const testBase64 = "data:image/jpeg;base64,dGVzdC1pbWFnZS1kYXRh";
        const req = new Request("http://localhost/parse-nutrition", {
            method: "POST",
            headers: { "Authorization": "Bearer valid-jwt-token" },
            body: JSON.stringify({
                input: "Salmon bowl for lunch",
                image_base64: testBase64,
                imageMimeType: "image/jpeg"
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "Grilled Salmon Bowl");
        assertEquals(data.calories, 520);
        assertEquals(data.protein, 42);

        // Verify that gemini-3.8-flash was called as the primary vision model
        assertEquals(interceptedUrl.includes("gemini-3.8-flash"), true);

        // Verify that inlineData was properly constructed in the Gemini contents parts
        assertExists(interceptedBody);
        assertExists(interceptedBody.contents);
        const parts = interceptedBody.contents[0].parts;
        assertExists(parts);
        const inlinePart = parts.find((p: any) => p.inlineData);
        assertExists(inlinePart);
        assertEquals(inlinePart.inlineData.mimeType, "image/jpeg");
        assertEquals(inlinePart.inlineData.data, "dGVzdC1pbWFnZS1kYXRh");
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition should return 500 rather than mock 200 data during service outages", async () => {
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
            return new Response(JSON.stringify({ error: { code: 503, message: "Service Unavailable" } }), {
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
            body: JSON.stringify({ input: "Had 2 scoops of whey protein" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 500);

        const data = await res.json();
        assertEquals(data.error, "Failed to parse meal nutrition. Please check your connection or use manual entry.");
        assertEquals(data.calories, undefined);
        assertEquals(data.name, undefined);
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

Deno.test("parse-nutrition detects image/png MIME type automatically from Data URI", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    let interceptedBody: any = null;

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
            if (init?.body) {
                interceptedBody = JSON.parse(init.body as string);
            }
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Fruit Salad",
                                        calories: 150,
                                        protein: 2,
                                        carbs: 38,
                                        fat: 1,
                                        fiber: 5,
                                        explanation: "Mixed berries",
                                        items: [{ name: "Berries", portion: "1 bowl", calories: 150, protein: 2, carbs: 38, fat: 1, fiber: 5 }]
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
            body: JSON.stringify({
                image_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA"
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        assertExists(interceptedBody);
        const inlinePart = interceptedBody.contents[0].parts.find((p: any) => p.inlineData);
        assertExists(inlinePart);
        assertEquals(inlinePart.inlineData.mimeType, "image/png");
        assertEquals(inlinePart.inlineData.data, "iVBORw0KGgoAAAANSUhEUgAA");
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition preserves 429 status and Retry-After header even if fallback model returns 503", async () => {
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
            if (urlString.includes("gemini-3.8-flash")) {
                // Primary vision model encounters 429
                return new Response(JSON.stringify({ error: { code: 429, message: "Resource exhausted" } }), {
                    status: 429,
                    headers: { "Content-Type": "application/json" }
                });
            }
            // Fallback model encounters 503
            return new Response(JSON.stringify({ error: { code: 503, message: "Service Unavailable" } }), {
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
            body: JSON.stringify({
                image_base64: "iVBORw0KGgoAAAANSUhEUgAA"
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 429);
        assertEquals(res.headers.get("Retry-After"), "15");

        const data = await res.json();
        assertEquals(data.code, "RATE_LIMITED");
        assertEquals(data.retryAfter, 15);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition accepts camelCase imageBase64 parameter", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    let interceptedBody: any = null;

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
            if (init?.body) {
                interceptedBody = JSON.parse(init.body as string);
            }
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Greek Salad",
                                        calories: 220,
                                        protein: 6,
                                        carbs: 12,
                                        fat: 18,
                                        fiber: 4,
                                        explanation: "Feta, olives, cucumber",
                                        items: [{ name: "Greek Salad", portion: "1 bowl", calories: 220, protein: 6, carbs: 12, fat: 18, fiber: 4 }]
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
            body: JSON.stringify({
                imageBase64: "dGVzdC1jYW1lbA=="
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        assertExists(interceptedBody);
        const inlinePart = interceptedBody.contents[0].parts.find((p: any) => p.inlineData);
        assertExists(inlinePart);
        assertEquals(inlinePart.inlineData.data, "dGVzdC1jYW1lbA==");
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition exposes Retry-After in Access-Control-Expose-Headers for CORS clients", async () => {
    const reqOptions = new Request("http://localhost/parse-nutrition", {
        method: "OPTIONS",
    });
    const resOptions = await app.fetch(reqOptions);
    assertEquals(resOptions.status, 200);
    assertEquals(resOptions.headers.get("Access-Control-Expose-Headers"), "Retry-After");
});

Deno.test("parse-nutrition falls back to text-only mode when imageBase64 is an empty data URI but input text exists", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    let interceptedBody: any = null;

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
            if (init?.body) {
                interceptedBody = JSON.parse(init.body as string);
            }
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "2 Red Apples",
                                        calories: 190,
                                        protein: 1,
                                        carbs: 50,
                                        fat: 0,
                                        fiber: 8,
                                        explanation: "2 medium apples",
                                        items: [{ name: "Red Apple", portion: "2 medium", calories: 190, protein: 1, carbs: 50, fat: 0, fiber: 8 }]
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
            body: JSON.stringify({
                input: "Had 2 red apples",
                imageBase64: "data:image/jpeg;base64,"
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "2 Red Apples");
        assertEquals(data.calories, 190);

        // Verify it routed to text-only mode without inlineData part
        assertExists(interceptedBody);
        const parts = interceptedBody.contents[0].parts;
        const inlinePart = parts.find((p: any) => p.inlineData);
        assertEquals(inlinePart, undefined);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition returns 400 when input is empty and imageBase64 is an empty data URI", async () => {
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
            body: JSON.stringify({
                input: "   ",
                imageBase64: "data:image/jpeg;base64,"
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 400);

        const data = await res.json();
        assertEquals(data.error, "Input text or meal photo is required for nutrition parsing.");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("parse-nutrition seamlessly falls back to secondary model when primary candidate returns truncated or invalid JSON", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    let callCount = 0;
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
            callCount += 1;
            if (urlString.includes("gemini-3.6-flash")) {
                // Primary model returns truncated/malformed JSON
                return new Response(JSON.stringify({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    { text: "{\"name\": \"Truncated Bowl\", \"calories\": 400, \"items\": [" }
                                ]
                            }
                        }
                    ]
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            // Fallback model returns valid complete JSON
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Healthy Bowl",
                                        calories: 420,
                                        protein: 30,
                                        carbs: 45,
                                        fat: 12,
                                        fiber: 6,
                                        explanation: "Balanced meal",
                                        items: [{ name: "Bowl", portion: "1 bowl", calories: 420, protein: 30, carbs: 45, fat: 12, fiber: 6 }]
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
            body: JSON.stringify({ input: "Healthy Bowl" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "Healthy Bowl");
        assertEquals(data.calories, 420);
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

Deno.test("parse-nutrition falls back to secondary model when primary candidate returns JSON missing nutrition data", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    let callCount = 0;
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
            callCount += 1;
            if (urlString.includes("gemini-3.6-flash")) {
                // Primary model returns valid JSON but empty object missing calories/items
                return new Response(JSON.stringify({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    { text: JSON.stringify({ name: "Incomplete Object" }) }
                                ]
                            }
                        }
                    ]
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            // Fallback model returns valid complete payload
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Complete Salad",
                                        calories: 250,
                                        protein: 10,
                                        carbs: 20,
                                        fat: 14,
                                        fiber: 5,
                                        explanation: "Garden salad with dressing",
                                        items: [{ name: "Salad", portion: "1 bowl", calories: 250, protein: 10, carbs: 20, fat: 14, fiber: 5 }]
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
            body: JSON.stringify({ input: "Garden salad" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        const data = await res.json();
        assertEquals(data.name, "Complete Salad");
        assertEquals(data.calories, 250);
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

Deno.test("parse-nutrition handles data URIs with parameters like data:image/png;name=meal.png;base64,...", async () => {
    const originalKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.set("GEMINI_API_KEY", "test-key");

    let interceptedBody: any = null;
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
            if (init?.body) {
                interceptedBody = JSON.parse(init.body as string);
            }
            const mockResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        name: "Protein Shake",
                                        calories: 220,
                                        protein: 30,
                                        carbs: 10,
                                        fat: 4,
                                        fiber: 2,
                                        explanation: "Whey protein shake",
                                        items: [{ name: "Shake", portion: "1 scoop", calories: 220, protein: 30, carbs: 10, fat: 4, fiber: 2 }]
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
            body: JSON.stringify({
                imageBase64: "data:image/png;name=shake.png;base64,iVBORw0KGgoAAAANSUhEUgAA"
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);

        assertExists(interceptedBody);
        const parts = interceptedBody.contents[0].parts;
        const inlinePart = parts.find((p: any) => p.inlineData);
        assertExists(inlinePart);
        assertEquals(inlinePart.inlineData.mimeType, "image/png");
        assertEquals(inlinePart.inlineData.data, "iVBORw0KGgoAAAANSUhEUgAA");
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) {
            Deno.env.set("GEMINI_API_KEY", originalKey);
        } else {
            Deno.env.delete("GEMINI_API_KEY");
        }
    }
});

Deno.test("parse-nutrition treats data:, as empty image and returns 400 when input is also empty", async () => {
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
            body: JSON.stringify({
                input: "",
                imageBase64: "data:,"
            })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 400);

        const data = await res.json();
        assertEquals(data.error, "Input text or meal photo is required for nutrition parsing.");
    } finally {
        globalThis.fetch = originalFetch;
    }
});




