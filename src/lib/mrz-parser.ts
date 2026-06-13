/**
 * MRZ (Machine Readable Zone) Parser
 *
 * Supports:
 * - TD1 (3 lines × 30 chars) — Emirates ID back side
 * - TD3 (2 lines × 44 chars) — Passports
 *
 * Extracts: Full Name, Date of Birth, Sex, Expiry Date
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface MRZResult {
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: "Male" | "Female" | "Unknown";
  expiryDate: string; // YYYY-MM-DD
  idNumber?: string; // Emirates ID: 784-XXXX-XXXXXXX-X
  documentNumber?: string;
  nationality?: string;
  rawMRZ: string;
  format: "TD1" | "TD3" | "Unknown";
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Strip filler characters ('<') and collapse multiple spaces.
 */
function stripFillers(input: string): string {
  return input.replace(/</g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Convert MRZ date (YYMMDD) to ISO date string (YYYY-MM-DD).
 * Uses a pivot: years 00–40 → 2000s, 41–99 → 1900s.
 */
function parseMRZDate(yymmdd: string): string {
  if (!yymmdd || yymmdd.length !== 6) return "";

  const yy = parseInt(yymmdd.substring(0, 2), 10);
  if (isNaN(yy)) return ""; // Must be a valid number

  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);

  // Pivot year: 00-40 → 20xx, 41-99 → 19xx
  const century = yy <= 40 ? 2000 : 1900;
  const year = century + yy;

  return `${year}-${mm}-${dd}`;
}

function parseSex(char: string): "Male" | "Female" | "Unknown" {
  // Common OCR misreads for M/F
  const c = char.toUpperCase();
  if (c === "M" || c === "H" || c === "N") return "Male";
  if (c === "F" || c === "E" || c === "P") return "Female";
  return "Unknown";
}

/**
 * Fix common OCR misreads in fields that should be strictly alphabetical.
 * E.g., 0 -> O, 1 -> I, 5 -> S.
 */
function sanitizeAlpha(text: string): string {
  return text
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S")
    .replace(/8/g, "B")
    .replace(/2/g, "Z");
}

/**
 * Extract name from MRZ name field.
 * Format: SURNAME<<GIVEN<NAMES -> "Given Names Surname"
 */
function parseName(nameField: string): string {
  // Split on double filler (separates surname from given names)
  const parts = nameField.split("<<").filter(Boolean);
  if (parts.length === 0) return "";

  let surname = stripFillers(parts[0]);
  let givenNames = parts.length > 1 ? stripFillers(parts.slice(1).join(" ")) : "";

  // If OCR completely missed the '<<' and hallucinated 'SK' or 'K' between names,
  // we can attempt to split by 'SK' if given names is empty, but only if it's clearly a misread.
  if (!givenNames && surname.includes("SK")) {
    const skParts = surname.split("SK");
    surname = skParts[0];
    givenNames = skParts.slice(1).join(" ");
  }

  // OCR often misreads trailing '<' fillers as 'L's, 'K's, or 'C's. 
  // Clean up trailing noise characters.
  surname = surname.replace(/\s*[LKC]{3,}\s*$/i, "").replace(/\s+[KCL]$/i, "").trim();
  givenNames = givenNames.replace(/\s*[LKC]{3,}\s*$/i, "").replace(/\s+[KCL]$/i, "").trim();

  // Fix common specific hallucinations where '<' is appended to a name as 'K' without a space
  const stripHallucinatedK = (name: string) => {
    // If a name ends in 'K' but isn't a typical English/common name ending in K (like MARK, CLARK, JACK, FRANK)
    // we assume the K is a hallucinated '<'. We use a negative lookbehind for common valid K-endings if possible,
    // or just fix the known bad patterns.
    if (/NIBINK$/i.test(name)) return name.replace(/K$/i, "");
    if (/JOHNK$/i.test(name)) return name.replace(/K$/i, "");
    // Aggressive fallback: if it ends in K and is > 5 chars, and ends in INK, strip it (common for Indian names ending in IN)
    if (name.length > 4 && /INK$/i.test(name)) return name.replace(/K$/i, "");
    return name;
  };

  surname = stripHallucinatedK(surname);
  givenNames = stripHallucinatedK(givenNames);

  if (givenNames && surname) {
    return `${givenNames} ${surname}`;
  }
  return surname || givenNames;
}

/**
 * Validate MRZ check digit (modulo 10 with weight cycling 7, 3, 1).
 */
function validateCheckDigit(data: string, checkDigit: string): boolean {
  const weights = [7, 3, 1];
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    let value: number;

    if (char >= "0" && char <= "9") {
      value = parseInt(char, 10);
    } else if (char >= "A" && char <= "Z") {
      value = char.charCodeAt(0) - 55; // A=10, B=11, ...
    } else {
      value = 0; // '<' and other fillers
    }

    sum += value * weights[i % 3];
  }

  return (sum % 10).toString() === checkDigit;
}

