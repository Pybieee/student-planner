import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ImagePlus,
  Minus, Pencil, Plus, Settings2, Trash2, X,
} from "lucide-react";
import "./styles.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CLASS_COLORS = ["#3b82f6", "#22d3ee", "#a78bfa", "#34d399", "#f59e0b", "#f472b6"];
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const BASE_SLOT_MINUTES = 30;

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function scheduleRange(classes) {
  const starts = classes.map((item) => timeToMinutes(item.start)).filter(Number.isFinite);
  const ends = classes.map((item) => timeToMinutes(item.end)).filter(Number.isFinite);
  if (!starts.length || !ends.length) return { start: 7 * 60, end: 22 * 60 };
  const start = Math.max(0, Math.floor(Math.min(...starts) / BASE_SLOT_MINUTES) * BASE_SLOT_MINUTES);
  const end = Math.min(24 * 60, Math.ceil(Math.max(...ends) / BASE_SLOT_MINUTES) * BASE_SLOT_MINUTES);
  return { start, end: Math.max(start + BASE_SLOT_MINUTES, end) };
}

function scheduleSlots(classes) {
  const { start, end } = scheduleRange(classes);
  return Array.from({ length: Math.ceil((end - start) / BASE_SLOT_MINUTES) }, (_, index) => formatTime(start + index * BASE_SLOT_MINUTES));
}

function readStored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn(`Could not read ${key} from local storage.`, error);
    return [];
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dateLabel(value, options = { month: "long", day: "numeric", year: "numeric" }) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
}

function canonicalDay(value) {
  const day = DAYS.find((name) => name.toLowerCase() === String(value || "").trim().toLowerCase());
  if (day) return day;
  const shortDay = SHORT_DAYS.find((name) => name.toLowerCase() === String(value || "").trim().toLowerCase());
  return shortDay ? DAYS[SHORT_DAYS.indexOf(shortDay)] : "";
}

function normalizeScannedClasses(value) {
  if (!Array.isArray(value)) throw new Error("The scan response wasn't a list. Try a clearer schedule photo.");
  const classes = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const rawDays = Array.isArray(entry.days) ? entry.days : [entry.day || ""];
    const days = [...new Set(rawDays.map(canonicalDay).filter(Boolean))];
    const shared = {
      subject: typeof entry.subject === "string" ? entry.subject.trim() : "",
      instructor: typeof entry.professor === "string" ? entry.professor.trim() : "",
      room: typeof entry.room === "string" ? entry.room.trim() : "",
      start: typeof entry.startTime === "string" ? entry.startTime.trim() : "",
      end: typeof entry.endTime === "string" ? entry.endTime.trim() : "",
      color: CLASS_COLORS[index % CLASS_COLORS.length],
    };
    (days.length ? days : [""]).forEach((day) => classes.push({ ...shared, day, id: newId() }));
  });
  if (!classes.length) throw new Error("No classes were found. Try a clearer photo, or add classes manually.");
  return classes;
}

function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error("This image couldn't be read. Try another image."));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.onerror = () => reject(new Error("This image couldn't be read. Try another image."));
    reader.readAsDataURL(file);
  });
}

async function callGeminiForSchedule(file, apiKey) {
  const image = await readImageAsBase64(file);
  const prompt = [
    "Read the class schedule in this image and return only valid JSON.",
    "Return a JSON array of objects with exactly these string fields: subject, professor, room, days, startTime, endTime.",
    "days must be an array containing one or more weekday names from Monday through Sunday.",
    "Use 24-hour HH:MM for startTime and endTime.",
    "Do not guess or infer missing or unreadable information. Use an empty string for unknown subject, professor, room, startTime, or endTime; use an empty array when no day can be read.",
    "Do not include markdown, comments, or any text outside the JSON array.",
  ].join(" ");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data: image } }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gemini took too long to respond. Please try again or add classes manually.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const errorResult = await response.json().catch(() => null);
    const apiError = String(errorResult?.error?.message || "").toLowerCase();
    if (response.status === 401 || response.status === 403 || apiError.includes("api key")) {
      throw new Error("Gemini couldn't use that API key. Check that it is valid and enabled for the Gemini API.");
    }
    if (response.status === 429) throw new Error("The Gemini free-tier limit may have been reached. Try again later, or add classes manually.");
    if (response.status === 400 && (apiError.includes("image") || apiError.includes("mime") || apiError.includes("file"))) {
      throw new Error("Gemini couldn't read this image request. Try a JPG, PNG, or WebP screenshot.");
    }
    throw new Error(`Gemini is temporarily unavailable (error ${response.status}). Please try again later or add classes manually.`);
  }
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini didn't return any schedule data. Try another image or add classes manually.");
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw new Error("Gemini returned an unreadable result. Try again with a clearer image.");
  }
  return normalizeScannedClasses(parsed);
}

