/**
 * Canonical list of US states + DC + territories.
 *
 * Single source of truth for any dropdown that asks the user for a state.
 * The two-letter `code` is what we store / send to the backend; the `name`
 * is the human label shown in the UI. Sorting is alphabetical by name so
 * users can scan quickly.
 *
 * Coverage mirrors the backend's `US_STATES` Set in smarty.service.ts +
 * the regex in order.schema.ts — every code here passes server-side
 * validation. Edit both in lockstep if a new territory is added.
 *
 * NB: the US Census + USPS treat the territories (PR / VI / GU / AS / MP)
 * as valid recipient states for domestic shipping. We accept them at the
 * schema layer; whether carriers can actually deliver depends on the
 * destination + service (USPS yes, UPS / FedEx variable).
 */

export interface UsState {
  code: string;
  name: string;
}

export const US_STATES: ReadonlyArray<UsState> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  // Territories — domestic for USPS purposes.
  { code: "AS", name: "American Samoa" },
  { code: "GU", name: "Guam" },
  { code: "MP", name: "Northern Mariana Islands" },
  { code: "PR", name: "Puerto Rico" },
  { code: "VI", name: "US Virgin Islands" },
];

/** Convenience lookup — returns the human name for a code, or the code itself. */
export function nameForState(code: string): string {
  const match = US_STATES.find((s) => s.code === code.toUpperCase());
  return match?.name ?? code;
}
