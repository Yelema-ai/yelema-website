import { instanceFetch, agent37 } from "@/lib/agent37";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export interface TranscriptionResult {
  text: string;
  provider?: string;
}

/**
 * Transcribe an audio recording using high-speed cloud providers (Groq 400ms, OpenAI)
 * or Hermes native STT (local faster-whisper, instance endpoint).
 */
export async function transcribeAudio(
  agentId: string,
  audioBuffer: Buffer,
  mimeType: string,
  filename: string = "recording.webm"
): Promise<TranscriptionResult> {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : ".webm";
  const base64Data = audioBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  // 1. High-Speed Cloud STT (Groq Whisper ~400ms)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), filename);
      formData.append("model", "whisper-large-v3-turbo");

      const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      });

      if (groqRes.ok) {
        const groqData = (await groqRes.json()) as { text?: string };
        const text = (groqData.text || "").trim();
        return { text, provider: "groq" };
      } else {
        const err = await groqRes.text().catch(() => "");
        console.warn(`[transcribe] Groq error ${groqRes.status}:`, err);
      }
    } catch (groqErr) {
      console.warn(`[transcribe] Groq request error:`, (groqErr as Error).message);
    }
  }

  // 2. OpenAI Whisper
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), filename);
      formData.append("model", "whisper-1");

      const oaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });

      if (oaiRes.ok) {
        const oaiData = (await oaiRes.json()) as { text?: string };
        return { text: (oaiData.text || "").trim(), provider: "openai" };
      }
    } catch (oaiErr) {
      console.warn(`[transcribe] OpenAI error:`, (oaiErr as Error).message);
    }
  }

  // 3. DeepInfra Whisper
  const deepInfraKey = process.env.DEEPINFRA_API_KEY;
  if (deepInfraKey) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), filename);
      formData.append("model", "openai/whisper-large-v3-turbo");

      const diRes = await fetch("https://api.deepinfra.com/v1/openai/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${deepInfraKey}` },
        body: formData,
      });

      if (diRes.ok) {
        const diData = (await diRes.json()) as { text?: string };
        return { text: (diData.text || "").trim(), provider: "deepinfra" };
      }
    } catch (diErr) {
      console.warn(`[transcribe] DeepInfra error:`, (diErr as Error).message);
    }
  }

  // 4. Hermes instance native endpoint (/api/audio/transcribe)
  try {
    const res = await instanceFetch(agentId, "/api/audio/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_url: dataUrl, mime_type: mimeType }),
    });

    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; transcript?: string; text?: string; provider?: string };
      const transcript = (data.transcript ?? data.text ?? "").trim();
      return { text: transcript, provider: data.provider || "hermes-api" };
    }
  } catch (err) {
    console.warn(`[transcribe] instanceFetch direct endpoint failed for ${agentId}:`, (err as Error).message);
  }

  // 5. Local Hermes environment execution (faster-whisper)
  const hermesPythonPaths = [
    path.join(os.homedir(), ".hermes", "hermes-agent", "venv", "bin", "python"),
    "/usr/local/lib/hermes/hermes-agent/venv/bin/python",
    "python3",
  ];

  let localPython: string | null = null;
  for (const p of hermesPythonPaths) {
    try {
      await fs.access(p);
      localPython = p;
      break;
    } catch {
      // continue
    }
  }

  if (localPython) {
    const tempAudioPath = path.join(os.tmpdir(), `yelema-stt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`);
    const tempPyPath = path.join(os.tmpdir(), `yelema-stt-exec-${Date.now()}.py`);
    try {
      await fs.writeFile(tempAudioPath, audioBuffer);
      const hermesDir = path.join(os.homedir(), ".hermes", "hermes-agent");

      const pyScript = `import sys, json
sys.path.append(r"${hermesDir}")
sys.path.append(r"/usr/local/lib/hermes/hermes-agent")
try:
    from tools.transcription_tools import transcribe_audio
    res = transcribe_audio(r"${tempAudioPath}")
    print(json.dumps(res))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

      await fs.writeFile(tempPyPath, pyScript);
      const { stdout } = await execAsync(`"${localPython}" "${tempPyPath}"`, {
        timeout: 45000,
      });

      const parsed = JSON.parse(stdout.trim() || "{}") as {
        success?: boolean;
        transcript?: string;
        error?: string;
        provider?: string;
      };

      if (parsed.success) {
        return {
          text: (parsed.transcript || "").trim(),
          provider: parsed.provider || "hermes-local",
        };
      }
      console.warn(`[transcribe] local python script reported:`, parsed.error);
    } catch (localErr) {
      console.warn(`[transcribe] local python exec error:`, (localErr as Error).message);
    } finally {
      await fs.unlink(tempAudioPath).catch(() => {});
      await fs.unlink(tempPyPath).catch(() => {});
    }
  }

  // 6. Gemini Multimodal Fallback
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data,
                    },
                  },
                  {
                    text: "Transcris exactement en texte ce qui est dit dans cet enregistrement audio sans aucun commentaire.",
                  },
                ],
              },
            ],
          }),
        }
      );

      if (geminiRes.ok) {
        const geminiData = (await geminiRes.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (text) {
          return { text, provider: "gemini" };
        }
      }
    } catch (geminiErr) {
      console.warn(`[transcribe] Gemini fallback error:`, (geminiErr as Error).message);
    }
  }

  throw new Error("Impossible de transcrire l'audio. Vérifiez la configuration du service de transcription.");
}
