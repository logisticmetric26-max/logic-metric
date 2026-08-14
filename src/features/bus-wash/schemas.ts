import { z } from "zod";
import { dateSchema, uuidSchema } from "@/schemas/common";

export const busWashRecordSchema = z.object({
  fleet_id: uuidSchema,
  terminal_id: uuidSchema,
  record_date: dateSchema,
  bm_completed: z.boolean(),
  body_wash_completed: z.boolean(),
  in_repair: z.boolean(),
  no_wash: z.boolean(),
});

export const busWashExportSchema = z.object({
  record_date: dateSchema,
});

export type BusWashRecordInput = z.infer<typeof busWashRecordSchema>;
export type BusWashExportInput = z.infer<typeof busWashExportSchema>;
