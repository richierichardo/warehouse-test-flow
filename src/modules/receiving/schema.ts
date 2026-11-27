import { z } from "zod";
import { todayInWib, validCalendarDate } from "../../lib/warehouse-date.ts";

export const receiptFieldLimits = { sourceName: 120, deliveryNoteRef: 120, notes: 500 } as const;
export const maxReceiptQuantity = 1_000_000;
export const receiptKeySchema = z.uuid().transform((key) => key.toLowerCase());

function validText(text: string) {
  return !text.includes("\0");
}

function optionalText(max: number) {
  return z.string().trim().max(max).refine(validText).nullish().transform((value) => value || null);
}

export const receiveGoodsSchema = z.strictObject({
  itemId: z.uuid().transform((id) => id.toLowerCase()),
  quantity: z.number().int().min(1).max(maxReceiptQuantity),
  receivedOn: z.string().refine((date) => validCalendarDate(date) && date <= todayInWib()),
  sourceName: z.string().trim().min(1).max(receiptFieldLimits.sourceName).refine(validText),
  deliveryNoteRef: optionalText(receiptFieldLimits.deliveryNoteRef),
  notes: optionalText(receiptFieldLimits.notes),
});

export type ReceiptInput = z.output<typeof receiveGoodsSchema>;