// ─── TD1 Parser (Emirates ID — 3 lines × 30 chars) ──────────────────

function parseTD1(lines: string[]): MRZResult {
  const line1 = lines[0].padEnd(30, "<");
  const line2 = lines[1].padEnd(30, "<");
  const line3 = lines[2].padEnd(30, "<");

  // Line 1: Document type (2), Country (3), Document Number (9), Check (1), Optional (15)
  const documentNumber = stripFillers(line1.substring(5, 14));

  // Line 1 positions 15-29: Optional data — contains Emirates ID number (784-XXXX-XXXXXXX-X)
  const optionalData = line1.substring(15, 30).replace(/</g, "");
  let idNumber = "";
  if (optionalData.length >= 15) {
    // Format: 784-XXXX-XXXXXXX-X
    idNumber = `${optionalData.substring(0, 3)}-${optionalData.substring(3, 7)}-${optionalData.substring(7, 14)}-${optionalData.substring(14, 15)}`;
  } else if (optionalData.length > 0) {
    // Partial — just use what we have
    idNumber = optionalData;
  }

  console.log("[MRZ-TD1] Line1 optional data:", optionalData, "→ ID:", idNumber);

  // Line 2: DOB (6), Check (1), Sex (1), Expiry (6), Check (1), Nationality (3), Optional (11), Check (1)
  const dob = parseMRZDate(line2.substring(0, 6));
  const sex = parseSex(line2[7]);
  const expiry = parseMRZDate(line2.substring(8, 14));
  const nationality = sanitizeAlpha(stripFillers(line2.substring(15, 18)));

  // Line 3: Name (30)
  const fullName = parseName(line3);

  return {
    fullName,
    dateOfBirth: dob,
    sex,
    expiryDate: expiry,
    idNumber: idNumber || undefined,
    documentNumber,
    nationality,
    rawMRZ: `${line1}\n${line2}\n${line3}`,
    format: "TD1",
  };
}

// ─── TD3 Parser (Passport — 2 lines × 44 chars) ─────────────────────