function App() {
  const [tab, setTab] = useState("calendar");
  const [tasks, setTasks] = useState(() => readStored("orbit_tasks"));
  const [classes, setClasses] = useState(() => readStored("orbit_classes"));
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [editingTask, setEditingTask] = useState(null);
  const [taskComposerDate, setTaskComposerDate] = useState(null);
  const [editingClass, setEditingClass] = useState(null);
  const [classDefaults, setClassDefaults] = useState(null);
  const [notice, setNotice] = useState("");
  const [calendarHintVisible, setCalendarHintVisible] = useState(() => {
    try {
      return localStorage.getItem("orbit_calendar_hint_dismissed") !== "true"
        && readStored("orbit_tasks").length === 0;
    } catch {
      return true;
    }
  });
  const [scheduleZoom, setScheduleZoom] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("orbit_schedule_zoom"));
      return Number.isFinite(saved) && saved > 0 ? Math.min(3, Math.max(0.5, saved)) : 0;
    } catch {
      return 1;
    }
  });
  const [geminiKey, setGeminiKey] = useState(() => {
    try {
      return localStorage.getItem("orbit_gemini_api_key") || "";
    } catch (error) {
      console.warn("Could not read the Gemini API key from local storage.", error);
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("orbit_tasks", JSON.stringify(tasks));
    } catch (error) {
      console.error("Could not save tasks to local storage.", error);
      setNotice("Tasks could not be saved on this device. Check your browser storage settings.");
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem("orbit_classes", JSON.stringify(classes));
    } catch (error) {
      console.error("Could not save classes to local storage.", error);
      setNotice("Classes could not be saved on this device. Check your browser storage settings.");
    }
  }, [classes]);

  useEffect(() => {
    try {
      localStorage.setItem("orbit_schedule_zoom", String(scheduleZoom));
    } catch (error) {
      console.warn("Could not save schedule zoom.", error);
    }
  }, [scheduleZoom]);

  const today = localDate();
  function dismissCalendarHint() {
    setCalendarHintVisible(false);
    try {
      localStorage.setItem("orbit_calendar_hint_dismissed", "true");
    } catch (error) {
      console.warn("Could not save calendar hint preference.", error);
    }
  }

  function saveTask(task) {
    setTasks((current) => editingTask
      ? current.map((item) => item.id === editingTask.id ? { ...task, id: editingTask.id } : item)
      : [...current, { ...task, id: newId(), done: false }]);
    if (!editingTask) dismissCalendarHint();
    setEditingTask(null);
    setTaskComposerDate(null);
  }

  function saveClass(item) {
    setClasses((current) => editingClass
      ? current.map((entry) => entry.id === editingClass.id ? { ...item, id: editingClass.id } : entry)
      : [...current, { ...item, id: newId() }]);
    setEditingClass(null);
    setClassDefaults(null);
  }

  function openClass(day, start) {
    setEditingClass(null);
    setClassDefaults({ day, start });
  }

  function saveGeminiKey(value) {
    const key = value.trim();
    try {
      if (key) localStorage.setItem("orbit_gemini_api_key", key);
      else localStorage.removeItem("orbit_gemini_api_key");
      setGeminiKey(key);
      setNotice(key ? "Gemini API key saved on this device." : "Saved Gemini API key removed.");
    } catch (error) {
      console.error("Could not save the Gemini API key.", error);
      setNotice("The key couldn't be saved in this browser. Check local storage settings.");
    }
  }

  function importClasses(imported) {
    const conflicts = findOverlaps(imported, classes).length;
    setClasses((current) => [...current, ...imported.map((item) => ({ ...item, id: newId() }))]);
    const conflictMessage = conflicts
      ? ` ${conflicts} potential overlap${conflicts === 1 ? "" : "s"} ${conflicts === 1 ? "was" : "were"} kept without replacing existing classes.`
      : "";
    setNotice(`Added ${imported.length} ${imported.length === 1 ? "class" : "classes"}.${conflictMessage}`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Orbit planner home">
          <span className="brand-mark"><CalendarDays size={20} /></span>
          <span>orbit<span className="brand-period">.</span></span>
        </a>
        <nav className="top-tabs" aria-label="Planner pages">
          <button className={tab === "calendar" ? "tab active" : "tab"} onClick={() => setTab("calendar")}>Calendar</button>
          <button className={tab === "schedule" ? "tab active" : "tab"} onClick={() => setTab("schedule")}>Schedule</button>
        </nav>
        <div className="today-label"><span className="today-indicator" />{dateLabel(today, { weekday: "short", month: "short", day: "numeric" })}</div>
      </header>

      <main className="main-content">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>}
        {tab === "calendar" ? (
          <CalendarPage
            month={month}
            setMonth={setMonth}
            today={today}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            tasks={tasks}
            onToggleTask={(id) => setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task))}
            onEditTask={setEditingTask}
            onDeleteTask={(id) => setTasks((current) => current.filter((task) => task.id !== id))}
            onAddForDate={(date) => setTaskComposerDate(date)}
            hintVisible={calendarHintVisible}
            onDismissHint={dismissCalendarHint}
          />
        ) : (
          <SchedulePage
            classes={classes}
            today={today}
            onAdd={openClass}
            onEdit={setEditingClass}
            geminiKey={geminiKey}
            onSaveGeminiKey={saveGeminiKey}
            onImport={importClasses}
            zoom={scheduleZoom}
            setZoom={setScheduleZoom}
          />
        )}
      </main>

      <nav className="bottom-tabs" aria-label="Planner pages">
        <button className={tab === "calendar" ? "bottom-tab active" : "bottom-tab"} onClick={() => setTab("calendar")}><CalendarDays size={19} /><span>Calendar</span></button>
        <button className={tab === "schedule" ? "bottom-tab active" : "bottom-tab"} onClick={() => setTab("schedule")}><Clock3 size={19} /><span>Schedule</span></button>
      </nav>

      {(editingTask || taskComposerDate) && (
        <TaskModal
          task={editingTask}
          due={taskComposerDate}
          onClose={() => { setEditingTask(null); setTaskComposerDate(null); }}
          onSave={saveTask}
          onDelete={editingTask ? () => {
            setTasks((current) => current.filter((task) => task.id !== editingTask.id));
            setEditingTask(null);
          } : null}
        />
      )}
      {(editingClass || classDefaults) && (
        <ClassModal
          item={editingClass}
          defaults={classDefaults}
          onClose={() => { setEditingClass(null); setClassDefaults(null); }}
          onSave={saveClass}
          onDelete={editingClass ? () => {
            setClasses((current) => current.filter((item) => item.id !== editingClass.id));
            setEditingClass(null);
          } : null}
        />
      )}
    </div>
  );
}

