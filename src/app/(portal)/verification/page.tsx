/**
 * /verification — vendor KYC v2 multi-step wizard.
 *
 * Phase 1 of the expanded onboarding form. Structured data only — uploads
 * (ID front/back, selfie, business registration document) land in a
 * follow-up. The wizard walks the vendor through 7 sections, persisting
 * progress on every "Next" click so a refresh / tab close doesn't lose
 * work. Progress is also mirrored to sessionStorage (keyed by user id) so
 * a refresh BEFORE the first server save still keeps the form state.
 *
 * The 7 steps are:
 *   1. Business information
 *   2. Primary contact
 *   3. Identity verification
 *   4. Business verification — placeholder (uploads come later)
 *   5. Inventory information
 *   6. Shipping & operations
 *   7. Review & submit (read-only summary + Submit button)
 *
 * The FINAL step posts the full payload with `submitForReview: true` set;
 * the backend flips kycStatus → IN_PROGRESS and queues the admin review.
 *
 * Pre-existing simple-mode behaviour:
 *   - If KYC is APPROVED / IN_PROGRESS / REJECTED, we don't show the wizard.
 *     We show a status panel that matches the previous /verification page
 *     so vendors who already submitted don't see a confusing form re-open.
 *
 * Form validation:
 *   - The full SubmitKycV2 Zod schema is the resolver, but every field is
 *     individually `.optional()` at the schema level. We layer a per-step
 *     "is this step complete?" predicate on top of formState so the Next
 *     button only enables when the current step has valid inputs.
 *   - The very last submit uses the schema's `.superRefine` to enforce
 *     "every required field present" — that's the server's source of truth
 *     and we mirror it client-side for the inline error display.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { COUNTRIES, getDialCode } from "@/lib/countries";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types — mirror the API's VendorProfile shape (kycV2 sub-object included).
// ---------------------------------------------------------------------------

type KycStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "REQUIRES_RESUBMISSION"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

interface KycV2State {
  businessType: string | null;
  businessTypeOther: string | null;
  businessRegistrationNumber: string | null;
  businessRegistrationCountry: string | null;
  businessIndustry: string | null;
  businessIndustryOther: string | null;
  contactFullName: string | null;
  contactPosition: string | null;
  contactPhone: string | null;
  contactAddressLine1: string | null;
  contactAddressLine2: string | null;
  contactCountry: string | null;
  idType: string | null;
  idNumber: string | null;
  idExpirationDate: string | null;
  // KYC v2 Phase 2 — public R2 URLs for the four document uploads
  // collected on the wizard's "Business verification" step (migration
  // 0032). Each is null until the vendor uploads the matching file.
  idFrontUrl: string | null;
  idBackUrl: string | null;
  idSelfieUrl: string | null;
  businessDocUrl: string | null;
  productsStoredDescription: string | null;
  monthlyInventoryVolume: string | null;
  monthlyOrderVolume: string | null;
  primaryShippingCountries: string | null;
  requiresReturnsHandling: boolean | null;
  productHazards: string[];
}

interface VendorProfile {
  id: string;
  businessName: string;
  kycStatus: KycStatus;
  kycRejectionReason?: string | null;
  agreementAcceptedAt: string | null;
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  // Social presence — at least one of these must be set before the backend
  // accepts a final KYC submit (see `submitKyc` `hasAnyHandle` check). The
  // wizard's Review step collects them and PATCHes /vendors/me right before
  // the kyc/submit POST so the gate passes.
  instagramHandle: string | null;
  tiktokHandle: string | null;
  xHandle: string | null;
  websiteUrl: string | null;
  kycV2: KycV2State;
}

// ---------------------------------------------------------------------------
// Zod schema — exact mirror of the backend submitKycV2Schema for the FULL
// submit. We use this as the resolver. Per-step validity is layered on top
// in the `STEP_FIELDS` map below; the resolver itself permits every field
// to be empty so users can hop between steps freely.
// ---------------------------------------------------------------------------

const BUSINESS_TYPES = [
  { value: "SOLE_PROPRIETORSHIP", label: "Sole Proprietorship" },
  { value: "REGISTERED_BUSINESS", label: "Registered Business" },
  { value: "LLC", label: "LLC" },
  { value: "CORPORATION", label: "Corporation" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "OTHER", label: "Other" },
] as const;

const INDUSTRIES = [
  { value: "FASHION_APPAREL", label: "Fashion & Apparel" },
  { value: "BEAUTY_COSMETICS", label: "Beauty / Cosmetics" },
  { value: "HAIR_WIGS", label: "Hair / Wigs" },
  { value: "ELECTRONICS", label: "Electronics" },
  { value: "ACCESSORIES", label: "Accessories" },
  { value: "HOME_GOODS", label: "Home Goods" },
  { value: "OTHER", label: "Other" },
] as const;

const ID_TYPES = [
  { value: "PASSPORT", label: "Passport" },
  { value: "NATIONAL_ID", label: "National ID Card" },
  { value: "DRIVERS_LICENSE", label: "Driver's License" },
] as const;

const INVENTORY_VOLUMES = [
  { value: "SMALL_1_10", label: "Small (1–10 boxes)" },
  { value: "MEDIUM_11_30", label: "Medium (11–30 boxes)" },
  { value: "LARGE_31_100", label: "Large (31–100 boxes)" },
  { value: "XLARGE_100_PLUS", label: "X-Large (100+ boxes)" },
  { value: "BULK_PALLET", label: "Bulk / Pallet Level" },
] as const;

const ORDER_VOLUMES = [
  { value: "V_1_20", label: "1–20 orders" },
  { value: "V_21_100", label: "21–100 orders" },
  { value: "V_101_500", label: "101–500 orders" },
  { value: "V_500_PLUS", label: "500+ orders" },
] as const;

// SERVICE_INTENTS removed — vendors are no longer asked which service track
// they intend to use during KYC (migration 0031).

const HAZARDS = [
  { value: "BATTERIES", label: "Batteries" },
  { value: "LIQUIDS", label: "Liquids" },
  { value: "FRAGILE", label: "Fragile Items" },
  { value: "HAZARDOUS", label: "Hazardous Materials" },
  { value: "NONE", label: "None of the Above" },
] as const;

// All values literally typed via `as const` so the zod enums and form
// values share a TS source of truth.
const businessTypeEnum = z.enum(BUSINESS_TYPES.map((b) => b.value) as [string, ...string[]]);
const industryEnum = z.enum(INDUSTRIES.map((b) => b.value) as [string, ...string[]]);
const idTypeEnum = z.enum(ID_TYPES.map((b) => b.value) as [string, ...string[]]);
const inventoryVolumeEnum = z.enum(
  INVENTORY_VOLUMES.map((b) => b.value) as [string, ...string[]],
);
const orderVolumeEnum = z.enum(ORDER_VOLUMES.map((b) => b.value) as [string, ...string[]]);
const hazardEnum = z.enum(HAZARDS.map((b) => b.value) as [string, ...string[]]);

const iso2 = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Use a 2-letter ISO country code (e.g. US, GB).")
  .transform((s) => s.toUpperCase());

const phoneRegex = /^\+?[0-9 \-()]{6,}$/;

const wizardSchema = z
  .object({
    businessType: businessTypeEnum.optional().or(z.literal("")),
    businessTypeOther: z.string().max(120).optional(),
    businessRegistrationNumber: z.string().max(120).optional(),
    businessRegistrationCountry: z
      .string()
      .max(2)
      .optional()
      .or(iso2.optional()),
    businessIndustry: industryEnum.optional().or(z.literal("")),
    businessIndustryOther: z.string().max(120).optional(),

    contactFullName: z.string().max(160).optional(),
    contactPosition: z.string().max(120).optional(),
    contactPhone: z
      .string()
      .trim()
      .optional()
      .refine(
        (s) => !s || phoneRegex.test(s),
        "Enter a phone number with country code.",
      ),
    contactAddressLine1: z.string().max(200).optional(),
    contactAddressLine2: z.string().max(200).optional(),
    contactCountry: z.string().max(2).optional(),

    idType: idTypeEnum.optional().or(z.literal("")),
    idNumber: z.string().max(60).optional(),
    idExpirationDate: z
      .string()
      .optional()
      .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Use YYYY-MM-DD.")
      .refine((s) => {
        if (!s) return true;
        const d = new Date(`${s}T00:00:00Z`);
        if (Number.isNaN(d.getTime())) return false;
        const now = new Date();
        const utcToday = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
        );
        return d.getTime() > utcToday;
      }, "ID is expired or expires today."),

    // Section 4 — Business verification document URLs (KYC v2 Phase 2).
    // Each one is the public R2 URL returned by the kyc/uploads/presign
    // → R2 PUT cycle. Empty string represents "not uploaded yet" so the
    // form state is JSON-serialisable (sessionStorage round-trip).
    idFrontUrl: z.string().url().optional().or(z.literal("")),
    idBackUrl: z.string().url().optional().or(z.literal("")),
    idSelfieUrl: z.string().url().optional().or(z.literal("")),
    businessDocUrl: z.string().url().optional().or(z.literal("")),

    productsStoredDescription: z.string().max(1000).optional(),
    monthlyInventoryVolume: inventoryVolumeEnum.optional().or(z.literal("")),
    monthlyOrderVolume: orderVolumeEnum.optional().or(z.literal("")),
    // serviceIntent removed in migration 0031.

    primaryShippingCountries: z.string().max(400).optional(),
    requiresReturnsHandling: z.union([z.boolean(), z.literal("")]).optional(),
    productHazards: z.array(hazardEnum).max(5).optional(),

    // Social presence — at least one of the four is required to submit KYC
    // (see `isStepComplete("review")` below). The wizard PATCHes these to
    // /vendors/me right before the kyc/submit POST. Strict patterns mirror
    // the backend Vendor schema; empty string is allowed for the optional
    // ones so a vendor who only fills, say, websiteUrl can still submit.
    instagramHandle: z
      .string()
      .trim()
      .max(30)
      .regex(/^[a-z0-9._]*$/i, "Lowercase letters, numbers, dots, underscores only.")
      .optional(),
    tiktokHandle: z
      .string()
      .trim()
      .max(24)
      .regex(/^[a-z0-9._]*$/i, "Lowercase letters, numbers, dots, underscores only.")
      .optional(),
    xHandle: z
      .string()
      .trim()
      .max(15)
      .regex(/^[a-z0-9_]*$/i, "Lowercase letters, numbers, underscores only.")
      .optional(),
    websiteUrl: z
      .string()
      .trim()
      .refine(
        (s) => s === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s),
        "Enter a full URL starting with https://",
      )
      .optional(),
  })
  .strip();

type WizardInput = z.infer<typeof wizardSchema>;

const EMPTY_WIZARD: WizardInput = {
  businessType: "",
  businessTypeOther: "",
  businessRegistrationNumber: "",
  businessRegistrationCountry: "",
  businessIndustry: "",
  businessIndustryOther: "",
  contactFullName: "",
  contactPosition: "",
  contactPhone: "",
  contactAddressLine1: "",
  contactAddressLine2: "",
  contactCountry: "",
  idType: "",
  idNumber: "",
  idExpirationDate: "",
  // Document upload URLs default to "" (vs `null`) so the form state
  // round-trips cleanly through sessionStorage and the Zod resolver.
  idFrontUrl: "",
  idBackUrl: "",
  idSelfieUrl: "",
  businessDocUrl: "",
  productsStoredDescription: "",
  monthlyInventoryVolume: "",
  monthlyOrderVolume: "",
  primaryShippingCountries: "",
  requiresReturnsHandling: "",
  productHazards: [],
  // Social presence — at least one is required for final submit (mirrors
  // the backend `submitKyc` `hasAnyHandle` check). Each defaults to ""
  // and the Review step PATCHes /vendors/me right before kyc/submit.
  instagramHandle: "",
  tiktokHandle: "",
  xHandle: "",
  websiteUrl: "",
};

// ---------------------------------------------------------------------------
// Step model
// ---------------------------------------------------------------------------

type StepKey =
  | "business"
  | "contact"
  | "identity"
  | "verification"
  | "inventory"
  | "shipping"
  | "review";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "business", label: "Business info" },
  { key: "contact", label: "Primary contact" },
  { key: "identity", label: "Identity" },
  { key: "verification", label: "Business verification" },
  { key: "inventory", label: "Inventory" },
  { key: "shipping", label: "Shipping & ops" },
  { key: "review", label: "Review & submit" },
];

/**
 * Required fields per step. Used both to gate the Next button and to
 * decide which fields to PATCH to the server on each "Next" click.
 *
 * The `verification` step has no fields (uploads come in the follow-up
 * phase) — Next is always enabled there.
 *
 * `review` is a read-only summary screen — no fields to validate; the
 * Submit button is the only gesture.
 */
