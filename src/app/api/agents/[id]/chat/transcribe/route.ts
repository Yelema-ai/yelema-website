import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { transcribeAudio } from "@/lib/transcription";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

export async function POST(request: Request, { params}: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);

    const contentType = request.headers.get("content-type") || "";
    let buffer: Buffer;
    let mimeType = "audio/webm";
    let filename = "recording.webm";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new ApiError(400, "invalid_request", "Le fichier audio est requis.");
      }
      buffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type || "audio/webm";
      filename = file.name || "recording.webm";
    } else {
      const body = (await request.json().catch(() => ({}))) as {
        data_url?: string;
        mime_type?: string;
      };
      if (!body.data_url) {
        throw new ApiError(400, "invalid_request", "data_url ou fichier audio requis.");
      }
      const [header, b64] = body.data_url.split(",", 2);
      buffer = Buffer.from(b64 || "", "base64");
      mimeType =
        body.mime_type ||
        (header.includes("audio/") ? header.split(":")[1].split(";")[0] : "audio/webm");
    }

    if (buffer.length === 0) {
      throw new ApiError(400, "empty_audio", "L'enregistrement audio est vide.");
    }

    const result = await transcribeAudio(id, buffer, mimeType, filename);
    return json({ ok: true, text: result.text, provider: result.provider });
  } catch (e) {
    return handleError(e);
  }
}