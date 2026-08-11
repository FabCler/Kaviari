import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { AI_UNAVAILABLE_MESSAGE, isAiConfigured } from "@/lib/ai";
import { ImportParseError, parseUpload } from "@/lib/import/parse";
import { analyzeImport, ImportAnalysisError } from "@/lib/import/analyze";
import {
  ACCEPTED_EXTENSIONS,
  IMPORT_MODES,
  MAX_FILE_BYTES,
} from "@/lib/import/types";

export const maxDuration = 120;

const modeSchema = z.enum(IMPORT_MODES);

/**
 * POST /api/import/analyze — multipart/form-data { file, mode }.
 * Parses the file, asks the AI to map it, verifies the result against the
 * catalog and returns a preview. NOTHING is written to the database here.
 */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isAiConfigured()) {
    return Response.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart/form-data upload." },
      { status: 400 }
    );
  }

  const modeParsed = modeSchema.safeParse(form.get("mode"));
  if (!modeParsed.success) {
    return Response.json({ error: "Invalid import mode." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: "The file is larger than 10 MB. Split it or export a lighter version." },
      { status: 413 }
    );
  }
  const filename = file.name || "upload";
  const lower = filename.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return Response.json(
      { error: "Unsupported file type. Upload a .xlsx, .xls, .csv or .pdf file." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { content, notices } = await parseUpload(buffer, filename);
    const result = await analyzeImport({
      mode: modeParsed.data,
      parsed: content,
      filename,
      notices,
    });
    return Response.json({ result });
  } catch (error) {
    if (error instanceof ImportParseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ImportAnalysisError) {
      return Response.json(
        { error: error.message, issues: error.issues },
        { status: 422 }
      );
    }
    console.error("Import analysis failed", error);
    return Response.json(
      { error: "The analysis failed unexpectedly. Please try again in a moment." },
      { status: 502 }
    );
  }
}