const STEP_FIELDS: Record<StepKey, Array<keyof WizardInput>> = {
  business: [
    "businessType",
    "businessTypeOther",
    "businessRegistrationNumber",
    "businessRegistrationCountry",
    "businessIndustry",
    "businessIndustryOther",
  ],
  contact: [
    "contactFullName",
    "contactPosition",
    "contactPhone",
    "contactAddressLine1",
    "contactAddressLine2",
    "contactCountry",
  ],
  identity: ["idType", "idNumber", "idExpirationDate"],
  // KYC v2 Phase 2 — four document uploads. Each one is the public R2
  // URL the wizard saved after the presigned PUT completed; the server
  // persists them on the vendor row in submitKyc.
  verification: ["idFrontUrl", "idBackUrl", "idSelfieUrl", "businessDocUrl"],
  inventory: [
    "productsStoredDescription",
    "monthlyInventoryVolume",
    "monthlyOrderVolume",
  ],
  shipping: [
    "primaryShippingCountries",
    "requiresReturnsHandling",
    "productHazards",
  ],
  review: [],
};

/**
 * Per-step completeness check. Mirrors the server's `superRefine` for
 * the matching subset so users can't click Next past an empty required
 * field — they'd just trip the server validator on the next save.
 */
function isStepComplete(step: StepKey, v: WizardInput): boolean {
  const has = (s: string | null | undefined): s is string =>
    typeof s === "string" && s.trim().length > 0;
  switch (step) {
    case "business":
      if (!has(v.businessType)) return false;
      if (v.businessType === "OTHER" && !has(v.businessTypeOther)) return false;
      if (!has(v.businessRegistrationCountry)) return false;
      if (!/^[A-Za-z]{2}$/.test(v.businessRegistrationCountry ?? "")) return false;
      if (!has(v.businessIndustry)) return false;
      if (v.businessIndustry === "OTHER" && !has(v.businessIndustryOther)) return false;
      return true;
    case "contact":
      return (
        has(v.contactFullName) &&
        has(v.contactPosition) &&
        has(v.contactPhone) &&
        phoneRegex.test(v.contactPhone ?? "") &&
        has(v.contactAddressLine1) &&
        has(v.contactCountry) &&
        /^[A-Za-z]{2}$/.test(v.contactCountry ?? "")
      );
    case "identity":
      return (
        has(v.idType) &&
        has(v.idNumber) &&
        has(v.idExpirationDate) &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.idExpirationDate ?? "")
      );
    case "verification":
      // KYC v2 Phase 2 — every document upload is required before the
      // vendor can advance past this step. The wizard's
      // VerificationStep tile renders an inline error per slot; this
      // guard backs that up so a vendor can't bypass the UI.
      return (
        has(v.idFrontUrl) &&
        has(v.idBackUrl) &&
        has(v.idSelfieUrl) &&
        has(v.businessDocUrl)
      );
    case "inventory":
      return (
        has(v.productsStoredDescription) &&
        has(v.monthlyInventoryVolume) &&
        has(v.monthlyOrderVolume)
      );
    case "shipping":
      return (
        has(v.primaryShippingCountries) &&
        typeof v.requiresReturnsHandling === "boolean" &&
        Array.isArray(v.productHazards) &&
        v.productHazards.length > 0
      );
    case "review":
      // The Submit button is the gesture on this step, but it must only
      // enable when every prior step is complete. Server-side .superRefine
      // enforces the same set — checking here saves the vendor a 400
      // round-trip and lets us name the missing steps in the UI. Keep this
      // list in sync with `submitKycV2Schema.superRefine` in
      // common/schemas/vendor.schema.ts.
      //
      // ALSO require at least one social handle (Instagram / TikTok / X
      // / website URL) — mirrors the backend `submitKyc` `hasAnyHandle`
      // check. The Review step collects these inline so a vendor who
      // skipped /settings can still finish KYC without leaving the page.
      return (
        isStepComplete("business", v) &&
        isStepComplete("contact", v) &&
        isStepComplete("identity", v) &&
        isStepComplete("verification", v) &&
        isStepComplete("inventory", v) &&
        isStepComplete("shipping", v) &&
        (has(v.instagramHandle) ||
          has(v.tiktokHandle) ||
          has(v.xHandle) ||
          has(v.websiteUrl))
      );
  }
}

