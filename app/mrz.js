// Emirates ID back-side MRZ parser (TD1 format, 3 lines x 30 chars).
// Line 1: I<ARE<docNo<check<<<<<<<784YYYYNNNNNNNC      (Emirates ID embedded as optional data)
// Line 2: YYMMDD<C<sex<YYMMDD<C<NAT<<<<<<<<<<<C
// Line 3: SURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<

function normalizeLine(line) {
  return line.toUpperCase().replace(/[^A-Z0-9<]/g, "").trim();
}

// Pick the three MRZ lines from raw OCR text.
// We do NOT require '<' on every line, because OCR often turns the leading
// 'I<' of line 1 into 'IL', 'IK', 'IC', etc. Instead we look for 3 long
// uppercase/digit/< lines near the bottom of the text.
export function extractMrzLines(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length >= 24);
  return lines.slice(-3);
}

function parseDate(yyMMdd) {
  if (!/^\d{6}$/.test(yyMMdd)) return null;
  const yy = parseInt(yyMMdd.slice(0, 2), 10);
  const mm = yyMMdd.slice(2, 4);
  const dd = yyMMdd.slice(4, 6);
  return { yy, mm, dd, fullYear20: 2000 + yy, fullYear19: 1900 + yy };
}

function pickBirthYear(d) {
  if (!d) return "";
  const now = new Date().getFullYear();
  const y = d.fullYear20 > now ? d.fullYear19 : d.fullYear20;
  return `${y}-${d.mm}-${d.dd}`;
}

function pickExpiryYear(d) {
  if (!d) return "";
  return `${d.fullYear20}-${d.mm}-${d.dd}`;
}

// OCR-tolerant: in positions where digits are expected, treat O→0, I/L→1, S→5, B→8, Z→2.
function toDigits(s) {
  return s
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2")
    .replace(/Q/g, "0");
}

function findEmiratesId(line) {
  const fixed = toDigits(line);
  const m = fixed.match(/(784\d{12})/);
  if (m) return m[1];
  // fallback: any 15-digit run
  const m2 = fixed.match(/(\d{15})/);
  return m2 ? m2[1] : "";
}

