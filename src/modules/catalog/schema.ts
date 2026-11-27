import { z } from "zod";

export const itemFieldLimits = { code: 64, name: 160, unit: 32, location: 120 } as const;

function validText(value: string) {
  return !value.includes("\0");
}

export const createItemSchema = z.strictObject({
  code: z.string().trim().toUpperCase().min(1).max(itemFieldLimits.code).refine(validText),
  name: z.string().trim().min(1).max(itemFieldLimits.name).refine(validText),
  unit: z.string().trim().min(1).max(itemFieldLimits.unit).refine(validText),
  location: z.string().trim().min(1).max(itemFieldLimits.location).refine(validText),
});

export const updateItemSchema = createItemSchema.partial().refine((item) => Object.keys(item).length > 0);
export const itemIdSchema = z.uuid();

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive());

export const catalogQuerySchema = z.strictObject({
  q: z.string().trim().max(100).refine(validText).default(""),
  page: positiveInteger.default(1),
  limit: positiveInteger.refine((value) => value <= 100).default(20),
  sort: z.enum(["code", "name", "stock"]).default("code"),
  direction: z.enum(["asc", "desc"]).default("asc"),
}).refine(({ page, limit }) => (page - 1) * limit <= 2_147_483_647);

export function parseCatalogQuery(input: Record<string, string | string[] | undefined> | URLSearchParams) {
  if (input instanceof URLSearchParams) {
    const entries = Array.from(new Set(input.keys()), (key) => {
      const values = input.getAll(key);
      return [key, values.length === 1 ? values[0] : values] as const;
    });
    return catalogQuerySchema.safeParse(Object.fromEntries(entries));
  }
  return catalogQuerySchema.safeParse(input);
}

export type ItemMetadata = z.infer<typeof createItemSchema>;
export type ItemUpdate = z.infer<typeof updateItemSchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type CatalogItem = ItemMetadata & { id: string; stock: number };