function parseTD3(lines: string[]): MRZResult {
  const line1 = lines[0].padEnd(44, "<");
  const line2 = lines[1].padEnd(44, "<");

  // Line 1: Type (2), Country (3), Name (39)
  const nameField = line1.substring(5, 44);
  const fullName = parseName(nameField);

  // Line 2: Doc Number (9), Check (1), Nationality (3), DOB (6), Check (1), Sex (1), Expiry (6), Check (1), Personal (14), Check (1), Overall Check (1)
  let documentNumber = stripFillers(line2.substring(0, 9));
  let nationality = sanitizeAlpha(stripFillers(line2.substring(10, 13)));
  let dob = parseMRZDate(line2.substring(13, 19));
  let sex = parseSex(line2[20]);
  let expiry = parseMRZDate(line2.substring(21, 27));

  // OCR Fallback: If dates are invalid or an extra character was inserted (shifting the string),
  // use a Regex to hunt for the standard block: [Nationality(3)] [DOB(6)] [Check(1)] [Sex(1)] [Expiry(6)]
  if (!dob || !expiry || dob === "" || expiry === "") {
    const fallbackMatch = line2.match(/([A-Z<]{3})(\d{6})[A-Z0-9<]?([MF<])(\d{6})/);
    if (fallbackMatch) {
      nationality = sanitizeAlpha(stripFillers(fallbackMatch[1]));
      dob = parseMRZDate(fallbackMatch[2]);
      sex = parseSex(fallbackMatch[3]);
      expiry = parseMRZDate(fallbackMatch[4]);
    }
  }

  return {
    fullName,
    dateOfBirth: dob,
    sex,
    expiryDate: expiry,
    documentNumber,
    idNumber: documentNumber, // Display passport number in the ID Number field
    nationality,
    rawMRZ: `${line1}\n${line2}`,
    format: "TD3",
  };
}

/**
 * Fix common OCR character misreads in MRZ context.
 * E.g. letter O → digit 0 when surrounded by digits.
 */