/**
 * Names of steps the vendor still needs to complete before final submit is
 * allowed. Used on the Review step to tell the vendor exactly which
 * sections to revisit — and to gate the Submit button. Returns the human
 * step labels (matching the progress bar) so the message reads naturally.
 */
function missingStepsForReview(v: WizardInput): string[] {
  const has = (s: string | null | undefined): s is string =>
    typeof s === "string" && s.trim().length > 0;
  const order: StepKey[] = [
    "business",
    "contact",
    "identity",
    "verification",
    "inventory",
    "shipping",
  ];
  const missing = order
    .filter((k) => !isStepComplete(k, v))
    .map((k) => STEPS.find((s) => s.key === k)?.label ?? k);
  // Social presence isn't its own step — it lives in the Review form —
  // but the backend rejects final-submit without at least one handle, so
  // surface it here so the vendor sees a single consolidated to-do list
  // instead of submitting and getting a 400.
  if (
    !has(v.instagramHandle) &&
    !has(v.tiktokHandle) &&
    !has(v.xHandle) &&
    !has(v.websiteUrl)
  ) {
    missing.push("Social presence");
  }
  return missing;
}

/**
 * Translate the wizard form state into the server's payload shape.
 *
 * - Empty strings → undefined (the server treats undefined as "don't touch").
 * - Bare "" enum picks → undefined.
 * - `requiresReturnsHandling === ""` → undefined.
 * - `productHazards` always sent if non-empty.
 *
 * Only the fields in `fieldFilter` (current step's keys + earlier steps'
 * keys) are forwarded; that's what allows step-by-step partial saves.
 *
 * `finalSubmit` adds `submitForReview: true` — the backend uses that flag
 * to flip kycStatus → IN_PROGRESS and queue the admin review.
 */
