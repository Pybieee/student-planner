import test from "node:test";
import assert from "node:assert/strict";
import { extractScannedClasses, wordsFromOcrResult } from "./scheduleScanner.js";

test("parses a text timetable with day names, AM/PM times, and rooms", () => {
  const [item] = extractScannedClasses("Monday: BIO 101 | 9:00 AM - 10:15 AM | Room 204");

  assert.equal(item.subject, "BIO 101");
  assert.equal(item.day, "Monday");
  assert.equal(item.start, "09:00");
  assert.equal(item.end, "10:15");
  assert.equal(item.room, "Room 204");
  assert.deepEqual(item.uncertain, []);
});

test("parses 24-hour times without stripping digits from subject or location", () => {
  const [item] = extractScannedClasses("Tuesday MAT 202 13:15-14:45 Rm. A12");

  assert.equal(item.subject, "MAT 202");
  assert.equal(item.day, "Tuesday");
  assert.equal(item.start, "13:15");
  assert.equal(item.end, "14:45");
  assert.equal(item.room, "Rm. A12");
});

test("parses consecutive time tokens in a simple text schedule", () => {
  const [item] = extractScannedClasses("Wednesday ENG 210 9:00 AM 10:15 AM Room 12");

  assert.equal(item.subject, "ENG 210");
  assert.equal(item.day, "Wednesday");
  assert.equal(item.start, "09:00");
  assert.equal(item.end, "10:15");
  assert.equal(item.room, "Room 12");
});

test("recognizes Saturday and Sunday schedule entries", () => {
  const classes = extractScannedClasses([
    "Saturday PHY 115 10:00 AM - 11:00 AM Lab 2",
    "Sunday ART 210 13:00-14:00 Studio 4",
  ].join("\n"));

  assert.deepEqual(classes.map(({ day }) => day), ["Saturday", "Sunday"]);
});

test("uses OCR column positions and nearby lines to associate a grid class with its weekday", () => {
  const word = (text, x, y, confidence = 92) => ({
    text,
    confidence,
    bbox: { x0: x, x1: x + Math.max(12, text.length * 7), y0: y, y1: y + 12 },
  });
  const words = [
    word("Mon", 85, 10),
    word("Tue", 485, 10),
    word("BIO", 85, 100),
    word("101", 110, 100),
    word("9:00", 85, 122),
    word("AM", 120, 122),
    word("-", 142, 122),
    word("10:15", 155, 122),
    word("AM", 195, 122),
    word("Room", 218, 122),
    word("204", 255, 122),
    word("ART", 485, 100),
    word("9:00", 485, 122),
    word("AM", 520, 122),
    word("-", 542, 122),
    word("10:00", 555, 122),
    word("AM", 595, 122),
  ];
  const result = extractScannedClasses("", words);
  const monday = result.find((item) => item.subject === "BIO 101");
  const tuesday = result.find((item) => item.subject === "ART");

  assert.equal(monday?.day, "Monday");
  assert.equal(monday?.start, "09:00");
  assert.equal(monday?.end, "10:15");
  assert.equal(monday?.room, "Room 204");
  assert.equal(tuesday?.day, "Tuesday");
  assert.equal(tuesday?.start, "09:00");
  assert.equal(tuesday?.end, "10:00");
  assert(tuesday?.uncertain.includes("location"));
});

test("reads coordinate words from Tesseract.js block, paragraph, and line output", () => {
  const word = (text, x, y) => ({
    text,
    confidence: 90,
    bbox: { x0: x, x1: x + 24, y0: y, y1: y + 12 },
  });
  const data = {
    blocks: [{
      paragraphs: [{
        lines: [
          { words: [word("Monday", 80, 10), word("Tuesday", 280, 10)] },
          { words: [word("BIO", 80, 100), word("9:00", 80, 122), word("AM", 115, 122), word("-", 140, 122), word("10:00", 155, 122), word("AM", 195, 122)] },
          { words: [word("ART", 280, 100), word("13:00", 280, 122), word("-", 320, 122), word("14:00", 335, 122)] },
        ],
      }],
    }],
  };
  const classes = extractScannedClasses("ignored flat text", wordsFromOcrResult(data));

  assert.deepEqual(classes.map(({ subject, day, start, end }) => ({ subject, day, start, end })), [
    { subject: "BIO", day: "Monday", start: "09:00", end: "10:00" },
    { subject: "ART", day: "Tuesday", start: "13:00", end: "14:00" },
  ]);
});

test("expands a combined weekday column without guessing other fields", () => {
  const word = (text, x, y) => ({
    text,
    confidence: 90,
    bbox: { x0: x, x1: x + Math.max(12, text.length * 7), y0: y, y1: y + 12 },
  });
  const classes = extractScannedClasses("", [
    word("MWF", 95, 10),
    word("BIO", 95, 100),
    word("09:00", 95, 122),
    word("-", 135, 122),
    word("10:00", 150, 122),
  ]);

  assert.deepEqual(classes.map(({ day }) => day), ["Monday", "Wednesday", "Friday"]);
  assert(classes.every((item) => item.uncertain.includes("location")));
});

test("leaves missing days and locations for manual correction instead of guessing", () => {
  const [item] = extractScannedClasses("CHEM 115 09:00-10:00");

  assert.equal(item.day, "");
  assert.equal(item.room, "");
  assert(item.uncertain.includes("day"));
  assert(item.uncertain.includes("location"));
});

test("falls back to recognized text when OCR word positions omit the weekday header", () => {
  const words = [{
    text: "BIO",
    confidence: 90,
    bbox: { x0: 80, x1: 105, y0: 100, y1: 112 },
  }, {
    text: "9:00",
    confidence: 90,
    bbox: { x0: 80, x1: 110, y0: 122, y1: 134 },
  }, {
    text: "-",
    confidence: 90,
    bbox: { x0: 115, x1: 120, y0: 122, y1: 134 },
  }, {
    text: "10:00",
    confidence: 90,
    bbox: { x0: 125, x1: 155, y0: 122, y1: 134 },
  }];
  const [item] = extractScannedClasses("Friday BIO 9:00 AM - 10:00 AM Room 12", words);

  assert.equal(item.subject, "BIO");
  assert.equal(item.day, "Friday");
  assert.equal(item.room, "Room 12");
});
