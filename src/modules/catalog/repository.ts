import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { CatalogItem, CatalogQuery, ItemMetadata, ItemUpdate } from "./schema";

const catalogFields = { id: true, code: true, name: true, unit: true, location: true, stock: true } as const;
const orderColumns = { code: Prisma.sql`code`, name: Prisma.sql`name`, stock: Prisma.sql`stock` };
const orderDirections = { asc: Prisma.sql`ASC`, desc: Prisma.sql`DESC` };

export async function listItems(db: PrismaClient, { q, page, limit, sort, direction }: CatalogQuery) {
  // strpos searches literally and the same Unicode collation works on both database hosts.
  const filter = q ? Prisma.sql`WHERE
    strpos(lower(code COLLATE pg_catalog."pg_c_utf8"), lower(${q}::text COLLATE pg_catalog."pg_c_utf8")) > 0
    OR strpos(lower(name COLLATE pg_catalog."pg_c_utf8"), lower(${q}::text COLLATE pg_catalog."pg_c_utf8")) > 0` : Prisma.empty;
  const offset = (page - 1) * limit;
  const [items, count] = await db.$transaction([
    db.$queryRaw<CatalogItem[]>`
      SELECT id, code, name, unit, location, stock FROM item ${filter}
      ORDER BY ${orderColumns[sort]} ${orderDirections[direction]}, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
    db.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM item ${filter}`,
  ], { isolationLevel: "RepeatableRead" });
  const total = Number(count[0].total);
  return { data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function insertItem(db: PrismaClient, metadata: ItemMetadata, createdById: string) {
  const { code, name, unit, location } = metadata;
  return db.item.create({ data: { code, name, unit, location, createdById }, select: catalogFields });
}

export async function findItemForEdit(db: PrismaClient, id: string) {
  const record = await db.item.findUnique({ where: { id }, select: {
    ...catalogFields,
    requests: { take: 1, select: { id: true } },
    movements: { take: 1, select: { id: true } },
  } });
  if (!record) return null;

  const { requests, movements, ...item } = record;
  return { item, metadataLocked: requests.length > 0 || movements.length > 0 };
}

export function editItemMetadata(db: PrismaClient, id: string, changes: ItemUpdate) {
  return db.$transaction(async (tx) => {
    const [item] = await tx.$queryRaw<Array<Pick<CatalogItem, "code" | "unit">>>`
      SELECT code, unit FROM item WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (!item) return { status: "missing" } as const;

    const changesCode = changes.code !== undefined && changes.code !== item.code;
    const changesUnit = changes.unit !== undefined && changes.unit !== item.unit;
    if (changesCode || changesUnit) {
      const [history] = await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM item_request WHERE item_id = ${id}::uuid)
          OR EXISTS (SELECT 1 FROM stock_movement WHERE item_id = ${id}::uuid) AS "exists"
      `;
      if (history.exists) return { status: "locked" } as const;
    }

    const { code, name, unit, location } = changes;
    const updated = await tx.item.update({ where: { id }, data: { code, name, unit, location }, select: catalogFields });
    return { status: "updated", item: updated } as const;
  }, { isolationLevel: "ReadCommitted" });
}
