const COLORS = ["#3787f5", "#28b8ad", "#71839b", "#596fea", "#50a3d8"];
const DAY_PATTERNS = [
  ["Monday", /\bmon(?:day)?\b/i],
  ["Tuesday", /\btue(?:s(?:day)?)?\b/i],
  ["Wednesday", /\bwed(?:nesday)?\b/i],
  ["Thursday", /\bthu(?:r(?:s(?:day)?)?)?\b/i],
  ["Friday", /\bfri(?:day)?\b/i],
  ["Saturday", /\bsat(?:urday)?\b/i],
  ["Sunday", /\bsun(?:day)?\b/i],
];
const CLOCK_SOURCE = String.raw`\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?\b`;
const TIME_RANGE_PATTERN = new RegExp(`(${CLOCK_SOURCE})\\s*(?:-|–|—|to)\\s*(${CLOCK_SOURCE})`, "gi");
const CLOCK_TOKEN_PATTERN = new RegExp(CLOCK_SOURCE, "gi");
const CLOCK_CLEANUP_PATTERN = /\b(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:[ap]\.?\s*m\.?)?|\b(?:0?[1-9]|1[0-2])\s*[ap]\.?\s*m\.?\b/gi;

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeOcrText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([0-9]):[oO]{2}\b/g, "$1:00")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function recognizedDays(value) {
  const text = normalizeOcrText(value);
  const found = DAY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([day]) => day);
  if (/\bMWF\b|\bM\s*\/\s*W\s*\/\s*F\b/i.test(text)) found.push("Monday", "Wednesday", "Friday");
  if (/\bTTh\b|\bTR\b|\bT\s*\/\s*(?:Th|R)\b/i.test(text)) found.push("Tuesday", "Thursday");
  return [...new Set(found)];
}

function parseClock(value, inheritedPeriod = "") {
  const normalized = normalizeOcrText(value).replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = (match[3] || inheritedPeriod).replace(/[\s.]/g, "").toLowerCase();
  if (hour > 23 || minute > 59 || (period && (hour < 1 || hour > 12))) return null;
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  const explicit24Hour = !match[3] && !inheritedPeriod && /^0\d(?::|$)/.test(normalized);
  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    uncertain: !period && hour <= 12 && !explicit24Hour,
    period: match[3] ? period : inheritedPeriod,
  };
}

function timeRanges(value) {
  const ranges = [...value.matchAll(TIME_RANGE_PATTERN)].flatMap((match) => {
    const rawStart = match[1].trim();
    const rawEnd = match[2].trim();
    const endHasPeriod = /\b(?:a\.?\s*m\.?|p\.?\s*m\.?)$/i.test(rawEnd);
    const start = parseClock(rawStart, endHasPeriod ? rawEnd.match(/([ap])\.?\s*m\.?$/i)?.[0] || "" : "");
    const end = parseClock(rawEnd);
    if (!start || !end || start.value >= end.value) return [];
    return [{
      start,
      end,
      raw: match[0],
      index: match.index,
    }];
  });
  if (ranges.length) return ranges;
  const times = [...value.matchAll(CLOCK_TOKEN_PATTERN)];
  if (times.length < 2) return [];
  const rawStart = times[0][0].trim();
  const rawEnd = times[1][0].trim();
  const endHasPeriod = /\b(?:a\.?\s*m\.?|p\.?\s*m\.?)$/i.test(rawEnd);
  const start = parseClock(rawStart, endHasPeriod ? rawEnd.match(/([ap])\.?\s*m\.?$/i)?.[0] || "" : "");
  const end = parseClock(rawEnd);
  if (!start || !end || start.value >= end.value) return [];
  return [{ start, end, raw: `${rawStart} ${rawEnd}`, index: times[0].index }];
}

function dayHeaders(words) {
  const found = [];
  words.forEach((word) => {
    const days = recognizedDays(word.text);
    if (days.length && word.bbox) {
      found.push({ day: days[0], days, x: (word.bbox.x0 + word.bbox.x1) / 2 });
    }
  });
  return found
    .filter((header, index) => found.findIndex((item) => (
      item.day === header.day && Math.abs(item.x - header.x) < 3
    )) === index)
    .sort((a, b) => a.x - b.x);
}

function columnForX(x, headers) {
  if (!headers.length) return "";
  if (headers.length === 1) return headers[0];
  const boundaries = headers.map((header, index) => {
    if (index === 0) return header.x - (headers[1].x - header.x) / 2;
    if (index === headers.length - 1) return header.x + (header.x - headers[index - 1].x) / 2;
    return (headers[index - 1].x + headers[index + 1].x) / 2;
  });
  if (x < boundaries[0] || x > boundaries[boundaries.length - 1]) return "";
  let closest = headers[0];
  headers.slice(1).forEach((header) => {
    if (Math.abs(header.x - x) < Math.abs(closest.x - x)) closest = header;
  });
  return closest;
}

