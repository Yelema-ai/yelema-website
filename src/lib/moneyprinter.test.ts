import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import {
  getMoneyPrinterConfig,
  sanitizeVideoParams,
  sanitizeTaskId,
  createVideoTask,
  getVideoTaskStatus,
  generateVideoScript,
  MoneyPrinterError,
  type MoneyPrinterConfig,
} from "./moneyprinter.ts";

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.MONEYPRINTER_API_URL;
  delete process.env.MONEYPRINTER_API_KEY;
  delete process.env.MONEYPRINTER_DEFAULT_VOICE;
  delete process.env.MONEYPRINTER_DEFAULT_ASPECT;
  delete process.env.MONEYPRINTER_TIMEOUT_MS;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const mockConfig: MoneyPrinterConfig = {
  apiUrl: "http://127.0.0.1:8080",
  apiKey: "secret-token-123",
  defaultVoice: "fr-FR-VivienneMultilingualNeural",
  defaultAspect: "9:16",
  timeoutMs: 5000,
};

test("getMoneyPrinterConfig: returns null when MONEYPRINTER_API_URL is unset", () => {
  assert.equal(getMoneyPrinterConfig(), null);
});

test("getMoneyPrinterConfig: rejects invalid URL with 500 MoneyPrinterError", () => {
  process.env.MONEYPRINTER_API_URL = "not-a-valid-url";
  assert.throws(() => getMoneyPrinterConfig(), (err: unknown) => {
    return err instanceof MoneyPrinterError && err.status === 500 && err.code === "config_error";
  });
});

test("getMoneyPrinterConfig: parses valid config and strips trailing slash", () => {
  process.env.MONEYPRINTER_API_URL = "https://video.yelema.ai/api/";
  process.env.MONEYPRINTER_API_KEY = "test-key";
  process.env.MONEYPRINTER_DEFAULT_VOICE = "fr-FR-HenriNeural";
  process.env.MONEYPRINTER_DEFAULT_ASPECT = "16:9";
  process.env.MONEYPRINTER_TIMEOUT_MS = "12000";

  const cfg = getMoneyPrinterConfig();
  assert.notEqual(cfg, null);
  assert.equal(cfg?.apiUrl, "https://video.yelema.ai/api");
  assert.equal(cfg?.apiKey, "test-key");
  assert.equal(cfg?.defaultVoice, "fr-FR-HenriNeural");
  assert.equal(cfg?.defaultAspect, "16:9");
  assert.equal(cfg?.timeoutMs, 12000);
});

test("sanitizeVideoParams: validates and trims subject", () => {
  assert.throws(
    () => sanitizeVideoParams({ subject: "   " }, mockConfig),
    (err: unknown) => err instanceof MoneyPrinterError && err.code === "invalid_subject" && err.status === 400
  );

  assert.throws(
    () => sanitizeVideoParams({ subject: "a".repeat(501) }, mockConfig),
    (err: unknown) => err instanceof MoneyPrinterError && err.code === "subject_too_long" && err.status === 400
  );

  const clean = sanitizeVideoParams({ subject: "   L'Afrique et l'IA en 2026   " }, mockConfig);
  assert.equal(clean.subject, "L'Afrique et l'IA en 2026");
  assert.equal(clean.aspect, "9:16");
  assert.equal(clean.voiceName, "fr-FR-VivienneMultilingualNeural");
  assert.equal(clean.subtitleEnabled, true);
  assert.equal(clean.videoCount, 1);
});

test("sanitizeVideoParams: validates aspect ratio", () => {
  assert.throws(
    () => sanitizeVideoParams({ subject: "Test", aspect: "4:3" as any }, mockConfig),
    (err: unknown) => err instanceof MoneyPrinterError && err.code === "invalid_aspect" && err.status === 400
  );

  const clean169 = sanitizeVideoParams({ subject: "Test", aspect: "16:9" }, mockConfig);
  assert.equal(clean169.aspect, "16:9");

  const clean11 = sanitizeVideoParams({ subject: "Test", aspect: "1:1" }, mockConfig);
  assert.equal(clean11.aspect, "1:1");
});