// If the front of the card was in the photo too, the OCR output contains the
// person's name in mixed case (e.g. "Anvarsha Kollamparambil Navas Navas").
// MRZ truncates to 30 chars, so this is the only way to recover the full name.
function findFullNameFromFront(rawText, mrzSurname) {
  if (!mrzSurname) return "";
  // Match each surname token (may be multi-word like "KOLLAMPARAMBIL NAVAS").
  const surnameTokens = mrzSurname
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (surnameTokens.length === 0) return "";

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidates = lines.filter((l) => {
    const lc = l.toLowerCase();
    // Must contain at least one surname token
    if (!surnameTokens.some((t) => lc.includes(t))) return false;
    // Only letters / spaces / dots / hyphens / apostrophes
    if (!/^[A-Za-z][A-Za-z .'\-]+$/.test(l)) return false;
    // Multiple words
    if (l.split(/\s+/).length < 2) return false;
    // Must contain at least one proper title-case word (Cap + ≥2 lowercase).
    // This rules out OCR junk like a stray "a" next to ALL-CAPS MRZ-style text.
    if (!/\b[A-Z][a-z]{2,}\b/.test(l)) return false;
    return true;
  });
  // Prefer the longest candidate (most complete)
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || "";
}

export function parseEmiratesIdMrz(rawText, fullNameSourceText) {
  const result = {
    idNumber: "",
    fullName: "",
    firstName: "",
    surname: "",       // family / house name (MRZ "surname" slot)
    lastName: "",      // remaining given tokens after first name
    givenNames: "",    // full MRZ given names (first + last together)
    nationality: "",
    sex: "",
    dateOfBirth: "",
    dateOfExpiry: "",
    rawMrz: "",
  };

  const mrz = extractMrzLines(rawText);
  if (mrz.length === 0) return result;
  // MRZ must contain the '<<' separator. This token does not appear in any
  // normal printed text on the front of the card, so it's a reliable signal.
  const hasMrzMarker = mrz.some((l) => l.includes("<<"));
  if (!hasMrzMarker) return result;
  result.rawMrz = mrz.join("\n");

  // Identify which physical line is which by exclusion.
  // Line 2: starts with 6 digits (birth date).
  // Line 1: contains the 15-digit Emirates ID (784...) or starts with I<ARE-ish prefix.
  // Line 3: whatever remains — names line.
  let line1 = "", line2 = "", line3 = "";
  const pool = [...mrz];

  const idx2 = pool.findIndex((l) => /^[0-9OILSBZQ]{6}/.test(l));
  if (idx2 >= 0) { line2 = pool[idx2]; pool.splice(idx2, 1); }

  const idx1 = pool.findIndex(
    (l) => /784\d{6,}/.test(toDigits(l)) || /^I[<LKC1]/.test(l),
  );
  if (idx1 >= 0) { line1 = pool[idx1]; pool.splice(idx1, 1); }

  line3 = pool[0] || "";

  // Fallback positional fill if heuristics missed.
  if (!line1) line1 = mrz[0] || "";
  if (!line2) line2 = mrz[1] || "";
  if (!line3) line3 = mrz[2] || "";

  // Safety: a names line must NOT start with digits.
  if (/^\d/.test(line3)) line3 = "";

  // --- Line 1: Emirates ID ---
  const id = findEmiratesId(line1);
  if (id) {
    result.idNumber = `${id.slice(0, 3)}-${id.slice(3, 7)}-${id.slice(7, 14)}-${id.slice(14)}`;
  }

  // --- Line 2: dates / sex / nationality ---
  if (line2.length >= 18) {
    const dobRaw = toDigits(line2.slice(0, 6));
    const sex = line2.slice(7, 8);
    const expRaw = toDigits(line2.slice(8, 14));
    const nat = line2.slice(15, 18).replace(/</g, "");

    result.dateOfBirth = pickBirthYear(parseDate(dobRaw));
    result.dateOfExpiry = pickExpiryYear(parseDate(expRaw));
    if (sex === "M" || sex === "F") result.sex = sex;
    if (/^[A-Z]{3}$/.test(nat)) result.nationality = nat;
  }

  // --- Line 3: SURNAME<<GIVEN<NAMES ---
  if (line3) {
    const sep = line3.indexOf("<<");
    if (sep > 0) {
      const surnameRaw = line3.slice(0, sep);
      let givenRaw = line3.slice(sep + 2);
      // A second '<<' inside the names section never occurs in a valid MRZ;
      // it marks the start of trailing filler that OCR may have garbled.
      const filler = givenRaw.indexOf("<<");
      if (filler >= 0) givenRaw = givenRaw.slice(0, filler);
      result.surname = surnameRaw.replace(/</g, " ").trim();
      result.givenNames = givenRaw.replace(/</g, " ").replace(/\s+/g, " ").trim();
    } else {
      result.surname = line3.replace(/</g, " ").trim();
    }
  }

  // Split given names → first token is first name, remainder is last name.
  if (result.givenNames) {
    const tokens = result.givenNames.split(/\s+/).filter(Boolean);
    result.firstName = tokens[0] || "";
    result.lastName = tokens.slice(1).join(" ");
  }

  const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  // Build full name in First + Family + Last order (the user's preferred form).
  // Uses front-side text for spelling/spacing when available.
  const front = findFullNameFromFront(fullNameSourceText || rawText, result.surname);
  if (front) {
    result.fullName = front;
  } else if (result.firstName || result.surname || result.lastName) {
    result.fullName = [
      titleCase(result.firstName),
      titleCase(result.surname),
      titleCase(result.lastName),
    ]
      .filter(Boolean)
      .join(" ");
  }

  result.docType = "EMIRATES_ID";
  return result;
}

// --- Passport (TD3) MRZ parser: 2 lines x 44 chars ---
// Line 1: P<ISO_COUNTRY<SURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<<<<<<<<<
// Line 2: PASSPORT_NUMBER<C<NAT<YYMMDD<C<SEX<YYMMDD<C<PERSONAL_NO<C<C
export function parsePassportMrz(rawText, fullNameSourceText) {
  const result = {
    docType: "PASSPORT",
    passportNumber: "",
    issuingCountry: "",
    nationality: "",
    surname: "",
    givenNames: "",
    firstName: "",
    lastName: "",
    fullName: "",
    sex: "",
    dateOfBirth: "",
    dateOfExpiry: "",
    rawMrz: "",
  };

  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length >= 40);

  let line1 = "", line2 = "";
  // Look for consecutive pair where line1 starts with 'P' (passport doc code).
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^P[A-Z<]/.test(lines[i])) {
      line1 = lines[i];
      line2 = lines[i + 1];
      break;
    }
  }
  // Fallback: just take the last 2 long lines if nothing matched
  if (!line1 && lines.length >= 2) {
    line1 = lines[lines.length - 2];
    line2 = lines[lines.length - 1];
  }
  if (!line1 || !line2) return result;

  const hasMrzMarker = line1.includes("<<") || line2.includes("<<");
  if (!hasMrzMarker) return result;

  result.rawMrz = `${line1}\n${line2}`;

  // Line 1: issuing country + names
  result.issuingCountry = line1.slice(2, 5).replace(/</g, "");
  const namePart = line1.slice(5);
  const sep = namePart.indexOf("<<");
  if (sep > 0) {
    let givenRaw = namePart.slice(sep + 2);
    // Truncate at any '<<' inside given names — it's always trailing filler.
    const filler = givenRaw.indexOf("<<");
    if (filler >= 0) givenRaw = givenRaw.slice(0, filler);
    result.surname = namePart.slice(0, sep).replace(/</g, " ").trim();
    result.givenNames = givenRaw
      .replace(/</g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Line 2: passport number, nationality, dates, sex
  if (line2.length >= 28) {
    result.passportNumber = line2.slice(0, 9).replace(/</g, "");
    result.nationality = line2.slice(10, 13).replace(/</g, "");
    result.dateOfBirth = pickBirthYear(parseDate(toDigits(line2.slice(13, 19))));
    const sex = line2.slice(20, 21);
    if (sex === "M" || sex === "F") result.sex = sex;
    result.dateOfExpiry = pickExpiryYear(parseDate(toDigits(line2.slice(21, 27))));
  }

  // Split given names
  if (result.givenNames) {
    const tokens = result.givenNames.split(/\s+/).filter(Boolean);
    result.firstName = tokens[0] || "";
    result.lastName = tokens.slice(1).join(" ");
  }

  const titleCase = (s) =>
    s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  // Passport convention: "GivenNames Surname"
  const front = findFullNameFromFront(fullNameSourceText || rawText, result.surname);
  if (front) {
    result.fullName = front;
  } else if (result.givenNames || result.surname) {
    result.fullName = [titleCase(result.givenNames), titleCase(result.surname)]
      .filter(Boolean)
      .join(" ");
  }

  return result;
}

// Auto-detect document type from OCR text and parse with the right parser.
export function parseIdDocument(rawText, fullNameSourceText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length >= 24);
  // Passport: a long (>=40 char) line starting with 'P'
  const isPassport = lines.some((l) => l.length >= 40 && /^P[A-Z<]/.test(l));
  if (isPassport) {
    return parsePassportMrz(rawText, fullNameSourceText);
  }
  return parseEmiratesIdMrz(rawText, fullNameSourceText);
}