function buildPayload(
  values: WizardInput,
  fieldFilter: Array<keyof WizardInput>,
  finalSubmit: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const include = (k: keyof WizardInput) => fieldFilter.includes(k);
  const stringIfSet = (k: keyof WizardInput) => {
    if (!include(k)) return;
    const v = values[k];
    if (typeof v === "string" && v.trim().length > 0) out[k] = v.trim();
  };

  stringIfSet("businessType");
  stringIfSet("businessTypeOther");
  stringIfSet("businessRegistrationNumber");
  if (include("businessRegistrationCountry") && values.businessRegistrationCountry) {
    out.businessRegistrationCountry = values.businessRegistrationCountry.toUpperCase();
  }
  stringIfSet("businessIndustry");
  stringIfSet("businessIndustryOther");

  stringIfSet("contactFullName");
  stringIfSet("contactPosition");
  stringIfSet("contactPhone");
  stringIfSet("contactAddressLine1");
  stringIfSet("contactAddressLine2");
  if (include("contactCountry") && values.contactCountry) {
    out.contactCountry = values.contactCountry.toUpperCase();
  }

  stringIfSet("idType");
  stringIfSet("idNumber");
  stringIfSet("idExpirationDate");

  // Section 4 — KYC v2 Phase 2 document upload URLs.
  stringIfSet("idFrontUrl");
  stringIfSet("idBackUrl");
  stringIfSet("idSelfieUrl");
  stringIfSet("businessDocUrl");

  stringIfSet("productsStoredDescription");
  stringIfSet("monthlyInventoryVolume");
  stringIfSet("monthlyOrderVolume");

  stringIfSet("primaryShippingCountries");
  if (include("requiresReturnsHandling") && typeof values.requiresReturnsHandling === "boolean") {
    out.requiresReturnsHandling = values.requiresReturnsHandling;
  }
  if (include("productHazards") && Array.isArray(values.productHazards) && values.productHazards.length > 0) {
    out.productHazards = values.productHazards;
  }

  if (finalSubmit) {
    out.submitForReview = true;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Per-user sessionStorage key — keeps progress across refreshes BEFORE the
// first server save lands.
// ---------------------------------------------------------------------------

function storageKey(userId: string | undefined): string | null {
  if (!userId) return null;
  return `kyc_wizard_v2:${userId}`;
}

function loadFromStorage(userId: string | undefined): Partial<WizardInput> | null {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Partial<WizardInput>;
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(userId: string | undefined, values: WizardInput): void {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage quota / private-mode failures are non-fatal — we still have
    // server-side persistence on every Next. Swallow silently.
  }
}

function clearStorage(userId: string | undefined): void {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VerificationPage(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSubUser = user?.role === "VENDOR_SUB_USER";

  const profileQ = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => api.get<VendorProfile>("/vendors/me"),
  });

  const [currentStep, setCurrentStep] = useState(0);

  // The Zod resolver enforces field-level shape only (everything optional,
  // strings have format checks). Step completeness is layered on top via
  // isStepComplete() so partial saves succeed.
  const form = useForm<WizardInput>({
    resolver: zodResolver(wizardSchema) as unknown as Resolver<WizardInput>,
    defaultValues: EMPTY_WIZARD,
    mode: "onChange",
  });

  // Pre-fill from server + sessionStorage. Server wins for fields the user
  // has already saved; sessionStorage only fills in anything still empty.
  // Run once after profile loads.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !profileQ.data) return;
    const kyc = profileQ.data.kycV2;
    const stored = loadFromStorage(user?.id);
    const merged: WizardInput = {
      ...EMPTY_WIZARD,
      businessType: kyc.businessType ?? stored?.businessType ?? "",
      businessTypeOther: kyc.businessTypeOther ?? stored?.businessTypeOther ?? "",
      businessRegistrationNumber:
        kyc.businessRegistrationNumber ?? stored?.businessRegistrationNumber ?? "",
      businessRegistrationCountry:
        kyc.businessRegistrationCountry ?? stored?.businessRegistrationCountry ?? "",
      businessIndustry: kyc.businessIndustry ?? stored?.businessIndustry ?? "",
      businessIndustryOther: kyc.businessIndustryOther ?? stored?.businessIndustryOther ?? "",
      contactFullName: kyc.contactFullName ?? stored?.contactFullName ?? "",
      contactPosition: kyc.contactPosition ?? stored?.contactPosition ?? "",
      contactPhone: kyc.contactPhone ?? stored?.contactPhone ?? "",
      contactAddressLine1: kyc.contactAddressLine1 ?? stored?.contactAddressLine1 ?? "",
      contactAddressLine2: kyc.contactAddressLine2 ?? stored?.contactAddressLine2 ?? "",
      contactCountry: kyc.contactCountry ?? stored?.contactCountry ?? "",
      idType: kyc.idType ?? stored?.idType ?? "",
      idNumber: kyc.idNumber ?? stored?.idNumber ?? "",
      idExpirationDate: kyc.idExpirationDate ?? stored?.idExpirationDate ?? "",
      idFrontUrl: kyc.idFrontUrl ?? stored?.idFrontUrl ?? "",
      idBackUrl: kyc.idBackUrl ?? stored?.idBackUrl ?? "",
      idSelfieUrl: kyc.idSelfieUrl ?? stored?.idSelfieUrl ?? "",
      businessDocUrl: kyc.businessDocUrl ?? stored?.businessDocUrl ?? "",
      productsStoredDescription:
        kyc.productsStoredDescription ?? stored?.productsStoredDescription ?? "",
      monthlyInventoryVolume:
        kyc.monthlyInventoryVolume ?? stored?.monthlyInventoryVolume ?? "",
      monthlyOrderVolume: kyc.monthlyOrderVolume ?? stored?.monthlyOrderVolume ?? "",
      primaryShippingCountries:
        kyc.primaryShippingCountries ?? stored?.primaryShippingCountries ?? "",
      requiresReturnsHandling:
        typeof kyc.requiresReturnsHandling === "boolean"
          ? kyc.requiresReturnsHandling
          : typeof stored?.requiresReturnsHandling === "boolean"
            ? stored.requiresReturnsHandling
            : "",
      productHazards:
        Array.isArray(kyc.productHazards) && kyc.productHazards.length > 0
          ? kyc.productHazards
          : Array.isArray(stored?.productHazards)
            ? (stored?.productHazards as string[])
            : [],
      // Social handles live at the top level of the /vendors/me payload
      // (next to businessName), not inside `kyc.kycV2`. Pre-fill so a
      // vendor who already filled them on /settings doesn't have to
      // re-type on the Review step.
      instagramHandle:
        profileQ.data.instagramHandle ?? stored?.instagramHandle ?? "",
      tiktokHandle: profileQ.data.tiktokHandle ?? stored?.tiktokHandle ?? "",
      xHandle: profileQ.data.xHandle ?? stored?.xHandle ?? "",
      websiteUrl: profileQ.data.websiteUrl ?? stored?.websiteUrl ?? "",
    };
    form.reset(merged);
    setSeeded(true);
  }, [profileQ.data, seeded, form, user?.id]);

  // Persist on every change (debounced via React's batching to whatever the
  // form's onChange cycle is — small enough payload that we don't need an
  // explicit debounce). sessionStorage is robust enough that synchronous
  // writes on every change are fine.
  const watched = form.watch();
  useEffect(() => {
    if (!seeded) return;
    saveToStorage(user?.id, watched);
  }, [watched, seeded, user?.id]);

  const { bannerError, handle, clear } = useApiErrorHandler(
    form as unknown as UseFormReturn<Record<string, unknown>>,
  );

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Whether any of the four KYC document upload tiles is currently
  // streaming bytes to R2. Tracked here (lifted from VerificationStep)
  // so the wizard's Next button can stay disabled until every upload
  // settles — without this, a vendor who clicks Next mid-upload would
  // race the form.setValue() that records the public URL.
  const [verificationUploading, setVerificationUploading] = useState(false);

  /**
   * "Next" save — POSTs the just-edited step's fields plus everything from
   * prior steps (the server treats it as upsert). On success advances the
   * step counter.
   */
  const stepSaveMut = useMutation({
    mutationFn: async (args: { upToStep: number }): Promise<VendorProfile> => {
      const values = form.getValues();
      const fieldFilter: Array<keyof WizardInput> = STEPS
        .slice(0, args.upToStep + 1)
        .flatMap((s) => STEP_FIELDS[s.key]);
      const payload = buildPayload(values, fieldFilter, false);
      return api.post<VendorProfile>("/vendors/me/kyc/submit", payload);
    },
    onMutate: clear,
    onSuccess: async (_data, vars) => {
      setCurrentStep(Math.min(vars.upToStep + 1, STEPS.length - 1));
      setActionSuccess(null);
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
    },
    onError: (err) => handle(err),
  });

  /**
   * FINAL submit — two-step:
   *   1. PATCH /vendors/me with the four social handles. Empty string
   *      becomes `null` on the wire so the backend stripAt+optionalSocial
   *      schema clears any stale value. We send the entire set on every
   *      submit so the vendor's edits in the Review step always
   *      overwrite whatever's on the row, including clears.
   *   2. POST /vendors/me/kyc/submit with the wizard payload + the
   *      `submitForReview: true` flag. The server stamps kycSubmittedAt
   *      and flips kycStatus → IN_PROGRESS.
   *
   * If step 1 fails (e.g. one of the handles flunks the platform's
   * format check at the backend), we surface the error and skip step 2 —
   * the kyc/submit `hasAnyHandle` check would 400 anyway since none of
   * the handles got persisted.
   */
  const finalSubmitMut = useMutation({
    mutationFn: async (): Promise<VendorProfile> => {
      const values = form.getValues();

      // Step 1 — persist the social handles. Mirror the /settings page's
      // null-on-empty convention so a cleared handle column actually
      // clears server-side.
      await api.patch<unknown>("/vendors/me", {
        instagramHandle:
          values.instagramHandle && values.instagramHandle.length > 0
            ? values.instagramHandle
            : null,
        tiktokHandle:
          values.tiktokHandle && values.tiktokHandle.length > 0
            ? values.tiktokHandle
            : null,
        xHandle:
          values.xHandle && values.xHandle.length > 0 ? values.xHandle : null,
        websiteUrl:
          values.websiteUrl && values.websiteUrl.length > 0
            ? values.websiteUrl
            : null,
      });

      // Step 2 — final KYC submit. Unchanged from before.
      const fieldFilter: Array<keyof WizardInput> = STEPS.flatMap((s) => STEP_FIELDS[s.key]);
      const payload = buildPayload(values, fieldFilter, true);
      return api.post<VendorProfile>("/vendors/me/kyc/submit", payload);
    },
    onMutate: clear,
    onSuccess: async () => {
      setActionSuccess("Submitted. We'll email you when the review is complete.");
      clearStorage(user?.id);
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (profileQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (profileQ.error || !profileQ.data) {
    const normalized = profileQ.error ? normalizeError(profileQ.error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Couldn't load your profile"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "Try again, or contact support."}
        </p>
      </div>
    );
  }

  const profile = profileQ.data;
  const ks = profile.kycStatus;

  // Status panels — for non-editable states, show the previous-page-style
  // verdict instead of the wizard form.
  if (ks === "APPROVED") {
    return (
      <StatusPanel
        eyebrow="  Verification"
        title="You're verified."
        body="Your account is fully verified. You can ship inventory in and place orders."
        tone="success"
        statusLabel={ks}
      >
        <section className="rounded-md border border-line bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                Vendor onboarding guide
              </div>
              <p className="mt-1 max-w-prose text-body-sm text-text-muted">
                Everything you need to get started — sending inventory in, fees,
                fulfillment, and how the portal works. View it online or download a copy.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <a
                href="/vendor-onboarding-guide.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="amber" size="md" withArrow>
                  View guide
                </Button>
              </a>
              <a href="/vendor-onboarding-guide.pdf" download>
                <Button variant="outline" size="md">
                  Download PDF
                </Button>
              </a>
            </div>
          </div>
        </section>
      </StatusPanel>
    );
  }
  if (ks === "IN_PROGRESS") {
    return (
      <StatusPanel
        eyebrow="  Verification"
        title="Review in progress."
        body="Our team is verifying your business. This usually takes one business day."
        tone="warning"
        statusLabel={ks}
      />
    );
  }
  if (ks === "REJECTED") {
    return (
      <StatusPanel
        eyebrow="  Verification"
        title="We couldn't verify your account."
        body="Reach out to support if you have additional documentation."
        tone="error"
        statusLabel={ks}
        rejectionReason={profile.kycRejectionReason ?? null}
      />
    );
  }
  if (isSubUser) {
    return (
      <StatusPanel
        eyebrow="  Verification"
        title="Verification is account-admin only."
        body="Ask your account admin to complete the verification form. Sub-users can't submit on their behalf."
        tone="warning"
        statusLabel={ks}
      />
    );
  }

  // Active wizard. PENDING / REQUIRES_RESUBMISSION / EXPIRED all show the
  // form. Resubmission carries the reviewer note so the vendor knows what
  // to change. The non-null-assert on the step lookup is safe — currentStep
  // is clamped to [0, STEPS.length-1] by the Back/Next handlers — and saves
  // us from `noUncheckedIndexedAccess` widening every read to `| undefined`.
  const safeIdx = Math.min(Math.max(currentStep, 0), STEPS.length - 1);
  const step = STEPS[safeIdx]!;
  const stepKey = step.key;
  const stepValid = isStepComplete(stepKey, watched);
  const onLastStep = safeIdx === STEPS.length - 1;
  const submitDisabled =
    !stepValid || stepSaveMut.isPending || finalSubmitMut.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Verification"
        title="Verify your business."
        description="Provide your business details, identity, and operations so we can activate your account. Each step is saved as you go."
        actions={<StatusPill tone="warning">KYC {ks.replace(/_/g, " ")}</StatusPill>}
      />

      {/* Reviewer note for REQUIRES_RESUBMISSION / EXPIRED. */}
      {(ks === "REQUIRES_RESUBMISSION" || ks === "EXPIRED") && profile.kycRejectionReason ? (
        <section className="rounded-md border-l-4 border-amber bg-cream-soft p-6">
          <div className="font-mono text-mono-label uppercase text-amber">Reviewer note</div>
          <p className="mt-2 whitespace-pre-line text-body-sm text-text">
            {profile.kycRejectionReason}
          </p>
        </section>
      ) : null}

      {/* Progress bar */}
      <section className="rounded-md border border-line bg-white p-5">
        <div className="flex items-baseline justify-between">
          <div className="font-mono text-mono-label uppercase text-text-muted">
            Step {safeIdx + 1} of {STEPS.length}
          </div>
          <div className="font-mono text-mono-label uppercase text-text">
            {step.label}
          </div>
        </div>
        <div className="mt-3 flex gap-1.5" role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={safeIdx + 1}
        >
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={
                "h-1.5 flex-1 rounded-sm " +
                (i <= safeIdx ? "bg-amber" : "bg-line")
              }
              aria-hidden="true"
            />
          ))}
        </div>
      </section>

      {/* Step body */}
      <section className="rounded-md border border-line bg-white p-6">
        {stepKey === "business" ? <BusinessStep form={form} /> : null}
        {stepKey === "contact" ? <ContactStep form={form} /> : null}
        {stepKey === "identity" ? <IdentityStep form={form} /> : null}
        {stepKey === "verification" ? (
          <VerificationStep form={form} onUploadingChange={setVerificationUploading} />
        ) : null}
        {stepKey === "inventory" ? <InventoryStep form={form} /> : null}
        {stepKey === "shipping" ? <ShippingStep form={form} /> : null}
        {stepKey === "review" ? (
          <ReviewStep values={watched} businessName={profile.businessName} form={form} />
        ) : null}
      </section>

      {/* Banner + result */}
      <ErrorBanner error={bannerError} onAction={onAction} />
      {actionSuccess ? (
        <div className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-3 text-body-sm text-success">
          {actionSuccess}
        </div>
      ) : null}

      {/* Missing-fields gate. Only shown on the Review step when one or more
          prior steps are still incomplete. The Submit button below stays
          disabled until this list is empty; the server-side superRefine
          would reject the submit anyway, but blocking it client-side gives
          the vendor a specific list of what to fix without a round-trip.
          Tells them exactly which sections to revisit. */}
      {stepKey === "review" && missingStepsForReview(watched).length > 0 ? (
        <div
          className="rounded-sm border-l-4 border-amber bg-amber/10 px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <div className="font-mono text-mono-label uppercase text-amber">
            Almost there
          </div>
          <p className="mt-1 text-body-sm text-text">
            Finish these steps before submitting:{" "}
            <strong className="text-ink">
              {missingStepsForReview(watched).join(" · ")}
            </strong>
          </p>
        </div>
      ) : null}

      {/* Nav buttons */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={currentStep === 0 || stepSaveMut.isPending || finalSubmitMut.isPending}
          onClick={() => {
            clear();
            setCurrentStep((s) => Math.max(0, s - 1));
          }}
        >
          ← Back
        </Button>

        {onLastStep ? (
          <Button
            type="button"
            variant="amber"
            size="lg"
            withArrow
            loading={finalSubmitMut.isPending}
            disabled={submitDisabled}
            onClick={() => finalSubmitMut.mutate()}
          >
            Submit for review
          </Button>
        ) : (
          <Button
            type="button"
            variant="amber"
            withArrow
            loading={stepSaveMut.isPending}
            // Every step gates on its own validity (verification now
            // requires all four uploads). Also block while an upload
            // tile is mid-PUT so we don't fire Next before the public
            // URL is recorded in form state.
            disabled={
              !stepValid ||
              stepSaveMut.isPending ||
              (stepKey === "verification" && verificationUploading)
            }
            onClick={() => stepSaveMut.mutate({ upToStep: safeIdx })}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status panel — used when the wizard is not editable.
// ---------------------------------------------------------------------------

function StatusPanel(props: {
  eyebrow: string;
  title: string;
  body: string;
  tone: "success" | "warning" | "error";
  statusLabel: string;
  rejectionReason?: string | null;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={props.eyebrow}
        title={props.title}
        description={props.body}
        actions={<StatusPill tone={props.tone}>KYC {props.statusLabel.replace(/_/g, " ")}</StatusPill>}
      />
      {props.rejectionReason ? (
        <section className="rounded-md border-l-4 border-amber bg-cream-soft p-6">
          <div className="font-mono text-mono-label uppercase text-amber">Reviewer note</div>
          <p className="mt-2 whitespace-pre-line text-body-sm text-text">
            {props.rejectionReason}
          </p>
        </section>
      ) : null}
      {props.children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step components — each one renders its section's inputs against the shared
// react-hook-form instance. Kept inline for legibility; the wizard never
// renders more than one at a time.
// ---------------------------------------------------------------------------

type StepProps = { form: UseFormReturn<WizardInput> };

const selectClass =
  "h-11 w-full rounded-sm border bg-cream-soft px-3 text-body text-text outline-none transition-colors duration-fast ease-out focus:ring-2 focus:ring-ink/10 border-line-strong hover:border-text/40 focus:border-ink";

const textareaClass =
  "w-full rounded-sm border bg-cream-soft px-4 py-3 text-body text-text outline-none transition-colors duration-fast ease-out focus:ring-2 focus:ring-ink/10 border-line-strong hover:border-text/40 focus:border-ink";

function BusinessStep({ form }: StepProps): JSX.Element {
  const businessType = form.watch("businessType");
  const businessIndustry = form.watch("businessIndustry");
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <h2 className="md:col-span-2 text-h3 font-semibold text-ink">Business information</h2>

      <Field label="Business type *" error={form.formState.errors.businessType?.message}>
        <select
          aria-label="Business type"
          className={selectClass}
          {...form.register("businessType")}
        >
          <option value="">Select…</option>
          {BUSINESS_TYPES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
      </Field>

      {businessType === "OTHER" ? (
        <Field label="Specify business type *" error={form.formState.errors.businessTypeOther?.message}>
          <Input type="text" {...form.register("businessTypeOther")} />
        </Field>
      ) : (
        <div className="hidden md:block" />
      )}

      <Field label="Business registration number" hint="If applicable." error={form.formState.errors.businessRegistrationNumber?.message}>
        <Input type="text" placeholder="e.g. 12345678" {...form.register("businessRegistrationNumber")} />
      </Field>

      <Field
        label="Country of registration *"
        hint="ISO 3166-1 alpha-2 (e.g. US, GB, NG)"
        error={form.formState.errors.businessRegistrationCountry?.message}
      >
        <Input
          type="text"
          maxLength={2}
          autoComplete="country"
          placeholder="US"
          className="uppercase"
          {...form.register("businessRegistrationCountry")}
        />
      </Field>

      <Field label="Industry / category *" error={form.formState.errors.businessIndustry?.message}>
        <select
          aria-label="Industry"
          className={selectClass}
          {...form.register("businessIndustry")}
        >
          <option value="">Select…</option>
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>
      </Field>

      {businessIndustry === "OTHER" ? (
        <Field label="Specify industry *" error={form.formState.errors.businessIndustryOther?.message}>
          <Input type="text" {...form.register("businessIndustryOther")} />
        </Field>
      ) : (
        <div className="hidden md:block" />
      )}
    </div>
  );
}

/**
 * Convert an ISO 3166-1 alpha-2 code to its corresponding regional-indicator
 * flag emoji ("US" → "🇺🇸"). Pure UI sugar — every modern OS renders these
 * as the country flag; the few legacy systems that don't degrade to the
 * two-letter code, which is also useful information for the picker.
 *
 * Defensive: returns "" for anything that isn't exactly two ASCII letters,
 * so a stray "" or unexpected value can't blow up the render.
 */
function isoToFlagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return "";
  const upper = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const base = 0x1f1e6;
  const a = upper.charCodeAt(0) - 65;
  const b = upper.charCodeAt(1) - 65;
  return String.fromCodePoint(base + a, base + b);
}

/**
 * Given a saved canonical phone number like "+234 805 555 0190", try to
 * separate the dial-code prefix from the local digits.
 *
 * We strip all non-digit characters from the post-"+" portion and then
 * match the longest known dialCode prefix in COUNTRIES. If the saved
 * `contactCountry` ISO code is supplied AND its dialCode is a valid
 * prefix of the digits, prefer it — that disambiguates the many countries
 * that share +1 / +44 / +590 / +599.
 *
 * Returns `null` for unrecognisable input so the caller can fall back to
 * blank values without crashing.
 */
function splitSavedPhone(
  saved: string | null | undefined,
  savedIso: string | null | undefined,
): { iso: string; local: string } | null {
  if (typeof saved !== "string" || saved.trim().length === 0) return null;
  const trimmed = saved.trim();
  // Pull leading + if present, then keep only digits + spaces/dashes/parens.
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed
    .slice(hasPlus ? 1 : 0)
    .replace(/[^0-9]/g, "");
  if (digits.length === 0) return null;

  // Prefer the saved country if its dialCode prefix matches.
  if (savedIso) {
    const dc = getDialCode(savedIso);
    if (dc) {
      const dcDigits = dc.replace(/[^0-9]/g, "");
      if (digits.startsWith(dcDigits)) {
        return { iso: savedIso.toUpperCase(), local: digits.slice(dcDigits.length) };
      }
    }
  }

  // Otherwise scan COUNTRIES for the longest dial-code prefix match.
  let bestIso = "";
  let bestPrefixLen = 0;
  for (const c of COUNTRIES) {
    const dcDigits = c.dialCode.replace(/[^0-9]/g, "");
    if (dcDigits.length > 0 && digits.startsWith(dcDigits) && dcDigits.length > bestPrefixLen) {
      bestPrefixLen = dcDigits.length;
      bestIso = c.code;
    }
  }
  if (bestPrefixLen === 0) return null;
  return { iso: bestIso, local: digits.slice(bestPrefixLen) };
}

function ContactStep({ form }: StepProps): JSX.Element {
  // Watch canonical form values — `contactCountry` is the source of truth
  // for the picker; `contactPhone` is the canonical "+code digits" string
  // the schema validates against and the backend stores.
  const contactCountry = form.watch("contactCountry") ?? "";
  const contactPhone = form.watch("contactPhone") ?? "";

  // Local-only digits the user types into the phone input. Kept in component
  // state because the form schema only knows about the combined value.
  const [localDigits, setLocalDigits] = useState<string>("");

  // One-shot seed: when the wizard pre-fills `contactPhone` from the server,
  // split it into the picker country + local digits. We only run this once
  // per "fresh saved value" so subsequent edits don't fight the user.
  const [seededFromSaved, setSeededFromSaved] = useState(false);
  useEffect(() => {
    if (seededFromSaved) return;
    const split = splitSavedPhone(contactPhone, contactCountry);
    if (!split) {
      // Nothing to seed from, but mark seeded so we don't keep retrying on
      // every keystroke once the user starts typing.
      if (contactPhone.length > 0 || contactCountry.length > 0) {
        setSeededFromSaved(true);
      }
      return;
    }
    // Only update if the picker country isn't already set to the matched
    // one — avoids loops.
    if (split.iso !== contactCountry) {
      form.setValue("contactCountry", split.iso, { shouldValidate: true, shouldDirty: false });
    }
    setLocalDigits(split.local);
    setSeededFromSaved(true);
  }, [seededFromSaved, contactPhone, contactCountry, form]);

  // Recompose the canonical contactPhone whenever either input changes.
  const recomposePhone = (iso: string, digits: string): void => {
    const dc = getDialCode(iso);
    const cleaned = digits.replace(/[^0-9]/g, "");
    const combined = dc && cleaned.length > 0 ? `${dc} ${cleaned}` : dc ? dc : cleaned;
    form.setValue("contactPhone", combined, { shouldValidate: true, shouldDirty: true });
  };

  const onCountryChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const iso = e.target.value.toUpperCase();
    form.setValue("contactCountry", iso, { shouldValidate: true, shouldDirty: true });
    recomposePhone(iso, localDigits);
  };

  const onLocalPhoneChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    // Allow the user to type whatever (spaces / dashes / parens are common
    // in pasted numbers); we sanitise to digits before composing the
    // canonical value, but keep what they typed in the visible input so
    // the cursor doesn't jump.
    const raw = e.target.value;
    setLocalDigits(raw);
    recomposePhone(contactCountry, raw);
  };

  // Stable display list. We don't sort on every render — COUNTRIES is
  // already alphabetised by name in the data file.
  const countryOptions = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        value: c.code,
        // Compact option text so the native select doesn't overflow on
        // mobile: "+234 NG · Nigeria".
        label: `${c.dialCode} ${c.code} · ${c.name}`,
        flag: isoToFlagEmoji(c.code),
      })),
    [],
  );

  // Selected-country pretty label for the trigger (shown as the closed
  // <select> face on most browsers). We can't fully style the closed face,
  // but the option text we render is what most browsers display.
  const phoneError =
    form.formState.errors.contactPhone?.message ??
    form.formState.errors.contactCountry?.message;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <h2 className="md:col-span-2 text-h3 font-semibold text-ink">Primary contact</h2>

      <Field label="Full legal name *" error={form.formState.errors.contactFullName?.message}>
        <Input type="text" autoComplete="name" {...form.register("contactFullName")} />
      </Field>
      <Field label="Position / role *" error={form.formState.errors.contactPosition?.message}>
        <Input type="text" autoComplete="organization-title" {...form.register("contactPosition")} />
      </Field>

      {/*
        Bundled country + phone. The Field's <label> associates with the
        first focusable control (the select). The two controls share a flex
        row that's locked to a known mobile width so the input never
        overflows on a 320px viewport: 136px (select) + 8px (gap) + flex-1
        input ≈ fits with room to spare given the page's outer padding.
      */}
      <Field
        label="Phone (with country code) *"
        hint="We'll send onboarding updates here. Pick your country, type the local number."
        error={phoneError}
        className="md:col-span-2"
      >
        <div className="flex w-full min-w-0 gap-2">
          <select
            aria-label="Country dialing code"
            autoComplete="tel-country-code"
            className={`${selectClass} truncate flex-[0_0_8.5rem] sm:flex-[0_0_10rem]`}
            value={contactCountry}
            onChange={onCountryChange}
          >
            <option value="">Country…</option>
            {countryOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="truncate">
                {opt.flag ? `${opt.flag} ` : ""}
                {opt.label}
              </option>
            ))}
          </select>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Local number"
            className="flex-1 min-w-0"
            value={localDigits}
            onChange={onLocalPhoneChange}
          />
        </div>
      </Field>

      <Field
        label="Address line 1 *"
        error={form.formState.errors.contactAddressLine1?.message}
        className="md:col-span-2"
      >
        <Input type="text" autoComplete="address-line1" {...form.register("contactAddressLine1")} />
      </Field>
      <Field
        label="Address line 2"
        error={form.formState.errors.contactAddressLine2?.message}
        className="md:col-span-2"
      >
        <Input type="text" autoComplete="address-line2" {...form.register("contactAddressLine2")} />
      </Field>
    </div>
  );
}

