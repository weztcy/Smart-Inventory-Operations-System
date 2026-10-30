// Import CSV: unduh template, validasi (preview), dan commit (PRD §17.2).
import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import {
  ITEM_TEMPLATE_HEADER, OPENING_TEMPLATE_HEADER,
  validateItemsCsv, validateOpeningCsv, createImportJob,
  commitItemsImport, commitOpeningImport,
} from "@/lib/services/importCsv";

export const GET = apiRoute(async (req) => {
  await requirePermission("import.manage");
  const type = req.nextUrl.searchParams.get("type") ?? "items";
  const header = type === "opening" ? OPENING_TEMPLATE_HEADER : ITEM_TEMPLATE_HEADER;
  const example =
    type === "opening"
      ? "STEEL-PLATE-3MM,WH-01-RAW,250,52000"
      : "STEEL-PLATE-3MM,Plat Baja 3mm,RAW_MATERIAL,kg,Steel,50,100,52000,Plat baja umum";
  return ok({ header, example });
});

const validateSchema = z.object({
  type: z.enum(["items", "opening"]),
  fileName: z.string().min(1),
  csv: z.string().min(1, "Konten CSV kosong"),
});

export const POST = apiRoute(async (req) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("op") === "commit") {
    const ctx = await requirePermission("import.manage");
    assertOrgOperational(ctx);
    const body = await parseBody(req, z.object({ jobId: z.string().min(1) }));
    const result =
      sp.get("type") === "opening"
        ? await commitOpeningImport(ctx, body.jobId)
        : await commitItemsImport(ctx, body.jobId);
    return ok(result);
  }

  const ctx = await requirePermission("import.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, validateSchema);
  const result =
    body.type === "opening"
      ? await validateOpeningCsv(ctx, body.csv)
      : await validateItemsCsv(ctx, body.csv);
  const job = await createImportJob(
    ctx,
    body.type === "opening" ? "OPENING_STOCK" : "ITEMS",
    body.fileName,
    result,
  );
  return ok({
    jobId: job.id,
    totalRows: result.totalRows,
    validCount: result.valid.length,
    errors: result.errors.slice(0, 50),
    canCommit: result.errors.length === 0 && result.valid.length > 0,
  });
});