test("sanitizeTaskId: prevents path traversal and invalid characters", () => {
  assert.throws(
    () => sanitizeTaskId("../../etc/passwd"),
    (err: unknown) => err instanceof MoneyPrinterError && err.code === "invalid_task_id" && err.status === 400
  );

  assert.throws(
    () => sanitizeTaskId("task with spaces"),
    (err: unknown) => err instanceof MoneyPrinterError && err.code === "invalid_task_id"
  );

  assert.throws(
    () => sanitizeTaskId(""),
    (err: unknown) => err instanceof MoneyPrinterError && err.code === "invalid_task_id"
  );

  assert.equal(sanitizeTaskId("task_1234-abcd"), "task_1234-abcd");
});

test("createVideoTask: throws 503 when service is not configured", async () => {
  await assert.rejects(
    async () => createVideoTask({ subject: "Test" }),
    (err: unknown) => err instanceof MoneyPrinterError && err.status === 503 && err.code === "service_unavailable"
  );
});

test("createVideoTask: sends correct payload and headers to upstream service", async () => {
  const originalFetch = globalThis.fetch;
  let interceptedUrl = "";
  let interceptedMethod = "";
  let interceptedHeaders: any = {};
  let interceptedBody: any = {};

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    interceptedUrl = String(url);
    interceptedMethod = init?.method ?? "GET";
    interceptedHeaders = init?.headers;
    interceptedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ task_id: "test-task-999", status: "processing" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;

  try {
    const res = await createVideoTask(
      {
        subject: "Découverte de Yelema",
        aspect: "9:16",
        voiceName: "fr-FR-HenriNeural",
        script: "Bienvenue sur Yelema.",
      },
      mockConfig
    );

    assert.equal(interceptedUrl, "http://127.0.0.1:8080/api/v1/videos");
    assert.equal(interceptedMethod, "POST");
    assert.equal(interceptedHeaders["x-api-key"], "secret-token-123");
    assert.equal(interceptedBody.video_subject, "Découverte de Yelema");
    assert.equal(interceptedBody.video_aspect, "9:16");
    assert.equal(interceptedBody.voice_name, "fr-FR-HenriNeural");
    assert.equal(interceptedBody.video_script, "Bienvenue sur Yelema.");
    assert.equal(res.taskId, "test-task-999");
    assert.equal(res.status, "processing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getVideoTaskStatus: normalizes status and relative video URL", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        status: "COMPLETED",
        progress: 100,
        result: { video_url: "/storage/tasks/test-task-999/final.mp4" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as any;

  try {
    const status = await getVideoTaskStatus("test-task-999", mockConfig);
    assert.equal(status.taskId, "test-task-999");
    assert.equal(status.status, "completed");
    assert.equal(status.progress, 100);
    assert.equal(status.videoUrl, "http://127.0.0.1:8080/storage/tasks/test-task-999/final.mp4");
    assert.equal(status.error, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getVideoTaskStatus: handles 404 not found cleanly", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response("Not Found", { status: 404 });
  }) as any;

  try {
    await assert.rejects(
      async () => getVideoTaskStatus("missing-task", mockConfig),
      (err: unknown) => err instanceof MoneyPrinterError && err.status === 404 && err.code === "task_not_found"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateVideoScript: sends prompt and parses generated script", async () => {
  const originalFetch = globalThis.fetch;
  let interceptedBody: any = {};

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    interceptedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ video_script: "Voici un script captivant..." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;

  try {
    const res = await generateVideoScript(
      {
        subject: "Intelligence Artificielle en Afrique",
        customSystemPrompt: "Adopte un ton dynamique et inspirant.",
      },
      mockConfig
    );

    assert.equal(interceptedBody.video_subject, "Intelligence Artificielle en Afrique");
    assert.equal(interceptedBody.custom_system_prompt, "Adopte un ton dynamique et inspirant.");
    assert.equal(res.script, "Voici un script captivant...");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
