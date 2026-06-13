const { parseMRZ } = require('./src/lib/mrz-parser.ts'); // Wait, node can't run TS directly easily without ts-node.

// Let's just write the exact parseMRZ logic in JS to test it.
const rawText = `ILARE1476139708784200031415944
0002015M2707277IND<<<<<<<<<<<2
MUHAMMED<<ANVARSHA<KOLLAMPARAM`;

const allLines = rawText
  .toUpperCase()
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const cleanedLines = allLines.map((line) => line.replace(/[^A-Z0-9<]/g, ""));
const candidateLines = cleanedLines.filter((l) => l.length >= 27 && l.length <= 47);

console.log("Candidate Lines:");
candidateLines.forEach(l => console.log(l, l.length));

const td1Candidates = candidateLines.filter((l) => l.length >= 27 && l.length <= 33);
console.log("TD1 Candidates length:", td1Candidates.length);

if (td1Candidates.length >= 3) {
  if (td1Candidates.some((l) => l.includes("<"))) {
    console.log("SUCCESS TD1", td1Candidates.slice(-3));
  } else {
    console.log("FAILED TD1: No < found in any line");
  }
} else {
  console.log("FAILED TD1: Not enough lines", td1Candidates.length);
}
