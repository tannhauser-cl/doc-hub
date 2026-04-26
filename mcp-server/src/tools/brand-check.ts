/**
 * brand-check.ts — MCP tool: brand_check
 * Run the brand compliance checker on a document.
 * Returns a list of violations (colors, fonts, logos, tone) found in the document.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";
import { BrandViolation } from "../types.js";

export const BrandCheckInputSchema = z.object({
  file_id: z
    .string()
    .min(1)
    .describe("Google Drive file ID of the document to check for brand compliance."),
});

export type BrandCheckInput = z.infer<typeof BrandCheckInputSchema>;

export interface BrandCheckResult {
  file_id: string;
  status: "ok" | "violations";
  violation_count: number;
  violations: BrandViolation[];
  checked_at: string;
}

export async function brandCheck(
  input: BrandCheckInput,
  client: AppsScriptClient
): Promise<BrandCheckResult> {
  const raw = await client.post("brandCheck", { fileId: input.file_id });
  const data = raw as Record<string, unknown>;

  const violations: BrandViolation[] = Array.isArray(data["violations"])
    ? (data["violations"] as unknown[]).map((v) => {
        const vObj = v as Record<string, unknown>;
        return {
          type: String(vObj["type"] ?? "unknown"),
          location: vObj["location"] != null ? String(vObj["location"]) : undefined,
          expected: vObj["expected"] != null ? String(vObj["expected"]) : undefined,
          found: vObj["found"] != null ? String(vObj["found"]) : undefined,
          message: String(vObj["message"] ?? ""),
          severity: (vObj["severity"] === "error" ? "error" : "warning") as "warning" | "error",
        };
      })
    : [];

  const status = violations.length === 0 ? "ok" : "violations";
  return {
    file_id: input.file_id,
    status,
    violation_count: violations.length,
    violations,
    checked_at: String(data["checked_at"] ?? data["checkedAt"] ?? new Date().toISOString()),
  };
}
