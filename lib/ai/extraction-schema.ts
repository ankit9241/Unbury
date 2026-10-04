import { z } from "zod";

export const taskExtractionSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional().transform((v) => v || ""),
  deadline: z.string().nullable().optional().default(null),
  priority: z
    .enum(["low", "medium", "high"])
    .or(z.string().transform((s) => s.toLowerCase()))
    .pipe(z.enum(["low", "medium", "high"]).catch("medium"))
    .default("medium"),
  evidence: z.string().default(""),
});

export const memoryExtractionSchema = z.object({
  type: z
    .enum(["person", "deadline", "context"])
    .or(z.string().transform((s) => s.toLowerCase()))
    .pipe(z.enum(["person", "deadline", "context"]).catch("context"))
    .default("context"),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  evidence: z.string().default(""),
});

export const extractionSchema = z.object({
  tasks: z.array(taskExtractionSchema).default([]),
  memories: z.array(memoryExtractionSchema).default([]),
});

export type ExtractedTask = z.infer<typeof taskExtractionSchema>;
export type ExtractedMemory = z.infer<typeof memoryExtractionSchema>;
export type ExtractionResult = z.infer<typeof extractionSchema>;
