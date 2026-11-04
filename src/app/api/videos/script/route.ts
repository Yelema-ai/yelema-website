import { requireUser } from "@/lib/auth";
import { handleError, noStore, readJson } from "@/lib/http";
import { generateVideoScript, type GenerateScriptParams } from "@/lib/moneyprinter";

export const maxDuration = 60;

/**
 * POST /api/videos/script
 * Génère un script vidéo à partir d'un sujet avec MoneyPrinterTurbo.
 */
export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await readJson<GenerateScriptParams>(request);
    const result = await generateVideoScript(body);
    return noStore(result);
  } catch (e) {
    return handleError(e);
  }
}
