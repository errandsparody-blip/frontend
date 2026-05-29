/**
 * Product Zod schemas — mirror file in usa-errands-api/src/common/schemas/product.schema.ts.
 * KEEP IN SYNC.
 */

import { z } from "zod";

const productCodeSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, digits, or hyphens.");
const isoCountrySchema = z.string().length(2).toUpperCase();
const dimensionSchema = z.coerce.number().positive().max(120);
const weightSchema = z.coerce.number().positive().max(2400);

// Dimensions are optional. Empty-string from a controlled input collapses
// to undefined; explicit null also clears the field. A real number is
// validated like a regular dimension.
const optionalDimension = z.union([
  dimensionSchema,
  z.literal("").transform(() => undefined),
  z.null().transform(() => undefined),
  z.undefined(),
]);

// Storage tier — vendor declares this on the product. Drives monthly
// storage billing. Mirrors prisma StorageTier enum.
export const storageTierSchema = z.enum([
  "SMALL",
  "MEDIUM",
  "LARGE",
  "X_LARGE",
  "PALLET",
]);
export type StorageTier = z.infer<typeof storageTierSchema>;

// Strict http(s) URL — capped at 2048 chars.
const imageUrlString = z.string().trim().url().max(2048);

// Required on create — vendors must upload a product photo before they
// can save. Mirror of imageUrlRequired in usa-errands-api/src/common/
// schemas/product.schema.ts.
const imageUrlRequired = imageUrlString;

// Optional on update — existing products created before the requirement
// landed must remain patchable. Empty string normalises to null; null
// clears; an http(s) URL sets.
const imageUrlOptional = z
  .union([imageUrlString, z.literal("").transform(() => null), z.null()])
  .optional();

export const createProductSchema = z.object({
  code: productCodeSchema,
  name: z.string().min(2).max(120),
  variant: z.string().min(1).max(40).default("STD"),
  hsCode: z.string().min(4).max(12).optional().or(z.literal("").transform(() => undefined)),
  countryOfOrigin: isoCountrySchema,
  declaredValueCents: z.coerce.number().int().nonnegative(),
  weightOz: weightSchema,
  lengthIn: optionalDimension,
  widthIn: optionalDimension,
  heightIn: optionalDimension,
  storageTier: storageTierSchema.default("SMALL"),
  imageUrl: imageUrlRequired,
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ code: true, imageUrl: true })
  .partial()
  .extend({
    imageUrl: imageUrlOptional,
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export interface PublicProduct {
  id: string;
  code: string;
  name: string;
  variant: string;
  hsCode: string | null;
  countryOfOrigin: string;
  declaredValueCents: number;
  weightOz: number;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  storageTier: StorageTier;
  /**
   * Optional product image URL. `null` when the vendor hasn't uploaded
   * one. Image stays editable even when the rest of the product is
   * locked (cosmetic, no business-rule impact).
   */
  imageUrl: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  /**
   * True once any SKU exists for this product (i.e. stock has been
   * received). Locks all fields except `status` and `imageUrl` —
   * vendors can still archive and refresh the photo. Optional in the
   * schema because the list endpoint omits the SKU-count round trip.
   */
  locked?: boolean;
}
