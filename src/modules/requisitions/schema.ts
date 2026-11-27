import { z } from "zod";

export const maxRequestQuantity = 1_000_000;
export const maxRequestNotes = 500;
export const maxRejectionReason = 500;
export const requestStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export const requestStatusLabels = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak" } satisfies Record<RequestStatus, string>;
export const requestUuidSchema = z.uuid().transform((uuid) => uuid.toLowerCase());

export const approveRequestSchema = z.strictObject({});
export const rejectRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(maxRejectionReason).refine((reason) => !reason.includes("\0")),
});

export type RequestDecision = { status: "APPROVED" } | { status: "REJECTED"; reason: string };

export const createRequestSchema = z.strictObject({
  itemId: requestUuidSchema,
  quantity: z.number().int().min(1).max(maxRequestQuantity),
  notes: z.string().trim().max(maxRequestNotes).refine((text) => !text.includes("\0")).nullish().transform((text) => text || null),
});

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive());
const requestQuerySchema = z.strictObject({
  status: z.union([z.literal(""), z.enum(requestStatuses)]).optional().transform((status) => status || undefined),
  page: positiveInteger.default(1),
  limit: positiveInteger.refine((limit) => limit <= 100).default(20),
}).refine(({ page, limit }) => (page - 1) * limit <= 2_147_483_647);

export function parseRequestQuery(input: URLSearchParams | Record<string, string | string[] | undefined>) {
  if (!(input instanceof URLSearchParams)) return requestQuerySchema.safeParse(input);
  const entries = Array.from(new Set(input.keys()), (key) => {
    const values = input.getAll(key);
    return [key, values.length === 1 ? values[0] : values] as const;
  });
  return requestQuerySchema.safeParse(Object.fromEntries(entries));
}

export type RequestInput = z.output<typeof createRequestSchema>;
export type RequestQuery = z.output<typeof requestQuerySchema>;