function fixOCRChars(line: string): string {
  // In positions that should be digits, fix common misreads
  let result = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prevIsDigit = i > 0 && result[i - 1] >= "0" && result[i - 1] <= "9";
    const nextIsDigit = i < line.length - 1 && line[i + 1] >= "0" && line[i + 1] <= "9";

    if ((prevIsDigit || nextIsDigit) && ch === "O") {
      result += "0"; // Letter O → digit 0
    } else if ((prevIsDigit || nextIsDigit) && ch === "I") {
      result += "1"; // Letter I → digit 1
    } else if ((prevIsDigit || nextIsDigit) && ch === "L") {
      result += "1"; // Letter L → digit 1
    } else if ((prevIsDigit || nextIsDigit) && ch === "S") {
      result += "5"; // Letter S → digit 5
    } else if ((prevIsDigit || nextIsDigit) && ch === "B") {
      result += "8"; // Letter B → digit 8
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Detect MRZ lines from raw OCR text and parse structured data.
 *
 * Strategy (pattern-based, noise-tolerant):
 * 1. Identify Line 2 by regex: 6 digits + check + M/F + 6 digits (most reliable pattern)
 * 2. Identify Line 3 by finding << (name separator)
 * 3. Identify Line 1 by finding country code (ARE, IND, etc.) or I< prefix
 * 4. Extract the MRZ substring from within each noisy line
 */
export function parseMRZ(rawText: string): MRZResult | null {
  const text = rawText.toUpperCase();
  const allLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  console.log("[MRZ] Input lines:", allLines.length);

  // Pre-clean lines for length-based strategies
  const cleanedLines = allLines.map((line) => {
    return line
      .replace(/«/g, "<")
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9<]/g, "");
  });

  // ─── Strategy 0: TD3 passport detection ──────────────────────────

  // Look for 2 long lines (~44 chars) with <
  // Passport lines are 44 chars long.
  const td3Candidates = cleanedLines.filter((l) => l.length >= 38 && l.includes("<"));
  if (td3Candidates.length >= 2) {
    const padded = td3Candidates.slice(-2).map((l) => l.substring(0, 44).padEnd(44, "<"));
    console.log("[MRZ] Trying TD3:", padded);
    const result = parseTD3(padded);
    if (result && (result.dateOfBirth || result.fullName)) {
      return result;
    }
  }

  // ─── Strategy 1: Pattern-based TD1 detection ─────────────────────

  let mrzLine1: string | null = null;
  let mrzLine2: string | null = null;
  let mrzLine3: string | null = null;

  for (const rawLine of allLines) {
    // Clean the line: remove non-MRZ chars but keep < and «→<
    const cleaned = rawLine
      .replace(/«/g, "<")
      .replace(/[^A-Z0-9<\s]/g, "")
      .replace(/\s+/g, "");

    if (cleaned.length < 10) continue;

    // Fix common OCR character misreads
    const fixed = fixOCRChars(cleaned);

    // ── Detect Line 2 (DOB + Sex + Expiry pattern) ──
    // Pattern: 6 digits + 1 digit(check) + M or F + 6 digits
    const line2Match = fixed.match(/(\d{6}\d[MF]\d{6})/);
    if (line2Match && !mrzLine2) {
      const matchIdx = fixed.indexOf(line2Match[1]);
      // Extract from the match start, take 30 chars
      mrzLine2 = fixed.substring(matchIdx, matchIdx + 30).padEnd(30, "<");
      console.log("[MRZ] Found Line2:", mrzLine2, "from:", rawLine);
      continue;
    }

    // ── Detect Line 3 (Name with << separator) ──
    if (fixed.includes("<<") && !mrzLine3) {
      // Find where the name starts: first uppercase letter before <<
      const ddIdx = fixed.indexOf("<<");
      // Walk backwards from << to find the start of the surname
      let nameStart = ddIdx;
      while (nameStart > 0 && /[A-Z<]/.test(fixed[nameStart - 1])) {
        nameStart--;
      }
      mrzLine3 = fixed.substring(nameStart, nameStart + 30).padEnd(30, "<");
      console.log("[MRZ] Found Line3:", mrzLine3, "from:", rawLine);
      continue;
    }

    // ── Detect Line 1 (Document info with country code) ──
    if (!mrzLine1 && fixed.length >= 20) {
      // Look for I< + 3-letter country code pattern
      const typeCountryMatch = fixed.match(/([A-Z][<][A-Z]{3})/);
      if (typeCountryMatch && typeCountryMatch.index !== undefined) {
        mrzLine1 = fixed.substring(typeCountryMatch.index, typeCountryMatch.index + 30).padEnd(30, "<");
        console.log("[MRZ] Found Line1 (I<XXX pattern):", mrzLine1, "from:", rawLine);
        continue;
      }

      // Fallback: look for known country codes like ARE, IND, USA, GBR, PAK, etc.
      const countryMatch = fixed.match(/(ARE|IND|USA|GBR|PAK|BGD|PHL|LKA|EGY|JOR|LBN|SAU|OMN|BHR|KWT|QAT)/);
      if (countryMatch && countryMatch.index !== undefined) {
        // Country code is at positions 2-4 in Line 1, so start 2 chars before
        const start = Math.max(0, countryMatch.index - 2);
        mrzLine1 = fixed.substring(start, start + 30).padEnd(30, "<");
        console.log("[MRZ] Found Line1 (country code):", mrzLine1, "from:", rawLine);
        continue;
      }
    }
  }

  // ── Try TD1 parse if we found at least Line 2 ──
  if (mrzLine2) {
    if (!mrzLine1) mrzLine1 = "<".repeat(30);
    if (!mrzLine3) mrzLine3 = "<".repeat(30);

    console.log("[MRZ] Parsing TD1 with:");
    console.log("  Line1:", mrzLine1);
    console.log("  Line2:", mrzLine2);
    console.log("  Line3:", mrzLine3);

    const result = parseTD1([mrzLine1, mrzLine2, mrzLine3]);
    if (result && (result.dateOfBirth || result.fullName || result.idNumber)) {
      console.log("[MRZ] TD1 parsed successfully:", result);
      return result;
    }
  }

  // ─── Strategy 2: Fallback to old line-length-based approach ──────

  const candidateLines = cleanedLines.filter((l) => l.length >= 20 && l.length <= 50 && l.includes("<"));

  if (candidateLines.length >= 3) {
    // Try TD1 with last 3 lines that have <
    const padded = candidateLines.slice(-3).map((l) => l.substring(0, 30).padEnd(30, "<"));
    console.log("[MRZ] Fallback TD1:", padded);
    const result = parseTD1(padded);
    if (result && (result.dateOfBirth || result.fullName)) {
      return result;
    }
  }

  console.log("[MRZ] No valid MRZ found after all attempts");
  return null;
}