function wordsAsLines(words) {
  const usable = words.filter((word) => (
    typeof word.text === "string"
    && word.text.trim()
    && word.bbox
    && Number.isFinite(word.bbox.x0)
    && Number.isFinite(word.bbox.y0)
    && Number.isFinite(word.bbox.x1)
    && Number.isFinite(word.bbox.y1)
  ));
  if (!usable.length) return { lines: [], headers: [], medianHeight: 16 };

  const headers = dayHeaders(usable);
  const ordered = usable
    .filter((word) => !recognizedDays(word.text).length)
    .map((word) => {
      const x = (word.bbox.x0 + word.bbox.x1) / 2;
      const height = Math.max(1, word.bbox.y1 - word.bbox.y0);
      return {
        word,
        x,
        y: (word.bbox.y0 + word.bbox.y1) / 2,
        height,
        column: columnForX(x, headers),
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];

  ordered.forEach((item) => {
    let row = rows.find((candidate) => (
      candidate.day === (item.column?.day || "")
      && Math.abs(candidate.centerY - item.y) <= Math.max(8, (candidate.height + item.height) * 0.42)
    ));
    if (!row) {
      row = { day: item.column?.day || "", days: item.column?.days || [], centerY: item.y, height: item.height, words: [] };
      rows.push(row);
    }
    row.words.push(item);
    row.centerY = row.words.reduce((sum, entry) => sum + entry.y, 0) / row.words.length;
    row.height = row.words.reduce((sum, entry) => sum + entry.height, 0) / row.words.length;
  });

  const heights = ordered.map(({ height }) => height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 16;
  return {
    headers,
    medianHeight,
    lines: rows.map((row) => ({
      text: row.words.sort((a, b) => a.x - b.x).map(({ word }) => word.text).join(" "),
      day: row.day,
      days: row.days,
      centerX: row.words.reduce((sum, word) => sum + word.x, 0) / row.words.length,
      centerY: row.centerY,
      confidence: Math.round(row.words.reduce((sum, { word }) => sum + (word.confidence || 0), 0) / row.words.length),
      positioned: true,
    })).sort((a, b) => a.centerY - b.centerY),
  };
}

function removeDays(value) {
  return value
    .replace(/\b(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi, " ")
    .replace(/\bMWF\b|\bM\s*\/\s*W\s*\/\s*F\b|\bTTh\b|\bTR\b|\bT\s*\/\s*(?:Th|R)\b/gi, " ");
}

function removeClockValues(value) {
  return value
    .replace(TIME_RANGE_PATTERN, " ")
    .replace(CLOCK_CLEANUP_PATTERN, " ")
    .replace(/\b[ap]\.?\s*m\.?\b/gi, " ");
}

function extractRoom(value) {
  const match = value.match(/\b(?:room|rm\.?|classroom|lab(?:oratory)?|hall|bldg\.?|building|location)\s*(?:no\.?\s*)?#?\s*[a-z0-9][a-z0-9-]*\b/i);
  return match?.[0]?.trim() || "";
}

export function extractScannedClasses(rawText, words = []) {
  const text = normalizeOcrText(rawText);
  const wordData = wordsAsLines(words);
  const textLines = text.split(/\r?\n/).filter(Boolean).map((line, index) => ({
    text: line,
    day: "",
    days: [],
    centerX: null,
    centerY: index * 24,
    confidence: 0,
    positioned: false,
  }));
  const sourceLines = wordData.lines.length ? wordData.lines : textLines;
  const candidates = [];
  const nearbyLineDistance = Math.max(24, wordData.medianHeight * 3.2);

  sourceLines.forEach((line) => {
    const ranges = timeRanges(line.text);
    if (!ranges.length) return;
    const explicitDays = recognizedDays(line.text);
    if (line.positioned && !line.day && !explicitDays.length) return;

    const contextLines = sourceLines.filter((candidate) => (
      candidate !== line
      && candidate.day === line.day
      && !timeRanges(candidate.text).length
      && Math.abs(candidate.centerY - line.centerY) <= nearbyLineDistance
    ));
    const combinedText = [line.text, ...contextLines.map((candidate) => candidate.text)].join(" ");

    ranges.forEach(({ start, end, raw }) => {
      let details = combinedText.replace(raw, " ");
      details = removeClockValues(details);
      details = removeDays(details);
      const room = extractRoom(details);
      const subject = details
        .replace(room, " ")
        .replace(/[|,;:()[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const days = explicitDays.length ? explicitDays : line.day ? [line.day] : [];
      const targetDays = explicitDays.length ? explicitDays : line.days?.length ? line.days : days;
      const uncertain = [];
      if (!subject) uncertain.push("subject");
      if (!targetDays.length) uncertain.push("day");
      if (start.uncertain) uncertain.push("start time");
      if (end.uncertain) uncertain.push("end time");
      if (!room) uncertain.push("location");
      const contextConfidence = contextLines.length
        ? Math.round((line.confidence + contextLines.reduce((sum, candidate) => sum + candidate.confidence, 0)) / (contextLines.length + 1))
        : line.confidence;
      if (line.positioned && contextConfidence < 65) uncertain.push("OCR confidence");

      (targetDays.length ? targetDays : [""]).forEach((day) => candidates.push({
        id: createId(),
        subject,
        instructor: "",
        room,
        day,
        start: start.value,
        end: end.value,
        color: COLORS[candidates.length % COLORS.length],
        uncertain: [...uncertain],
      }));
    });
  });
  if (!candidates.length && wordData.lines.length && textLines.length) {
    return extractScannedClasses(text, []);
  }
  return candidates;
}

export function wordsFromOcrResult(data) {
  if (Array.isArray(data?.words)) return data.words;
  return (data?.blocks || [])
    .flatMap((block) => block.paragraphs || [])
    .flatMap((paragraph) => paragraph.lines || [])
    .flatMap((line) => line.words || []);
}

export async function preprocessScheduleImage(file) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.2)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const output = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return output || file;
  } catch (error) {
    console.warn("Could not preprocess the schedule image; trying the original image.", error);
    return file;
  } finally {
    bitmap?.close();
  }
}
