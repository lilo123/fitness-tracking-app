import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import app from "./index.ts";

Deno.env.set("SUPABASE_URL", "https://mock.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "mock-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "mock-service-role-key");

Deno.test("create-athlete should return 401 when Authorization header is missing or not Bearer", async () => {
    const reqMissing = new Request("http://localhost/create-athlete", {
        method: "POST",
        body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" })
    });

    const resMissing = await app.fetch(reqMissing);
    assertEquals(resMissing.status, 401);
    const dataMissing = await resMissing.json();
    assertEquals(dataMissing.error, "Missing or invalid Authorization header. Authentication required.");

    const reqInvalid = new Request("http://localhost/create-athlete", {
        method: "POST",
        headers: { "Authorization": "Basic 12345" },
        body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" })
    });

    const resInvalid = await app.fetch(reqInvalid);
    assertEquals(resInvalid.status, 401);
    const dataInvalid = await resInvalid.json();
    assertEquals(dataInvalid.error, "Missing or invalid Authorization header. Authentication required.");
});

Deno.test("create-athlete should return 401 when token is rejected by Supabase Auth", async () => {
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
        const req = new Request("http://localhost/create-athlete", {
            method: "POST",
            headers: { "Authorization": "Bearer bad-jwt-token" },
            body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 401);
        const data = await res.json();
        assertEquals(data.error, "Unauthorized: Invalid token");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("create-athlete should return 403 when caller is not a coach", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | Request | URL): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "athlete-caller-id", email: "athlete@example.com" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("/rest/v1/users")) {
            return new Response(JSON.stringify({ role: "athlete" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input);
    };

    try {
        const req = new Request("http://localhost/create-athlete", {
            method: "POST",
            headers: { "Authorization": "Bearer athlete-token" },
            body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.error, "Forbidden: Only coaches can provision athletes");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("create-athlete should return 400 when name is missing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | Request | URL): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "coach-caller-id", email: "coach@example.com" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("/rest/v1/users")) {
            return new Response(JSON.stringify({ role: "coach" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(input);
    };

    try {
        const req = new Request("http://localhost/create-athlete", {
            method: "POST",
            headers: { "Authorization": "Bearer coach-token" },
            body: JSON.stringify({ name: "   ", email: "jane@example.com" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Athlete name is required");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("create-athlete should return 200 when coach successfully provisions an athlete", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | Request | URL): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "coach-caller-id", email: "coach@example.com" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("/rest/v1/users")) {
            return new Response(JSON.stringify({ role: "coach" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("/auth/v1/admin/users")) {
            return new Response(
                JSON.stringify({
                    id: "new-athlete-uuid",
                    email: "jane@example.com",
                    user_metadata: { username: "Jane Doe" }
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                }
            );
        }
        return originalFetch(input);
    };

    try {
        const req = new Request("http://localhost/create-athlete", {
            method: "POST",
            headers: { "Authorization": "Bearer coach-token" },
            body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.success, true);
        assertEquals(data.athlete.id, "new-athlete-uuid");
        assertEquals(data.athlete.name, "Jane Doe");
        assertEquals(data.athlete.email, "jane@example.com");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("create-athlete should return 400 when user creation fails in auth admin (e.g. duplicate email)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | Request | URL): Promise<Response> => {
        const urlString = input.toString();
        if (urlString.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "coach-caller-id", email: "coach@example.com" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("/rest/v1/users")) {
            return new Response(JSON.stringify({ role: "coach" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (urlString.includes("/auth/v1/admin/users")) {
            return new Response(
                JSON.stringify({
                    message: "A user with this email address has already been registered"
                }),
                {
                    status: 422,
                    headers: { "Content-Type": "application/json" }
                }
            );
        }
        return originalFetch(input);
    };

    try {
        const req = new Request("http://localhost/create-athlete", {
            method: "POST",
            headers: { "Authorization": "Bearer coach-token" },
            body: JSON.stringify({ name: "Jane Doe", email: "jane-duplicate@example.com" })
        });

        const res = await app.fetch(req);
        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "A user with this email address has already been registered");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

Deno.test("create-athlete CORS: preflight OPTIONS returns 200 with dynamic origin for allowed origins", async () => {
    const allowed = [
        "https://cybergym.app",
        "capacitor://localhost",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
    ];

    for (const origin of allowed) {
        const req = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": origin },
        });
        const res = await app.fetch(req);
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        assertEquals(res.headers.get("Vary"), "Origin");
        assertEquals(
            res.headers.get("Access-Control-Allow-Headers"),
            "authorization, x-client-info, apikey, content-type"
        );
    }
});

Deno.test("create-athlete CORS: preflight OPTIONS returns 403 and omits allow-origin for disallowed origins", async () => {
    const disallowed = [
        "https://evil.com",
        "https://cybergym.app.attacker.com",
        "http://localhost.attacker.com",
        "http://127.0.0.1.attacker.com",
        "https://random-site.org",
        "null",
    ];

    for (const origin of disallowed) {
        const req = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": origin },
        });
        const res = await app.fetch(req);
        assertEquals(res.status, 403);
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
        assertEquals(res.headers.get("Vary"), "Origin");
        const body = await res.json();
        assertEquals(body.error, "CORS origin not allowed");
    }
});

Deno.test("create-athlete CORS: POST request with disallowed origin is rejected with 403 without processing", async () => {
    const req = new Request("http://localhost/create-athlete", {
        method: "POST",
        headers: {
            "Origin": "https://malicious-website.com",
            "Authorization": "Bearer some-token",
        },
        body: JSON.stringify({ name: "Victim Athlete" }),
    });

    const res = await app.fetch(req);
    assertEquals(res.status, 403);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
    assertEquals(res.headers.get("Vary"), "Origin");
    const body = await res.json();
    assertEquals(body.error, "CORS origin not allowed");
});

Deno.test("create-athlete CORS: POST request with allowed origin returns response with Access-Control-Allow-Origin and Vary", async () => {
    const req = new Request("http://localhost/create-athlete", {
        method: "POST",
        headers: {
            "Origin": "https://cybergym.app",
        },
        body: JSON.stringify({ name: "Jane Doe" }),
    });

    const res = await app.fetch(req);
    // Unauthenticated request should return 401, but include CORS headers for the allowed origin
    assertEquals(res.status, 401);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://cybergym.app");
    assertEquals(res.headers.get("Vary"), "Origin");
});

Deno.test("create-athlete CORS: production environment denies localhost origins and permits production origins", async () => {
    Deno.env.set("DENO_ENV", "production");
    try {
        // Localhost should be rejected in production
        const reqLocalhost = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": "http://localhost:5173" },
        });
        const resLocalhost = await app.fetch(reqLocalhost);
        assertEquals(resLocalhost.status, 403);
        assertEquals(resLocalhost.headers.get("Access-Control-Allow-Origin"), null);

        // 127.0.0.1 should be rejected in production
        const reqIp = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": "http://127.0.0.1:3000" },
        });
        const resIp = await app.fetch(reqIp);
        assertEquals(resIp.status, 403);
        assertEquals(resIp.headers.get("Access-Control-Allow-Origin"), null);

        // Production origins should still be allowed in production
        const reqProd = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": "https://cybergym.app" },
        });
        const resProd = await app.fetch(reqProd);
        assertEquals(resProd.status, 200);
        assertEquals(resProd.headers.get("Access-Control-Allow-Origin"), "https://cybergym.app");

        // Capacitor origin should still be allowed in production
        const reqCap = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": "capacitor://localhost" },
        });
        const resCap = await app.fetch(reqCap);
        assertEquals(resCap.status, 200);
        assertEquals(resCap.headers.get("Access-Control-Allow-Origin"), "capacitor://localhost");
    } finally {
        Deno.env.delete("DENO_ENV");
    }
});

Deno.test("create-athlete CORS: ENVIRONMENT=production also enforces production origins", async () => {
    Deno.env.set("ENVIRONMENT", "production");
    try {
        const reqLocalhost = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": "http://localhost:5173" },
        });
        const resLocalhost = await app.fetch(reqLocalhost);
        assertEquals(resLocalhost.status, 403);
        assertEquals(resLocalhost.headers.get("Access-Control-Allow-Origin"), null);

        const reqProd = new Request("http://localhost/create-athlete", {
            method: "OPTIONS",
            headers: { "Origin": "https://cybergym.app" },
        });
        const resProd = await app.fetch(reqProd);
        assertEquals(resProd.status, 200);
        assertEquals(resProd.headers.get("Access-Control-Allow-Origin"), "https://cybergym.app");
    } finally {
        Deno.env.delete("ENVIRONMENT");
    }
});