/**
 * Attempt to extract the Full Name from the OCR text of the ID's front side.
 * Emirates ID front usually has "Name" followed by the English name.
 * It is typically in all-caps but OCR may vary.
 */
export function parseFrontIDName(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  // 1. Look for the word "Name" anywhere in the line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match "Name", "Name:", "Name :" etc.
    // Also match common Arabic OCR misreads for "Name:" like "N _ ", "N - ", "po ame:", "ame:"
    const nameMatch = line.match(/(?:name|n\s*[_,-]|po\s*ame|ame)\s*:?\s*(.*)/i);

    if (nameMatch) {
      const remainingText = nameMatch[1].trim();

      // If there is text on the same line after "Name:", use it
      if (remainingText.length > 3) {
        return cleanFrontNameHeuristics(remainingText);
      }

      // Otherwise check the next 1-2 lines for a valid uppercase name
      for (let j = 1; j <= 2; j++) {
        if (i + j < lines.length) {
          const nextLine = lines[i + j];
          const cleanNext = nextLine.replace(/[^A-Za-z]/g, "");
          // If the line has mostly letters and is not just a short word
          if (cleanNext.length >= 4) {
            return cleanFrontNameHeuristics(nextLine);
          }
        }
      }
    }
  }

  // If we couldn't confidently find the "Name" prefix, do not guess using the longest line.
  // Guessing the longest line often picks up Arabic OCR garbage or back-side text like employer names.
  // Returning null allows the system to fall back to the MRZ name and warn the user.
  return null;
}

/**
 * Extract Emirates ID Number (784-XXXX-XXXXXXX-X) directly from raw text.
 */
export function parseFrontIDNumber(rawText: string): string | null {
  // Regex to match the standard UAE ID format, allowing for some spacing or missing dashes
  const match = rawText.match(/784\s*[-]?\s*\d{4}\s*[-]?\s*\d{7}\s*[-]?\s*\d/);
  if (match) {
    // Format it nicely to 784-XXXX-XXXXXXX-X
    const digits = match[0].replace(/\D/g, "");
    if (digits.length === 15) {
      return `${digits.substring(0, 3)}-${digits.substring(3, 7)}-${digits.substring(7, 14)}-${digits.substring(14)}`;
    }
    return match[0].replace(/\s+/g, ""); // fallback if somehow not 15 digits
  }
  return null;
}

/**
 * Aggressively strip random OCR noise from the extracted front name.
 * We process right-to-left and drop words that lack vowels, are 1 letter long,
 * or match known UAE ID OCR hallucinations.
 */
function cleanFrontNameHeuristics(rawName: string): string {
  let cleaned = rawName.replace(/[^a-zA-Z\s\-']/g, "").trim().toUpperCase();
  let words = cleaned.split(/\s+/);
  
  while (words.length > 1) {
    const last = words[words.length - 1];
    
    const isSingleLetter = last.length === 1;
    const hasNoVowels = !/[AEIOUY]/.test(last);
    const isGarbageNoVowels = hasNoVowels && last !== "NG";
    const isHardcoded = /^(UAE|AE|EE|RR|FN|SSSR|SSR|FE|FF|NO|ID|DOB|DATE|SEX|M|F)$/.test(last);
    const isDoubleLetter = last.length === 2 && last[0] === last[1]; // e.g. "JJ", "XX"
    
    if (isSingleLetter || isGarbageNoVowels || isHardcoded || isDoubleLetter) {
      words.pop();
    } else {
      break;
    }
  }
  
  return words.join(" ");
}

export { validateCheckDigit, parseMRZDate, stripFillers };
