import { z } from "zod";
import { validCalendarDate } from "@/lib/warehouse-date";

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive());
const optionalDate = z.union([z.literal(""), z.string().refine(validCalendarDate)]).optional().transform((value) => value || undefined);

const historyQuerySchema = z.strictObject({
  itemId: z.uuid().optional(),
  from: optionalDate,
  to: optionalDate,
  page: positiveInteger.default(1),
  limit: positiveInteger.refine((value) => value <= 100).default(20),
}).refine(({ page, limit }) => (page - 1) * limit <= 2_147_483_647)
  .refine(({ from, to }) => !from || !to || from <= to);

export type HistoryQuery = z.output<typeof historyQuerySchema>;

export function parseHistoryQuery(input: URLSearchParams | Record<string, string | string[] | undefined>) {
  if (!(input instanceof URLSearchParams)) return historyQuerySchema.safeParse(input);

  const entries = Array.from(new Set(input.keys()), (key) => {
    const values = input.getAll(key);
    return [key, values.length === 1 ? values[0] : values] as const;
  });
  return historyQuerySchema.safeParse(Object.fromEntries(entries));
}

export function historyMeta({ page, limit }: HistoryQuery, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