function IdentityStep({ form }: StepProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <h2 className="md:col-span-2 text-h3 font-semibold text-ink">Identity verification</h2>
      <p className="md:col-span-2 text-body-sm text-text-muted">
        We collect ID details now; document uploads (front, back, selfie) come after this submission.
      </p>

      <Field label="Government-issued ID type *" error={form.formState.errors.idType?.message}>
        <select aria-label="ID type" className={selectClass} {...form.register("idType")}>
          <option value="">Select…</option>
          {ID_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="ID number *" error={form.formState.errors.idNumber?.message}>
        <Input type="text" autoComplete="off" {...form.register("idNumber")} />
      </Field>
      <Field
        label="Expiration date *"
        hint="YYYY-MM-DD"
        error={form.formState.errors.idExpirationDate?.message}
      >
        <Input type="date" {...form.register("idExpirationDate")} />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification step — the four KYC document uploads (migration 0032).
//
// Each tile owns a presign-then-PUT cycle:
//   1. POST /v1/vendors/me/kyc/uploads/presign with { kind, contentType,
//      sizeBytes } → returns { uploadUrl, publicUrl, requiredHeaders }.
//   2. Bare fetch PUT to R2 with the file body. We use plain fetch (NOT
//      api.put) to avoid attaching our Bearer token to a cross-origin
//      R2 host — that would 1) fail SigV4 verification on R2's side and
//      2) leak the token. Same rationale the product image / shopper
//      attachment uploaders document inline.
//   3. form.setValue(<field>, publicUrl) once the PUT succeeds.
//
// Tile state is per-slot — uploading / errored states don't affect the
// other three tiles. The wizard reads back through form.watch() so the
// per-step gate enables Next as soon as all four URLs are populated.
//
// The lifted `onUploadingChange` callback aggregates "any tile mid-PUT"
// state up to the wizard so the Next button can stay disabled while the
// vendor's last byte is on the wire.
// ---------------------------------------------------------------------------

const KYC_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const KYC_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

interface KycPresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  requiredHeaders: Record<string, string>;
  expiresAt: number;
}

type KycUploadKind = "id_front" | "id_back" | "id_selfie" | "business_doc";

function VerificationStep({
  form,
  onUploadingChange,
}: StepProps & { onUploadingChange: (uploading: boolean) => void }): JSX.Element {
  // Track per-tile in-flight state so we can roll up "any uploading?" to
  // the parent. Keyed by `kind` so each tile has an independent toggle.
  const [uploadingByKind, setUploadingByKind] = useState<Record<string, boolean>>({});

  const setUploading = (kind: KycUploadKind, value: boolean) => {
    setUploadingByKind((prev) => {
      const next = { ...prev, [kind]: value };
      // Notify parent in the same render cycle by computing aggregate
      // here. We can't useEffect on `next` cleanly because state updates
      // batch — push the aggregate now.
      const anyUploading = Object.values(next).some(Boolean);
      onUploadingChange(anyUploading);
      return next;
    });
  };

  // Tile descriptors — sourced from the const above with the field name
  // patched in (the const declaration above can't reference the typed
  // form fields without a forward declaration).
  const tiles: ReadonlyArray<{
    kind: KycUploadKind;
    field: "idFrontUrl" | "idBackUrl" | "idSelfieUrl" | "businessDocUrl";
    label: string;
    hint: string;
  }> = [
    {
      kind: "id_front",
      field: "idFrontUrl",
      label: "Government ID — front",
      hint: "Passport, national ID, or driver's license. The whole document must be visible and readable.",
    },
    {
      kind: "id_back",
      field: "idBackUrl",
      label: "Government ID — back",
      hint: "Back side of the same ID. For passports, upload the photo page again.",
    },
    {
      kind: "id_selfie",
      field: "idSelfieUrl",
      label: "ID-holding selfie",
      hint: "A clear photo of you holding the same ID next to your face.",
    },
    {
      kind: "business_doc",
      field: "businessDocUrl",
      label: "Business registration / license",
      hint: "Certificate of incorporation, business license, or equivalent. PDF or image.",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-h3 font-semibold text-ink">Business verification</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Upload your government-issued ID, an ID-holding selfie, and your
          business registration / license document. JPG, PNG, WebP, or PDF.
          Max 10 MB per file. Files upload securely to USA Errands and are
          only visible to our verification team.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tiles.map((t) => (
          <KycUploadTile
            key={t.kind}
            kind={t.kind}
            label={t.label}
            hint={t.hint}
            value={form.watch(t.field) ?? ""}
            onChange={(url) =>
              form.setValue(t.field, url, { shouldDirty: true, shouldValidate: true })
            }
            onUploadingChange={(u) => setUploading(t.kind, u)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single tile in the verification step. Owns its own picker, presign
 * request, R2 PUT, and per-tile error/loading state. The parent owns
 * the form value (so the wizard reads it back via form.watch and the
 * step gate enables Next when all four are populated).
 */
function KycUploadTile({
  kind,
  label,
  hint,
  value,
  onChange,
  onUploadingChange,
}: {
  kind: KycUploadKind;
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
  onUploadingChange: (uploading: boolean) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const allowed = new Set(KYC_UPLOAD_ACCEPT.split(","));

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const picked = e.target.files?.[0];
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = "";
    if (!picked) return;

    if (!allowed.has(picked.type)) {
      setStatus("error");
      setErrorMsg("Unsupported file type. Use JPG, PNG, WebP, or PDF.");
      return;
    }
    if (picked.size > KYC_UPLOAD_MAX_BYTES) {
      setStatus("error");
      setErrorMsg(
        `File too large — max ${KYC_UPLOAD_MAX_BYTES / (1024 * 1024)} MB.`,
      );
      return;
    }

    setStatus("uploading");
    setErrorMsg(null);
    onUploadingChange(true);
    try {
      // Step 1 — presign. The server picks an unguessable R2 key under
      // `kyc/<vendorId>/<kind>/<random>`; we get back the signed PUT URL,
      // the headers we MUST include, and the public URL we'll save back.
      const presigned = await api.post<KycPresignResponse>(
        "/vendors/me/kyc/uploads/presign",
        {
          kind,
          contentType: picked.type as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "application/pdf",
          sizeBytes: picked.size,
          filename: picked.name,
        },
      );

      // Step 2 — bare fetch PUT to R2. NOT api.put — we don't want to
      // attach our Bearer token to a cross-origin host (would fail SigV4
      // and leak the token). Same rationale as ProductImageUploader.
      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: presigned.requiredHeaders,
        body: picked,
      });
      if (!putRes.ok) {
        throw new Error(`R2 rejected the upload (HTTP ${putRes.status}).`);
      }

      onChange(presigned.publicUrl);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      const e =
        err instanceof Error
          ? (err as Error & { status?: number; code?: string; detail?: string })
          : (err as { status?: number; code?: string; message?: string; detail?: string });
      const status = (e as { status?: number }).status;
      const code = (e as { code?: string }).code;
      if (status === 503 || code === "r2_not_configured") {
        setErrorMsg(
          "Document uploads aren't configured for this environment. Contact support.",
        );
      } else if (status === 403) {
        setErrorMsg("Only the vendor admin can upload KYC documents.");
      } else {
        const message =
          (e as { message?: string }).message ?? (e as { detail?: string }).detail;
        setErrorMsg(message ?? "Upload failed — please try again.");
      }
    } finally {
      onUploadingChange(false);
    }
  }

  function openPicker(): void {
    if (status === "uploading") return;
    inputRef.current?.click();
  }

  const uploaded = value.length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-line-strong bg-cream-soft p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text">
          {label}
        </div>
        {uploaded ? (
          <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-success">
            Uploaded
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
            Required
          </span>
        )}
      </div>
      <p className="text-caption text-text-muted">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept={KYC_UPLOAD_ACCEPT}
        className="sr-only"
        onChange={handlePick}
        disabled={status === "uploading"}
        aria-label={`Upload ${label}`}
      />

      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openPicker}
          disabled={status === "uploading"}
          className={
            "inline-flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-white px-3 font-mono text-mono-label uppercase tracking-[1.2px] text-text " +
            (status === "uploading"
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:border-ink")
          }
        >
          {status === "uploading"
            ? "Uploading…"
            : uploaded
              ? "Replace file"
              : "Upload file"}
        </button>
        {uploaded ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
          >
            View uploaded ↗
          </a>
        ) : null}
      </div>

      {status === "error" && errorMsg ? (
        <p className="text-caption text-error" role="alert">
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}

function InventoryStep({ form }: StepProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <h2 className="md:col-span-2 text-h3 font-semibold text-ink">Inventory information</h2>

      <Field
        label="What products will you store with USA Errands? *"
        error={form.formState.errors.productsStoredDescription?.message}
        className="md:col-span-2"
      >
        <textarea
          rows={4}
          className={textareaClass}
          {...form.register("productsStoredDescription")}
        />
      </Field>

      <Field label="Estimated monthly inventory volume *" error={form.formState.errors.monthlyInventoryVolume?.message}>
        <select aria-label="Monthly inventory volume" className={selectClass} {...form.register("monthlyInventoryVolume")}>
          <option value="">Select…</option>
          {INVENTORY_VOLUMES.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Estimated monthly order volume *" error={form.formState.errors.monthlyOrderVolume?.message}>
        <select aria-label="Monthly order volume" className={selectClass} {...form.register("monthlyOrderVolume")}>
          <option value="">Select…</option>
          {ORDER_VOLUMES.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </Field>
      {/* Service intent dropdown removed in migration 0031. */}
    </div>
  );
}

function ShippingStep({ form }: StepProps): JSX.Element {
  const hazards = form.watch("productHazards") ?? [];
  const returns = form.watch("requiresReturnsHandling");

  // "NONE" is mutually exclusive with the other hazard checkboxes. Toggling
  // NONE clears the others; toggling any other clears NONE. We use a single
  // setValue here so react-hook-form keeps the array in sync.
  const toggleHazard = (value: string, checked: boolean): void => {
    const current = new Set(hazards);
    if (checked) {
      if (value === "NONE") {
        form.setValue("productHazards", ["NONE"], { shouldValidate: true, shouldDirty: true });
        return;
      }
      current.delete("NONE");
      current.add(value);
    } else {
      current.delete(value);
    }
    form.setValue("productHazards", Array.from(current), {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <h2 className="text-h3 font-semibold text-ink">Shipping & operations</h2>

      <Field
        label="Primary shipping countries to the U.S. *"
        hint="Comma-separate (e.g. China, Nigeria, UK)"
        error={form.formState.errors.primaryShippingCountries?.message}
      >
        <Input type="text" {...form.register("primaryShippingCountries")} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[11px] uppercase tracking-[1.4px] text-text-muted">
          Will you require returns handling? *
        </legend>
        <div className="flex gap-6 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-body-sm text-text">
            <input
              type="radio"
              name="requiresReturnsHandling"
              checked={returns === true}
              onChange={() =>
                form.setValue("requiresReturnsHandling", true, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            />
            Yes
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-body-sm text-text">
            <input
              type="radio"
              name="requiresReturnsHandling"
              checked={returns === false}
              onChange={() =>
                form.setValue("requiresReturnsHandling", false, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            />
            No
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[11px] uppercase tracking-[1.4px] text-text-muted">
          Do your products contain? * (select all that apply)
        </legend>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {HAZARDS.map((h) => {
            const checked = hazards.includes(h.value);
            return (
              <label
                key={h.value}
                className="flex cursor-pointer items-center gap-2 text-body-sm text-text"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleHazard(h.value, e.target.checked)}
                />
                {h.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review step — read-only summary of every field collected in steps 1–6.
//
// No inputs here; the only gesture is the Submit button rendered by the
// wizard's nav. Empty values render as "Not provided" so the vendor sees
// at a glance what (if anything) they skipped.
// ---------------------------------------------------------------------------

const BUSINESS_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  BUSINESS_TYPES.map((b) => [b.value, b.label]),
);
const INDUSTRY_LABEL: Record<string, string> = Object.fromEntries(
  INDUSTRIES.map((b) => [b.value, b.label]),
);
const ID_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ID_TYPES.map((b) => [b.value, b.label]),
);
const INVENTORY_VOLUME_LABEL: Record<string, string> = Object.fromEntries(
  INVENTORY_VOLUMES.map((b) => [b.value, b.label]),
);
const ORDER_VOLUME_LABEL: Record<string, string> = Object.fromEntries(
  ORDER_VOLUMES.map((b) => [b.value, b.label]),
);
// SERVICE_INTENT_LABEL removed — see migration 0031.
const HAZARD_LABEL: Record<string, string> = Object.fromEntries(
  HAZARDS.map((b) => [b.value, b.label]),
);

function ReviewStep({
  values,
  businessName,
  form,
}: {
  values: WizardInput;
  businessName: string;
  // Review step also collects social handle inputs inline (the backend
  // requires at least one before final submit). It needs the form
  // instance so it can register inputs alongside the read-only summary.
  form: UseFormReturn<WizardInput>;
}): JSX.Element {
  const fmt = (v: string | undefined | null): string =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : "Not provided";
  const fmtEnum = (
    v: string | undefined | null,
    table: Record<string, string>,
  ): string => {
    if (typeof v !== "string" || v.trim().length === 0) return "Not provided";
    return table[v] ?? v;
  };
  const fmtBool = (v: boolean | "" | undefined | null): string => {
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return "Not provided";
  };
  const fmtHazards = (arr: string[] | undefined): string => {
    if (!Array.isArray(arr) || arr.length === 0) return "Not provided";
    return arr.map((h) => HAZARD_LABEL[h] ?? h).join(", ");
  };
  const fmtAddress = (
    line1: string | undefined,
    line2: string | undefined,
    country: string | undefined,
  ): string => {
    const parts = [line1, line2, country]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(" · ") : "Not provided";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-h3 font-semibold text-ink">Review & submit</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Take one last look at the details {businessName} is submitting. Use
          Back if you need to change anything.
        </p>
      </div>

      <ReviewSection title="Business">
        <ReviewRow label="Business type" value={fmtEnum(values.businessType, BUSINESS_TYPE_LABEL)} />
        {values.businessType === "OTHER" ? (
          <ReviewRow label="Business type (other)" value={fmt(values.businessTypeOther)} />
        ) : null}
        <ReviewRow label="Registration number" value={fmt(values.businessRegistrationNumber)} />
        <ReviewRow
          label="Country of registration"
          value={fmt(values.businessRegistrationCountry?.toUpperCase())}
          mono
        />
        <ReviewRow label="Industry" value={fmtEnum(values.businessIndustry, INDUSTRY_LABEL)} />
        {values.businessIndustry === "OTHER" ? (
          <ReviewRow label="Industry (other)" value={fmt(values.businessIndustryOther)} />
        ) : null}
      </ReviewSection>

      <ReviewSection title="Primary contact">
        <ReviewRow label="Full legal name" value={fmt(values.contactFullName)} />
        <ReviewRow label="Position / role" value={fmt(values.contactPosition)} />
        <ReviewRow label="Phone" value={fmt(values.contactPhone)} mono />
        <ReviewRow
          label="Address"
          value={fmtAddress(
            values.contactAddressLine1,
            values.contactAddressLine2,
            values.contactCountry?.toUpperCase(),
          )}
        />
      </ReviewSection>

      <ReviewSection title="Identity">
        <ReviewRow label="ID type" value={fmtEnum(values.idType, ID_TYPE_LABEL)} />
        <ReviewRow label="ID number" value={fmt(values.idNumber)} mono />
        <ReviewRow label="Expiration date" value={fmt(values.idExpirationDate)} mono />
      </ReviewSection>

      <ReviewSection title="Business verification">
        <ReviewRow
          label="ID front"
          value={values.idFrontUrl ? "Uploaded" : "Not provided"}
        />
        <ReviewRow
          label="ID back"
          value={values.idBackUrl ? "Uploaded" : "Not provided"}
        />
        <ReviewRow
          label="ID-holding selfie"
          value={values.idSelfieUrl ? "Uploaded" : "Not provided"}
        />
        <ReviewRow
          label="Business registration / license"
          value={values.businessDocUrl ? "Uploaded" : "Not provided"}
        />
      </ReviewSection>

      <ReviewSection title="Inventory">
        <ReviewRow
          label="Products stored"
          value={fmt(values.productsStoredDescription)}
          multiline
        />
        <ReviewRow
          label="Monthly inventory volume"
          value={fmtEnum(values.monthlyInventoryVolume, INVENTORY_VOLUME_LABEL)}
        />
        <ReviewRow
          label="Monthly order volume"
          value={fmtEnum(values.monthlyOrderVolume, ORDER_VOLUME_LABEL)}
        />
        {/* Service intent row removed — see migration 0031. */}
      </ReviewSection>

      <ReviewSection title="Shipping & operations">
        <ReviewRow
          label="Primary shipping countries"
          value={fmt(values.primaryShippingCountries)}
        />
        <ReviewRow
          label="Returns handling needed"
          value={fmtBool(values.requiresReturnsHandling)}
        />
        <ReviewRow label="Product hazards" value={fmtHazards(values.productHazards)} />
      </ReviewSection>

      {/* Online presence — collected inline on the Review step so a
          vendor who skipped /settings can still finish KYC without
          leaving. Backend gates on at least one being filled
          (see `submitKyc` `hasAnyHandle` check). */}
      <div>
        <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
          Online presence
        </div>
        <p className="mt-1 text-body-sm text-text-muted">
          Provide at least one — a public profile or a working website. We
          use it to verify you&apos;re a real business.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Instagram handle"
            error={form.formState.errors.instagramHandle?.message}
          >
            <Input
              type="text"
              placeholder="yourbrand"
              autoComplete="off"
              {...form.register("instagramHandle")}
            />
          </Field>
          <Field
            label="TikTok handle"
            error={form.formState.errors.tiktokHandle?.message}
          >
            <Input
              type="text"
              placeholder="yourbrand"
              autoComplete="off"
              {...form.register("tiktokHandle")}
            />
          </Field>
          <Field label="X handle" error={form.formState.errors.xHandle?.message}>
            <Input
              type="text"
              placeholder="yourbrand"
              autoComplete="off"
              {...form.register("xHandle")}
            />
          </Field>
          <Field
            label="Website URL"
            error={form.formState.errors.websiteUrl?.message}
            hint="Just the domain is fine — we'll prepend https:// for you."
          >
            {/*
              The `type="url"` was triggering the browser's native "Please
              enter a URL." tooltip when a vendor typed a bare domain like
              "example.com". We swap to `type="text"` + `inputMode="url"`
              so mobile still shows the URL keyboard but the browser stops
              second-guessing us, and the onBlur handler auto-prepends
              `https://` to anything that doesn't already start with a
              protocol — so the Zod URL regex passes too.

              We bind to the `register` output but wrap its onBlur so RHF
              also gets the value-set notification (otherwise the cached
              form state stays stale until the next render).
            */}
            {(() => {
              const reg = form.register("websiteUrl");
              return (
                <Input
                  type="text"
                  inputMode="url"
                  placeholder="example.com"
                  autoComplete="url"
                  {...reg}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (raw.length > 0 && !/^https?:\/\//i.test(raw)) {
                      form.setValue("websiteUrl", `https://${raw}`, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }
                    // Let RHF run its own onBlur after we've patched the value.
                    void reg.onBlur(e);
                  }}
                />
              );
            })()}
          </Field>
        </div>
      </div>

      <p className="text-body-sm text-text-muted">
        By submitting you confirm the above information is accurate. Our team
        will review within 1 business day.
      </p>
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        {title}
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-y-2 sm:grid-cols-[220px_minmax(0,1fr)] text-body-sm">
        {children}
      </dl>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}): JSX.Element {
  const empty = value === "Not provided";
  return (
    <>
      <dt className="font-mono text-mono-label uppercase text-text-muted">
        {label}
      </dt>
      <dd
        className={
          (mono ? "font-mono " : "") +
          (multiline ? "whitespace-pre-line " : "") +
          (empty ? "text-text-muted italic" : "text-text")
        }
      >
        {value}
      </dd>
    </>
  );
}

