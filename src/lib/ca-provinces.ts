/**
 * Canonical list of Canadian provinces + territories.
 *
 * Mirrors the backend's `CA_PROVINCES` set in
 * usa-errands-api/src/common/schemas/order.schema.ts — every code here
 * passes server-side validation. The two-letter `code` is stored / sent to
 * the backend; `name` is the human label. Sorted alphabetically by name.
 */

export interface CaProvince {
  code: string;
  name: string;
}

export const CA_PROVINCES: ReadonlyArray<CaProvince> = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];
