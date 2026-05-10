/**
 * Code128B barcode encoder + SVG renderer.
 *
 * Why hand-rolled: Code128 is a well-defined ISO/IEC 15417 algorithm and a
 * minimal implementation is under 100 lines. Pulling a barcode library
 * (jsbarcode, etc.) for one warehouse-label use case is not worth the
 * dependency footprint and the audit cost.
 *
 * Subset choice: Code128B handles all printable ASCII (uppercase, lowercase,
 * digits, common symbols including hyphens). Our SKU format
 * `UER-XXXXXX-XXXX-XXX-XXX-XXX` fits cleanly. We don't switch to Subset C
 * for digit pairs — the marginal width saving isn't worth the encoder
 * complexity at this scale.
 *
 * Output: an inline SVG string sized to the requested width × height. The
 * caller can drop it straight into a `dangerouslySetInnerHTML` or render
 * each module manually. We return SVG (not canvas) so the print path stays
 * vector-perfect at any DPI.
 */

// Code128 module-width patterns. Each value maps to a string of 6 digits
// representing alternating bar/space widths in modules. Sourced from the
// public Code128 specification table (values 0–106 + Stop).
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/**
 * Encode a string as Code128B and return an inline SVG.
 *
 * Throws on input characters outside the Code128B printable ASCII range
 * (32..126). Caller is expected to sanitise or use a different encoding
 * for non-ASCII strings.
 */
export interface BarcodeOptions {
  /** Pixel width of one module (the narrowest bar). 2 is a sensible default. */
  moduleWidth?: number;
  /** Pixel height of the bars. Doesn't include any human-readable text. */
  height?: number;
  /** Pixel padding (quiet zone) on each side. Spec recommends ≥10 modules. */
  quietZone?: number;
  /** SVG `class` attribute to attach. */
  className?: string;
}

export function encodeCode128B(input: string, opts: BarcodeOptions = {}): string {
  if (input.length === 0) {
    throw new Error("Code128: input cannot be empty.");
  }
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(
        `Code128B: character "${ch}" (U+${code.toString(16).padStart(4, "0")}) is out of range (printable ASCII only).`,
      );
    }
  }

  const moduleWidth = opts.moduleWidth ?? 2;
  const height = opts.height ?? 60;
  const quietZone = opts.quietZone ?? 20;
  const className = opts.className ?? "";

  // Build the value sequence: start_B + each char (value = ASCII − 32) +
  // checksum + stop. Checksum = (start + Σ(i × value_i)) mod 103.
  const values: number[] = [START_B];
  for (let i = 0; i < input.length; i++) {
    values.push(input.charCodeAt(i) - 32);
  }
  let sum = START_B;
  for (let i = 0; i < input.length; i++) {
    sum += (i + 1) * (input.charCodeAt(i) - 32);
  }
  values.push(sum % 103);
  values.push(STOP);

  // Convert to module-string. Each value is a 6-char width string
  // (Stop is 7 chars — the spec spells out the trailing extra bar).
  let modules = "";
  let isBar = true; // first module is always a bar
  for (const v of values) {
    const pat = PATTERNS[v];
    if (!pat) throw new Error(`Code128: missing pattern for value ${v}.`);
    for (const ch of pat) {
      const w = parseInt(ch, 10);
      modules += (isBar ? "1" : "0").repeat(w);
      isBar = !isBar;
    }
    // Reset starting polarity for each character — the patterns themselves
    // alternate, so after a 6-char pattern we naturally land on a bar again.
    isBar = true;
  }

  // Render as SVG rectangles for every run of '1's.
  const totalModules = modules.length;
  const innerWidth = totalModules * moduleWidth;
  const fullWidth = innerWidth + quietZone * 2;
  const fullHeight = height;

  let rects = "";
  let x = quietZone;
  let i = 0;
  while (i < totalModules) {
    if (modules[i] === "1") {
      let runEnd = i;
      while (runEnd < totalModules && modules[runEnd] === "1") runEnd++;
      const runLen = runEnd - i;
      rects += `<rect x="${x}" y="0" width="${runLen * moduleWidth}" height="${fullHeight}" fill="#000"/>`;
      x += runLen * moduleWidth;
      i = runEnd;
    } else {
      x += moduleWidth;
      i += 1;
    }
  }

  // viewBox keeps the barcode crisp at any rendered size; consumers can
  // wrap the returned SVG in a sized container without the bars going fuzzy.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullWidth} ${fullHeight}" preserveAspectRatio="xMidYMid meet" class="${className}" role="img" aria-label="Barcode: ${escapeAttr(input)}">${rects}</svg>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
