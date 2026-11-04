import { requireUser } from "@/lib/auth";
import { handleError, noStore, readJson } from "@/lib/http";
import { createVideoTask, type GenerateVideoParams } from "@/lib/moneyprinter";

export const maxDuration = 60;

/**
 * POST /api/videos/generate
 * Déclenche la création d'une vidéo via MoneyPrinterTurbo.
 */
export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await readJson<GenerateVideoParams>(request);
    const result = await createVideoTask(body);
    return noStore(result);
  } catch (e) {
    return handleError(e);
  }
}
