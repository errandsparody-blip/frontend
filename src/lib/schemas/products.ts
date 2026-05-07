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

export const createProductSchema = z.object({
  code: productCodeSchema,
  name: z.string().min(2).max(120),
  variant: z.string().min(1).max(40).default("STD"),
  hsCode: z.string().min(4).max(12).optional().or(z.literal("").transform(() => undefined)),
  countryOfOrigin: isoCountrySchema,
  declaredValueCents: z.coerce.number().int().nonnegative(),
  weightOz: weightSchema,
  lengthIn: dimensionSchema,
  widthIn: dimensionSchema,
  heightIn: dimensionSchema,
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ code: true })
  .partial()
  .extend({
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
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}