function CalendarPage({
  month, setMonth, today, selectedDate, setSelectedDate, tasks,
  onToggleTask, onEditTask, onDeleteTask, onAddForDate, hintVisible, onDismissHint,
}) {
  const dayRefs = useRef(new Map());
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const ignoreClick = useRef(false);
  const suppressCalendarTap = useRef(false);
  const touchStart = useRef(null);
  const [preview, setPreview] = useState(null);
  const [pulseDate, setPulseDate] = useState("");

  useEffect(() => {
    if (!preview) return undefined;
    function closePreview(event) {
      if (event.target.closest?.(".task-preview") || event.target.closest?.(".calendar-day")) return;
      setPreview(null);
    }
    document.addEventListener("pointerdown", closePreview);
    return () => document.removeEventListener("pointerdown", closePreview);
  }, [preview]);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? day : null;
  });

  function showTaskPreview(value) {
    setSelectedDate(value);
    const dayTasks = tasks.filter((task) => task.due === value);
    if (!dayTasks.length) {
      setPreview(null);
      return;
    }
    const rect = dayRefs.current.get(value)?.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const height = Math.min(300, 90 + dayTasks.length * 58);
    if (!rect) {
      setPreview(null);
      return;
    }
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
    const bottomInset = window.matchMedia("(max-width: 700px)").matches ? 78 : 12;
    const top = rect.bottom + height + 12 < window.innerHeight - bottomInset
      ? rect.bottom + 8
      : Math.max(12, Math.min(rect.top - height - 8, window.innerHeight - bottomInset - height - 8));
    setPreview({ date: value, left, top, width });
  }

  function beginLongPress(event, value) {
    if (event.button !== undefined && event.button !== 0) return;
    clearTimeout(pressTimer.current);
    ignoreClick.current = false;
    pressStart.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = setTimeout(() => {
      ignoreClick.current = true;
      setSelectedDate(value);
      setPreview(null);
      setPulseDate(value);
      setTimeout(() => setPulseDate(""), 380);
      if (navigator.vibrate) navigator.vibrate(12);
      onAddForDate(value);
    }, 500);
  }

  function moveLongPress(event) {
    if (!pressStart.current) return;
    const distance = Math.hypot(event.clientX - pressStart.current.x, event.clientY - pressStart.current.y);
    if (distance > 12) {
      clearTimeout(pressTimer.current);
      pressStart.current = null;
    }
  }

  function finishLongPress() {
    clearTimeout(pressTimer.current);
    pressStart.current = null;
  }

  function onCalendarTouchStart(event) {
    if (event.touches.length === 1) touchStart.current = event.touches[0].clientX;
  }

  function onCalendarTouchEnd(event) {
    if (touchStart.current === null || event.changedTouches.length !== 1) return;
    const distance = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) < 70) return;
    suppressCalendarTap.current = true;
    setPreview(null);
    setMonth(new Date(year, monthIndex + (distance < 0 ? 1 : -1), 1));
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR MONTH, AT A GLANCE</p>
          <h1>Calendar</h1>
          <p className="page-subtitle">Choose a day, add a task, and keep your week moving.</p>
        </div>
      </div>
      <div className="calendar-layout">
        <section className="panel calendar-panel" aria-label="Monthly calendar" onTouchStart={onCalendarTouchStart} onTouchEnd={onCalendarTouchEnd}>
          <div className="calendar-heading">
            <div>
              <h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
              <p>Select any date to see its tasks</p>
            </div>
            <div className="month-controls">
              <button className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={18} /></button>
              <button className="today-button" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelectedDate(today); }}>Today</button>
              <button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="calendar-grid weekday-row">
            {SHORT_DAYS.map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="calendar-grid date-grid">
            {cells.map((day, index) => {
              const value = day ? localDate(new Date(year, monthIndex, day)) : "";
              const dayTasks = day ? tasks.filter((task) => task.due === value) : [];
              return (
                <button
                  type="button"
                  key={`${year}-${monthIndex}-${index}`}
                  disabled={!day}
                  aria-label={day ? `${dateLabel(value)}, ${dayTasks.length} tasks` : undefined}
                  aria-pressed={value === selectedDate}
                  ref={(element) => {
                    if (day && element) dayRefs.current.set(value, element);
                    else if (day) dayRefs.current.delete(value);
                  }}
                  className={`calendar-day${!day ? " empty-day" : ""}${value === today ? " is-today" : ""}${value === selectedDate ? " is-selected" : ""}${value === pulseDate ? " long-press-pulse" : ""}`}
                  onPointerDown={(event) => day && beginLongPress(event, value)}
                  onPointerMove={moveLongPress}
                  onPointerUp={finishLongPress}
                  onPointerLeave={finishLongPress}
                  onPointerCancel={finishLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!day) return;
                    if (suppressCalendarTap.current) {
                      suppressCalendarTap.current = false;
                      return;
                    }
                    if (ignoreClick.current) {
                      ignoreClick.current = false;
                      return;
                    }
                    showTaskPreview(value);
                  }}
                >
                  {day && <>
                    <span className="date-number">{day}</span>
                    {dayTasks.length > 0 && (
                      <span className="date-task-markers" aria-hidden="true">
                        {dayTasks.slice(0, 3).map((task) => <i key={task.id} />)}
                        {dayTasks.length > 3 && <small>{dayTasks.length}</small>}
                      </span>
                    )}
                  </>}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend"><i /> Days with tasks</div>
          {hintVisible && <div className="calendar-hint"><span>Tap a day to view tasks · Long press to add a task.</span><button aria-label="Dismiss calendar hint" onClick={onDismissHint}><X size={14} /></button></div>}
        </section>

      </div>
      {preview && <div className="task-preview" style={{ left: preview.left, top: preview.top, width: preview.width }} onPointerDown={(event) => event.stopPropagation()}>
        <div className="preview-heading">
          <div><p className="eyebrow">{preview.date === today ? "TODAY" : "TASKS"}</p><strong>{dateLabel(preview.date, { weekday: "short", month: "short", day: "numeric" })}</strong></div>
          <button className="icon-button" aria-label="Close task preview" onClick={() => setPreview(null)}><X size={16} /></button>
        </div>
        <ul className="preview-list">
          {tasks.filter((task) => task.due === preview.date).sort((a, b) => (a.time || "").localeCompare(b.time || "")).map((task) => (
            <li className={`preview-task${task.done ? " is-complete" : ""}`} key={task.id}>
              <button className={`task-check${task.done ? " checked" : ""}`} aria-label={task.done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`} onClick={() => onToggleTask(task.id)}>{task.done && <Check size={14} />}</button>
              <button className="task-content" onClick={() => { setPreview(null); onEditTask(task); }}><span className="task-title">{task.title}</span><span className="task-meta">{task.time || "Any time"}{task.course ? ` · ${task.course}` : ""}</span></button>
              <button className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => { setPreview(null); onEditTask(task); }}><Pencil size={14} /></button>
              <button className="icon-button delete-button" aria-label={`Delete ${task.title}`} onClick={() => {
                onDeleteTask(task.id);
                if (tasks.filter((item) => item.due === preview.date).length === 1) setPreview(null);
              }}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      </div>}
    </section>
  );
}

function findOverlaps(imported, existing) {
  const overlaps = [];
  imported.forEach((item, index) => {
    if (!item.day || !item.start || !item.end) return;
    existing.forEach((current) => {
      if (current.day === item.day && current.start && current.end && item.start < current.end && current.start < item.end) {
        overlaps.push({ imported: item, other: current });
      }
    });
    imported.slice(index + 1).forEach((other) => {
      if (other.day === item.day && other.start && other.end && item.start < other.end && other.start < item.end) {
        overlaps.push({ imported: item, other });
      }
    });
  });
  return overlaps;
}

function SchedulePage({ classes, today, onAdd, onEdit, geminiKey, onSaveGeminiKey, onImport, zoom, setZoom }) {
  const todayName = DAYS[(new Date(`${today}T12:00:00`).getDay() + 6) % 7];
  const fileInput = useRef(null);
  const scheduleScroll = useRef(null);
  const touchState = useRef(null);
  const previousTap = useRef(null);
  const tapActionTimer = useRef(null);
  const suppressNextTap = useRef(false);
  const zoomRef = useRef(zoom);
  const [keyDraft, setKeyDraft] = useState(geminiKey);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [review, setReview] = useState(null);
  const overlaps = review ? findOverlaps(review, classes) : [];
  const invalidClasses = review?.filter((item) => (
    !item.subject.trim()
    || !DAYS.includes(item.day)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end)
    || item.start >= item.end
    || item.start < "07:00"
    || item.end > "22:00"
  )) || [];
  const slots = scheduleSlots(classes);
  const { start: rangeStart, end: rangeEnd } = scheduleRange(classes);
  zoomRef.current = zoom;

  useEffect(() => {
    if (zoom > 0) return;
    const scroll = scheduleScroll.current;
    if (!scroll) return;
    const range = scheduleRange(classes);
    const rowCount = Math.max(1, Math.ceil((range.end - range.start) / BASE_SLOT_MINUTES));
    const availableHeight = Math.max(250, window.innerHeight - scroll.getBoundingClientRect().top - 115);
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    const widthFit = (scroll.clientWidth - (mobile ? 45 : 52)) / (7 * (mobile ? 74 : 82));
    const heightFit = (availableHeight - 44) / (rowCount * 40);
    setZoom(Math.max(0.5, Math.min(3, widthFit, heightFit)));
  }, [classes, setZoom, zoom]);

  useEffect(() => setKeyDraft(geminiKey), [geminiKey]);

  useEffect(() => {
    const element = scheduleScroll.current;
    if (!element) return undefined;
    function onTouchStart(event) {
      if (event.touches.length === 2) {
        const [first, second] = event.touches;
        const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
        touchState.current = {
          distance,
          zoom: zoomRef.current,
          isPinching: true,
          centerX: (first.clientX + second.clientX) / 2,
          centerY: (first.clientY + second.clientY) / 2,
          scrollLeft: element.scrollLeft,
          scrollTop: element.scrollTop,
        };
        previousTap.current = null;
      } else if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchState.current = { x: touch.clientX, y: touch.clientY, isPinching: false };
      }
    }
    function onTouchMove(event) {
      if (event.touches.length !== 2 || !touchState.current?.isPinching) return;
      event.preventDefault();
      const [first, second] = event.touches;
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      if (touchState.current.distance > 0) {
        const factor = distance / touchState.current.distance;
        const nextZoom = Math.min(3, Math.max(0.5, touchState.current.zoom * factor));
        const rect = element.getBoundingClientRect();
        element.scrollLeft = (touchState.current.scrollLeft + touchState.current.centerX - rect.left) * factor - (touchState.current.centerX - rect.left);
        element.scrollTop = (touchState.current.scrollTop + touchState.current.centerY - rect.top) * factor - (touchState.current.centerY - rect.top);
        setZoom(nextZoom);
      }
    }
    function onTouchEnd(event) {
      if (touchState.current?.isPinching) {
        if (event.touches.length < 2) touchState.current = null;
        return;
      }
      const ended = event.changedTouches[0];
      if (ended && touchState.current) {
        const moved = Math.hypot(ended.clientX - touchState.current.x, ended.clientY - touchState.current.y);
        if (moved < 12) {
          const now = Date.now();
          const prior = previousTap.current;
          if (prior && now - prior.time < 340 && Math.hypot(ended.clientX - prior.x, ended.clientY - prior.y) < 30) {
            clearTimeout(tapActionTimer.current);
            suppressNextTap.current = true;
            setZoom((current) => current <= 1 ? 1.8 : 0.6);
            previousTap.current = null;
          } else {
            previousTap.current = { time: now, x: ended.clientX, y: ended.clientY };
          }
        } else {
          previousTap.current = null;
        }
      }
      touchState.current = null;
    }
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [setZoom]);

  function getFitZoom() {
    const scroll = scheduleScroll.current;
    if (!scroll) return 0.5;
    const rowCount = slots.length;
    const availableHeight = Math.max(250, window.innerHeight - scroll.getBoundingClientRect().top - 115);
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    const widthFit = (scroll.clientWidth - (mobile ? 45 : 52)) / (7 * (mobile ? 74 : 82));
    const heightFit = (availableHeight - 44) / (rowCount * 40);
    return Math.max(0.5, Math.min(3, widthFit, heightFit));
  }

  function fitSchedule() {
    const scroll = scheduleScroll.current;
    if (!scroll) return;
    setZoom(getFitZoom());
    scroll.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  function toggleFitZoom() {
    const fitZoom = getFitZoom();
    setZoom((current) => current > fitZoom + 0.08
      ? fitZoom
      : Math.min(3, Math.max(fitZoom * 2, 1.6)));
  }

  function handleTableTap(action) {
    if (suppressNextTap.current) {
      suppressNextTap.current = false;
      return;
    }
    clearTimeout(tapActionTimer.current);
    tapActionTimer.current = setTimeout(action, 260);
  }
  async function handleImage(file) {
    setScanError("");
    if (!file) return;
    if (fileInput.current) fileInput.current.value = "";
    if (!file.type.startsWith("image/")) {
      setScanError("Choose an image file such as JPG, PNG, or WebP.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setScanError("That image is larger than 15 MB. Choose a smaller photo or screenshot.");
      return;
    }
    if (!navigator.onLine) {
      setScanError("You're offline. Connect to the internet to scan, or add classes manually.");
      return;
    }
    if (!geminiKey) {
      setSettingsOpen(true);
      setScanError("Add your Gemini API key below before scanning. You can also add classes manually.");
      return;
    }
    setIsScanning(true);
    try {
      setReview(await callGeminiForSchedule(file, geminiKey));
    } catch (error) {
      console.error("Schedule scan failed.", error);
      const message = error instanceof Error ? error.message : "";
      setScanError(!navigator.onLine
        ? "The connection was lost during scanning. Reconnect and try again, or add classes manually."
        : message === "Failed to fetch"
          ? "Couldn't reach Gemini. Check your connection and try again, or add classes manually."
          : message || "The scan failed. Please try again or add classes manually.");
    } finally {
      setIsScanning(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function updateReview(id, key, value) {
    setReview((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item));
  }

  function addReviewClass() {
    setReview((current) => [...current, {
      id: newId(),
      subject: "",
      instructor: "",
      room: "",
      day: todayName,
      start: "",
      end: "",
      color: CLASS_COLORS[current.length % CLASS_COLORS.length],
    }]);
  }

  function confirmImport() {
    if (invalidClasses.length) return;
    onImport(review);
    setReview(null);
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPEATS EVERY WEEK</p>
          <h1>Class schedule</h1>
          <p className="page-subtitle">Your weekly timetable, with every class in its place.</p>
        </div>
        <div className="schedule-actions">
          <input ref={fileInput} className="visually-hidden" type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])} />
          <button className="secondary-button scan-button" onClick={() => fileInput.current?.click()} disabled={isScanning}>
            <ImagePlus size={16} />{isScanning ? "Scanning..." : "Scan schedule"}
          </button>
          <button className="primary-button" onClick={() => onAdd(todayName, "09:00")}><Plus size={17} /> Add class</button>
        </div>
      </div>
      <div className="scan-tools">
        <button className="settings-toggle" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
          <Settings2 size={15} /> Gemini API key & privacy <span>{settingsOpen ? "−" : "+"}</span>
        </button>
        {settingsOpen && (
          <div className="api-settings">
            <div className="api-settings-copy">
              <strong>Use your own Gemini API key</strong>
              <p>Get a key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>. Scanning sends the selected image to Google Gemini. Your key is stored only in this browser on this device; anyone with access to this browser profile can use it.</p>
            </div>
            <form className="key-form" onSubmit={(event) => { event.preventDefault(); onSaveGeminiKey(keyDraft); }}>
              <input type="password" autoComplete="new-password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="Paste Gemini API key" aria-label="Gemini API key" />
              <button className="secondary-button" type="submit">Save key</button>
              {geminiKey && <button className="settings-clear" type="button" onClick={() => { setKeyDraft(""); onSaveGeminiKey(""); }}>Remove</button>}
            </form>
          </div>
        )}
        {scanError && <div className="scan-error" role="alert">{scanError}</div>}
      </div>
      <div className="panel schedule-panel">
        <div className="schedule-zoom-controls" aria-label="Schedule table zoom controls">
          <button onClick={() => setZoom((current) => Math.min(3, current + 0.15))} aria-label="Zoom in"><Plus size={15} /></button>
          <button onClick={() => setZoom((current) => Math.max(0.5, current - 0.15))} aria-label="Zoom out"><Minus size={15} /></button>
          <button className="fit-button" onClick={fitSchedule}>Fit</button>
        </div>
        <div className="schedule-scroll" ref={scheduleScroll}>
          <table
            className={`schedule-table${zoom <= 0.82 ? " compact-details" : ""}`}
            style={{ "--schedule-zoom": zoom || 0.65 }}
            onDoubleClick={() => { clearTimeout(tapActionTimer.current); toggleFitZoom(); }}
          >
            <thead>
              <tr>
                <th className="time-column">Time</th>
                {DAYS.map((day) => <th key={day} className={day === todayName ? "today-column" : ""}>{day.slice(0, 3)}<span>{day}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {slots.map((time) => (
                <tr key={time}>
                  <th className="time-column">{time}</th>
                  {DAYS.map((day) => {
                    const startMinutes = timeToMinutes(time) || rangeStart;
                    const entries = classes.filter((item) => {
                      const itemStart = timeToMinutes(item.start);
                      return item.day === day && itemStart !== null && itemStart >= startMinutes && itemStart < startMinutes + BASE_SLOT_MINUTES;
                    });
                    return (
                      <td key={`${day}-${time}`} className={day === todayName ? "today-column" : ""}>
                        {entries.length ? entries.map((item) => (
                          <button
                            key={item.id}
                            className="class-card"
                            style={{
                              "--class-accent": item.color || "var(--accent)",
                              "--class-duration": Math.max(1, ((timeToMinutes(item.end) || (startMinutes + BASE_SLOT_MINUTES)) - (timeToMinutes(item.start) || startMinutes)) / BASE_SLOT_MINUTES),
                            }}
                            onClick={() => handleTableTap(() => onEdit(item))}
                            aria-label={`Edit ${item.subject}, ${item.instructor}, ${item.room}`}
                          >
                            <strong>{item.subject}</strong>
                            <span>{item.instructor || "Professor not listed"}</span>
                            <small>{item.room || "Room not listed"} · {item.start}–{item.end}</small>
                          </button>
                        )) : (
                          <button className="empty-slot" onClick={() => handleTableTap(() => onAdd(day, time))} aria-label={`Add class on ${day} at ${time}`}><Plus size={14} /></button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {classes.length === 0 && <div className="schedule-empty"><strong>Your week is open</strong><p>Tap any time slot to add a class to your weekly schedule.</p></div>}
      </div>
      <p className="schedule-note">Showing {formatTime(rangeStart)}–{formatTime(rangeEnd)} · Pinch or use +/− to zoom, Fit to see the day.</p>
      {review && (
        <Modal title="Review scanned classes" onClose={() => setReview(null)} wide>
          <p className="review-intro">Check every result before adding it. Missing details stay blank; edit them here or remove entries you don't need.</p>
          <div className="review-list">
            {review.map((item, index) => (
              <article className={`review-class${overlaps.some((overlap) => overlap.imported.id === item.id || overlap.other.id === item.id) ? " has-overlap" : ""}`} key={item.id}>
                <div className="review-class-heading">
                  <strong>Class {index + 1}</strong>
                  <button className="icon-button delete-button" aria-label={`Remove class ${index + 1}`} onClick={() => setReview((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 size={15} /></button>
                </div>
                <div className="review-fields">
                  <label>Subject<input value={item.subject} onChange={(event) => updateReview(item.id, "subject", event.target.value)} placeholder="Required" /></label>
                  <label>Professor<input value={item.instructor} onChange={(event) => updateReview(item.id, "instructor", event.target.value)} placeholder="Unknown" /></label>
                  <label>Room / location<input value={item.room} onChange={(event) => updateReview(item.id, "room", event.target.value)} placeholder="Unknown" /></label>
                  <label>Day<select value={item.day} onChange={(event) => updateReview(item.id, "day", event.target.value)}><option value="">Choose day</option>{DAYS.map((day) => <option key={day}>{day}</option>)}</select></label>
                  <label>Start time<input type="time" value={item.start} onChange={(event) => updateReview(item.id, "start", event.target.value)} /></label>
                  <label>End time<input type="time" value={item.end} onChange={(event) => updateReview(item.id, "end", event.target.value)} /></label>
                  <label className="review-color-label">Color<input type="color" value={item.color || CLASS_COLORS[0]} onChange={(event) => updateReview(item.id, "color", event.target.value)} /></label>
                </div>
              </article>
            ))}
          </div>
          <button className="review-add" onClick={addReviewClass}><Plus size={15} /> Add another class</button>
          {invalidClasses.length > 0 && <div className="review-warning"><AlertTriangle size={17} /><span>Complete each class's subject, day, and valid start/end times (07:00–22:00) before importing. Professor and room can be left blank.</span></div>}
          {overlaps.length > 0 && <div className="review-warning"><AlertTriangle size={17} /><span>{overlaps.length} potential time overlap{overlaps.length === 1 ? "" : "s"} found. Nothing will be overwritten; imported classes will be added alongside existing ones.</span></div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setReview(null)}>Cancel</button>
            <button type="button" className="primary-button" disabled={!review.length || invalidClasses.length > 0} onClick={confirmImport}>Add {review.length} {review.length === 1 ? "class" : "classes"}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function nextSlot(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = hours * 60 + minutes + 30;
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}

function TaskModal({ task, due, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: task?.title || "",
    due: task?.due || due || localDate(),
    time: task?.time || "",
    course: task?.course || "",
    priority: task?.priority || "Medium",
  });
  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...task, ...form, title: form.title.trim(), course: form.course.trim(), done: task?.done || false });
    onClose();
  }
  return (
    <Modal title={task ? "Edit task" : "Add a task"} onClose={onClose} sheet>
      <form className="modal-form" onSubmit={submit}>
        <label>Task title<input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Date<input type="date" required value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} /></label>
        <div className="form-row">
          <label>Time<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
          <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label>
        </div>
        <label>Subject<input value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} placeholder="Optional" /></label>
        <div className="modal-actions">
          {onDelete && <button type="button" className="text-danger" onClick={onDelete}>Delete task</button>}
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{task ? "Save task" : "Add task"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ClassModal({ item, defaults, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    subject: item?.subject || "",
    instructor: item?.instructor || "",
    room: item?.room || "",
    day: item?.day || defaults.day,
    start: item?.start || defaults.start,
    end: item?.end || nextSlot(nextSlot(defaults.start)),
    color: item?.color || CLASS_COLORS[0],
  });
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    if (form.start >= form.end) {
      setError("End time must be later than start time.");
      return;
    }
    onSave({ ...form, subject: form.subject.trim(), instructor: form.instructor.trim(), room: form.room.trim() });
    onClose();
  }
  return (
    <Modal title={item ? "Edit class" : "Add a class"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>Subject name<input autoFocus required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="e.g. Data Structures" /></label>
        <label>Professor<input required value={form.instructor} onChange={(event) => setForm({ ...form, instructor: event.target.value })} placeholder="e.g. Prof. Lee" /></label>
        <label>Room or location<input required value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} placeholder="e.g. Science Hall 204" /></label>
        <label>Day<select value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select></label>
        <div className="form-row">
          <label>Start time<input type="time" required min="07:00" max="21:30" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label>
          <label>End time<input type="time" required min="07:30" max="22:00" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label>
        </div>
        <label className="color-field">Accent color<div className="color-picker">{CLASS_COLORS.map((color) => (
          <button type="button" key={color} className={`color-swatch${form.color === color ? " selected" : ""}`} style={{ background: color }} onClick={() => setForm({ ...form, color })} aria-label={`Choose ${color}`} />
        ))}<input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} aria-label="Custom accent color" /></div></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          {onDelete && <button type="button" className="text-danger" onClick={onDelete}>Delete class</button>}
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{item ? "Save changes" : "Add class"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children, wide = false, sheet = false }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal${wide ? " wide-modal" : ""}${sheet ? " sheet-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {children}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
