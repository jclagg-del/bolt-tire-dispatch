import "server-only";
import { Client } from "basic-ftp";
import { parse } from "csv-parse";
import { PassThrough } from "node:stream";
import { createAdminClient } from "@/lib/supabase/admin";

type CsvRow = Record<string, string>;
type WarehouseStock = { warehouse: string; quantity: number };
type InventoryRecord = Record<string, unknown> & {
  part_number: string;
  total_quantity: number;
  warehouse_inventory: WarehouseStock[];
};

const FTP_FOLDER = "/USAutoForce/1337609_Bolt";
const DEFAULT_FILE = "USAutoForceInventory_.csv";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function numeric(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: string) {
  return /^(true|1|yes|y)$/i.test(value || "");
}

function recordFrom(row: CsvRow, batchId: string, sourceModifiedAt: string | null): InventoryRecord {
  const tireSize = row.TireSize || [row.Width, row.AspectRatio, row.Rim].filter(Boolean).join("");
  const warehouse = row.D365WarehouseCode || "Unknown";
  const quantity = numeric(row.QuantityAvailable);
  return {
    part_number: row.PartNumber,
    brand_code: row.BrandCode || null,
    brand: row.Make || row.BrandCode || "Unknown",
    model: row.SalesClass || "Tire",
    sales_class: row.SalesClass || null,
    tire_type: row.TireType || null,
    tire_size: tireSize,
    tire_size_key: tireSize.replace(/\D/g, ""),
    width: row.Width || null,
    aspect_ratio: row.AspectRatio || null,
    rim: row.Rim || null,
    ply_rating: row.PlyRating || null,
    utqg: row.UTQG || null,
    sidewall: row.Sidewall || null,
    load_range: row.LoadRange || null,
    tread_depth: row.TreadDepth || null,
    warranty: row.Warranty || null,
    upc: row.UPC || null,
    discontinued: bool(row.DiscontinuedFlag),
    ev_compatible: bool(row.EVCompatible),
    run_flat: bool(row.RunFlat),
    snowflake: bool(row.Snowflake),
    noise_canceling: bool(row.NoiseCancelingTechnology),
    fet: numeric(row.FET),
    cost: numeric(row.Cost),
    wholesale_cost: numeric(row.WholesaleCost || row.Cost),
    retail_price: numeric(row.RetailPrice),
    map_price: numeric(row.Map),
    total_quantity: quantity,
    warehouse_inventory: [{ warehouse, quantity }],
    source_modified_at: sourceModifiedAt,
    imported_at: new Date().toISOString(),
    import_batch: batchId,
  };
}

export async function importUsafInventory() {
  const admin = createAdminClient();
  const batchId = crypto.randomUUID();
  const sourceFile = process.env.USAF_FTP_FILE?.trim() || DEFAULT_FILE;
  await admin.from("usaf_import_runs").insert({ id: batchId, source_file: sourceFile, status: "running" });

  const client = new Client(30_000);
  client.ftp.verbose = false;
  let rowCount = 0;
  try {
    await client.access({
      host: process.env.USAF_FTP_HOST?.trim() || "usventure.files.com",
      user: required("USAF_FTP_USER"),
      password: required("USAF_FTP_PASSWORD"),
      secure: true,
    });
    await client.cd(process.env.USAF_FTP_FOLDER?.trim() || FTP_FOLDER);
    const listing = await client.list();
    const source = listing.find((file) => file.name === sourceFile);
    if (!source) throw new Error(`U.S. AutoForce file ${sourceFile} was not found.`);
    const sourceModifiedAt = source.modifiedAt?.toISOString() || null;

    const products = new Map<string, InventoryRecord>();
    const input = new PassThrough();
    const parser = input.pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true }));
    const parseTask = (async () => {
      for await (const row of parser as AsyncIterable<CsvRow>) {
        rowCount += 1;
        if (!row.PartNumber) continue;
        const current = products.get(row.PartNumber);
        const next = recordFrom(row, batchId, sourceModifiedAt);
        if (!current) {
          products.set(row.PartNumber, next);
          continue;
        }
        const stock = next.warehouse_inventory[0];
        const existing = current.warehouse_inventory.find((item) => item.warehouse === stock.warehouse);
        if (existing) existing.quantity += stock.quantity;
        else current.warehouse_inventory.push(stock);
        current.total_quantity += stock.quantity;
      }
    })();
    await client.downloadTo(input, sourceFile);
    await parseTask;

    const records = [...products.values()];
    for (let index = 0; index < records.length; index += 500) {
      const { error } = await admin.from("usaf_inventory").upsert(records.slice(index, index + 500), { onConflict: "part_number" });
      if (error) throw new Error(error.message);
    }
    const { error: staleError } = await admin.from("usaf_inventory").delete().neq("import_batch", batchId);
    if (staleError) throw new Error(staleError.message);
    await admin.from("usaf_import_runs").update({ status: "completed", completed_at: new Date().toISOString(), row_count: rowCount, product_count: records.length, source_modified_at: sourceModifiedAt }).eq("id", batchId);
    return { batchId, sourceFile, sourceModifiedAt, rowCount, productCount: records.length };
  } catch (error) {
    await admin.from("usaf_import_runs").update({ status: "failed", completed_at: new Date().toISOString(), row_count: rowCount, error: error instanceof Error ? error.message : "Import failed" }).eq("id", batchId);
    throw error;
  } finally {
    client.close();
  }
}
