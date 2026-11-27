import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { requirePermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { editItemMetadata, findItemForEdit, insertItem, listItems } from "./repository";
import type { CatalogQuery, ItemMetadata, ItemUpdate } from "./schema";

function checkDuplicateCode(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new HttpError(409, "DUPLICATE_ITEM_CODE", "Kode barang sudah digunakan.");
  }
  throw error;
}

export function listCatalog(db: PrismaClient, principal: Principal, query: CatalogQuery) {
  requirePermission(principal.role, ["catalog:read"]);
  return listItems(db, query);
}

export function getCatalogItemForEdit(db: PrismaClient, principal: Principal, id: string) {
  requirePermission(principal.role, ["catalog:write"]);
  return findItemForEdit(db, id);
}

export function createCatalogItem(db: PrismaClient, principal: Principal, metadata: ItemMetadata) {
  requirePermission(principal.role, ["catalog:write"]);
  return insertItem(db, metadata, principal.id).catch(checkDuplicateCode);
}

export async function updateCatalogItem(db: PrismaClient, principal: Principal, id: string, changes: ItemUpdate) {
  requirePermission(principal.role, ["catalog:write"]);
  const result = await editItemMetadata(db, id, changes).catch(checkDuplicateCode);
  if (result.status === "missing") throw new HttpError(404, "ITEM_NOT_FOUND", "Barang tidak ditemukan.");
  if (result.status === "locked") {
    throw new HttpError(409, "ITEM_METADATA_LOCKED", "Kode dan satuan tidak dapat diubah setelah ada permintaan atau mutasi stok.");
  }
  return result.item;
}
