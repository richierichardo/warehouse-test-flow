import { z } from "zod";
import { validCalendarDate } from "@/lib/warehouse-date";

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive());
const optionalDate = z.union([z.literal(""), z.string().refine(validCalendarDate)]).optional().transform((value) => value || undefined);

const historyFields = {
  itemId: z.uuid().optional(),
  from: optionalDate,
  to: optionalDate,
  page: positiveInteger.default(1),
  limit: positiveInteger.refine((value) => value <= 100).default(20),
};

function validWindow({ page, limit, from, to }: { page: number; limit: number; from?: string; to?: string }) {
  return (page - 1) * limit <= 2_147_483_647 && (!from || !to || from <= to);
}

export const movementDirectionLabels = { IN: "Masuk", OUT: "Keluar" } as const;
const historyQuerySchema = z.strictObject(historyFields).refine(validWindow);
const movementQuerySchema = z.strictObject({
  ...historyFields,
  direction: z.union([z.literal(""), z.enum(["IN", "OUT"])]).optional().transform((direction) => direction || undefined),
}).refine(validWindow);

export type HistoryQuery = z.output<typeof historyQuerySchema>;
export type MovementQuery = z.output<typeof movementQuerySchema>;
type SearchParams = URLSearchParams | Record<string, string | string[] | undefined>;

function queryValues(input: SearchParams) {
  if (!(input instanceof URLSearchParams)) return input;

  const entries = Array.from(new Set(input.keys()), (key) => {
    const values = input.getAll(key);
    return [key, values.length === 1 ? values[0] : values] as const;
  });
  return Object.fromEntries(entries);
}

export function parseHistoryQuery(input: SearchParams) {
  return historyQuerySchema.safeParse(queryValues(input));
}

export function parseMovementQuery(input: SearchParams) {
  return movementQuerySchema.safeParse(queryValues(input));
}

export function historyMeta({ page, limit }: HistoryQuery, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
