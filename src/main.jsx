import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlignCenter, AlignLeft, AlignRight, AlertTriangle, Bold, CalendarDays, Camera, Check,
  ChevronLeft, ChevronRight, Clock3, Eraser, FileText, Heading1, Heading2, House,
  Italic, List, ListChecks, ListOrdered, Pencil, Plus, Redo2, ScanLine, Search,
  Settings, Strikethrough, Trash2, Underline, Undo2, Upload, X, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import { extractScheduleFromImage } from "./services/gemini.js";
import "./styles.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SCHEDULE_DAYS = DAYS;
const DAY_CODES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CLASS_COLORS = ["#3787f5", "#28b8ad", "#71839b", "#596fea", "#50a3d8"];
const HOUR_HEIGHT = 64;
const NAV_ITEMS = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "classes", label: "Classes", icon: Clock3 },
  { id: "notes", label: "Notes", icon: FileText },
];

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

function formatClock(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return value || "";
  const hour = Math.floor(minutes / 60);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

function scheduleEntries(classes) {
  const entries = SCHEDULE_DAYS.flatMap((day) => {
    const dayClasses = classes
      .filter((item) => item.days.includes(day))
      .map((item) => ({ item, start: timeToMinutes(item.startTime), end: timeToMinutes(item.endTime) }))
      .filter(({ start, end }) => start !== null && end !== null && start < end)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const groups = [];
    dayClasses.forEach((entry) => {
      const group = groups[groups.length - 1];
      if (!group || entry.start >= group.end) groups.push({ end: entry.end, entries: [entry] });
      else {
        group.end = Math.max(group.end, entry.end);
        group.entries.push(entry);
      }
    });

    return groups.flatMap((group) => {
      const active = [];
      let laneCount = 0;
      const positioned = group.entries.map((entry) => {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (active[index].end <= entry.start) active.splice(index, 1);
        }
        const occupied = new Set(active.map((lane) => lane.index));
        let lane = 0;
        while (occupied.has(lane)) lane += 1;
        active.push({ index: lane, end: entry.end });
        laneCount = Math.max(laneCount, lane + 1);
        return { ...entry, lane };
      });
      return positioned.map((entry) => ({ ...entry, laneCount }));
    }).map((entry) => ({ ...entry, day }));
  });
  return entries;
}

function classesOverlap(candidate, existing) {
  const start = timeToMinutes(candidate.startTime);
  const end = timeToMinutes(candidate.endTime);
  return existing.some((item) => {
    const existingStart = timeToMinutes(item.startTime);
    const existingEnd = timeToMinutes(item.endTime);
    return item.days.some((day) => candidate.days.includes(day))
      && start !== null && end !== null && existingStart !== null && existingEnd !== null
      && start < existingEnd && existingStart < end;
  });
}

function normalizeClass(item) {
  const days = Array.isArray(item?.days) ? item.days : item?.day ? [item.day] : [];
  const dayNames = new Map(DAY_CODES.map((code, index) => [code, SCHEDULE_DAYS[index]]));
  return {
    ...item,
    id: typeof item?.id === "string" ? item.id : newId(),
    subject: typeof item?.subject === "string" ? item.subject : "",
    professor: typeof item?.professor === "string"
      ? item.professor
      : typeof item?.instructor === "string" ? item.instructor : "",
    room: typeof item?.room === "string" ? item.room : "",
    days: [...new Set(days.map((day) => dayNames.get(day) || day).filter((day) => SCHEDULE_DAYS.includes(day)))],
    startTime: typeof item?.startTime === "string" ? item.startTime : typeof item?.start === "string" ? item.start : "",
    endTime: typeof item?.endTime === "string" ? item.endTime : typeof item?.end === "string" ? item.end : "",
    color: typeof item?.color === "string" ? item.color : CLASS_COLORS[0],
  };
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

function normalizeNote(note) {
  const content = note?.content ?? note?.html ?? note?.body ?? note?.text ?? "";
  const updatedAt = note?.updatedAt || note?.updated || new Date().toISOString();
  const parsedUpdatedAt = Date.parse(updatedAt);
  return {
    id: typeof note?.id === "string" ? note.id : newId(),
    title: typeof note?.title === "string" ? note.title : typeof note?.name === "string" ? note.name : "Untitled note",
    content: typeof content === "string" ? sanitizeNoteHtml(content) : "",
    updatedAt: Number.isNaN(parsedUpdatedAt) ? new Date().toISOString() : new Date(parsedUpdatedAt).toISOString(),
  };
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dateLabel(value, options = { month: "long", day: "numeric", year: "numeric" }) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
}

function App() {
  const [tab, setTab] = useState("calendar");
  const [tasks, setTasks] = useState(() => readStored("orbit_tasks"));
  const [classes, setClasses] = useState(() => readStored("orbit_classes").map(normalizeClass));
  const [notes, setNotes] = useState(() => readStored("orbit_notes").map(normalizeNote));
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try {
      return localStorage.getItem("orbit_gemini_api_key") || "";
    } catch (error) {
      console.warn("Could not read the Gemini API key from local storage.", error);
      return "";
    }
  });
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [editingTask, setEditingTask] = useState(null);
  const [taskComposerDate, setTaskComposerDate] = useState(null);
  const [editingClass, setEditingClass] = useState(null);
  const [classDefaults, setClassDefaults] = useState(null);
  const [notice, setNotice] = useState("");
  const backupInput = useRef(null);
  const [calendarHintVisible, setCalendarHintVisible] = useState(() => {
    try {
      return localStorage.getItem("orbit_calendar_hint_dismissed") !== "true"
        && readStored("orbit_tasks").length === 0;
    } catch {
      return true;
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
      localStorage.setItem("orbit_notes", JSON.stringify(notes));
    } catch (error) {
      console.error("Could not save notes to local storage.", error);
      setNotice("Notes could not be saved on this device. Check your browser storage settings.");
    }
  }, [notes]);

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
    const savedItem = normalizeClass(item);
    const otherClasses = classes.filter((entry) => entry.id !== editingClass?.id);
    if (classesOverlap(savedItem, otherClasses)) {
      setNotice("This class overlaps an existing class. Both were kept in your schedule; review the timetable.");
    }
    setClasses((current) => editingClass
      ? current.map((entry) => entry.id === editingClass.id ? { ...savedItem, id: editingClass.id } : entry)
      : [...current, { ...savedItem, id: newId() }]);
    setEditingClass(null);
    setClassDefaults(null);
  }

  function openClass(day, start) {
    setEditingClass(null);
    setClassDefaults({ days: [day], startTime: start });
  }

  function importScannedClasses(imported) {
    const overlaps = imported.filter((item) => classesOverlap(item, classes));
    setClasses((current) => [...current, ...imported.map((item) => ({ ...normalizeClass(item), id: newId() }))]);
    setNotice(overlaps.length
      ? `${overlaps.length} scanned class${overlaps.length === 1 ? "" : "es"} overlap existing classes. They were added without overwriting anything; review your schedule.`
      : `${imported.length} class${imported.length === 1 ? "" : "es"} added to your weekly schedule.`);
  }

  function saveGeminiApiKey(value) {
    setGeminiApiKey(value);
    try {
      if (value.trim()) localStorage.setItem("orbit_gemini_api_key", value.trim());
      else localStorage.removeItem("orbit_gemini_api_key");
    } catch (error) {
      console.error("Could not save the Gemini API key to local storage.", error);
      setNotice("The API key could not be saved on this device. Check your browser storage settings.");
    }
  }

  function exportBackup() {
    const contents = JSON.stringify({ version: 2, tasks, classes, notes }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orbit-planner-${localDate()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Planner backup downloaded.");
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!Array.isArray(backup.tasks) || !Array.isArray(backup.classes)) {
        throw new Error("This file is not a valid Orbit planner backup.");
      }
      const newTasks = backup.tasks.filter((item) => item && typeof item.title === "string")
        .map((item) => ({ ...item, id: newId() }));
      const newClasses = backup.classes.filter((item) => (
        item && typeof item.subject === "string"
        && (Array.isArray(item.days) || SCHEDULE_DAYS.includes(item.day))
      )).map((item) => ({ ...normalizeClass(item), id: newId() }));
      const backupNotes = Array.isArray(backup.notes) ? backup.notes : [];
      const newNotes = backupNotes.filter((item) => item && typeof (item.title || item.name) === "string")
        .map((item) => ({ ...normalizeNote(item), id: newId() }));
      const skippedCount = backup.tasks.length - newTasks.length
        + backup.classes.length - newClasses.length
        + backupNotes.length - newNotes.length;
      setTasks((current) => [...current, ...newTasks]);
      setClasses((current) => [...current, ...newClasses]);
      setNotes((current) => [...current, ...newNotes]);
      const skippedNotice = skippedCount ? ` ${skippedCount} invalid entr${skippedCount === 1 ? "y was" : "ies were"} skipped.` : "";
      setNotice(`Imported ${newTasks.length} tasks, ${newClasses.length} classes, and ${newNotes.length} notes. Existing data was kept.${skippedNotice}`);
    } catch (error) {
      console.error("Could not import planner backup.", error);
      setNotice(error instanceof Error ? error.message : "The backup could not be imported.");
    } finally {
      if (backupInput.current) backupInput.current.value = "";
    }
  }

  const toggleTask = (id) => setTasks((current) => current.map((task) => (
    task.id === id ? { ...task, done: !task.done } : task
  )));
  const editTask = (task) => {
    setTaskComposerDate(null);
    setEditingTask(task);
  };
  const deleteTask = (id) => setTasks((current) => current.filter((task) => task.id !== id));

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Orbit planner home">
          <span className="brand-mark"><CalendarDays size={20} /></span>
          <span>orbit<span className="brand-period">.</span></span>
        </a>
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
            onEditTask={editTask}
            onDeleteTask={deleteTask}
            onAddForDate={(date) => setTaskComposerDate(date)}
            hintVisible={calendarHintVisible}
            onDismissHint={dismissCalendarHint}
          />
        ) : tab === "classes" ? (
          <SchedulePage
            classes={classes}
            today={today}
            onAdd={openClass}
            onEdit={setEditingClass}
            onImport={importScannedClasses}
            savedApiKey={geminiApiKey}
            onSaveApiKey={saveGeminiApiKey}
          />
        ) : (
          <NotesPage notes={notes} setNotes={setNotes} />
        )}
      </main>

      <nav className="bottom-tabs" aria-label="Planner pages">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? "bottom-tab active" : "bottom-tab"} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
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

function HomePage({ today, tasks, classes, onNavigate, onAddTask, onEditTask, onToggleTask, onDeleteTask, onEditClass, noteCount }) {
  const pending = tasks.filter((task) => !task.done);
  const nextTasks = [...pending].sort((a, b) => a.due.localeCompare(b.due) || (a.time || "").localeCompare(b.time || "")).slice(0, 4);
  const todayName = DAYS[(new Date(`${today}T12:00:00`).getDay() + 6) % 7];
  const todaysClasses = classes.filter((item) => item.day === todayName).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <section className="page home-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR PLANNER</p>
          <h1>Home</h1>
          <p className="page-subtitle">{dateLabel(today, { weekday: "long", month: "long", day: "numeric" })} · A clear view of what’s ahead.</p>
        </div>
      </div>
      <div className="home-stats">
        <button className="panel home-stat" onClick={() => onNavigate("tasks")}><span>Open tasks</span><strong>{pending.length}</strong></button>
        <button className="panel home-stat" onClick={() => onNavigate("schedule")}><span>Weekly classes</span><strong>{classes.length}</strong></button>
      </div>
      <div className="home-sections">
        <section className="panel home-section">
          <div className="section-heading"><div><p className="eyebrow">UP NEXT</p><h2>Your tasks</h2></div><button className="text-button" onClick={() => onNavigate("tasks")}>All tasks</button></div>
          {nextTasks.length ? (
            <TaskList tasks={nextTasks} onEdit={onEditTask} onToggle={onToggleTask} onDelete={onDeleteTask} />
          ) : (
            <div className="empty-panel-copy">You’re all caught up. Add a task whenever something comes up.</div>
          )}
          <button className="secondary-button home-add-button" onClick={onAddTask}><Plus size={16} /> Add a task</button>
        </section>
        <section className="panel home-section">
          <div className="section-heading"><div><p className="eyebrow">TODAY</p><h2>{todayName}</h2></div><button className="text-button" onClick={() => onNavigate("schedule")}>Full schedule</button></div>
          {todaysClasses.length ? (
            <div className="home-class-list">
              {todaysClasses.map((item) => (
                <button className="home-class-item" key={item.id} onClick={() => onEditClass(item)} style={{ "--class-accent": item.color || CLASS_COLORS[0] }}>
                  <span>{formatClock(item.start)}–{formatClock(item.end)}</span><strong>{item.subject}</strong><small>{item.room || "Location not listed"}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-panel-copy">No classes on your schedule today.</div>
          )}
        </section>
      </div>
      <button className="panel home-notes-entry" onClick={() => onNavigate("notes")}>
        <span className="home-notes-icon"><FileText size={19} /></span>
        <span className="home-notes-copy"><strong>Study notes</strong><small>{noteCount ? `${noteCount} saved ${noteCount === 1 ? "note" : "notes"}` : "Write and organize your study notes"}</small></span>
        <span className="home-notes-action">Open notes <ChevronRight size={16} /></span>
      </button>
    </section>
  );
}

function TasksPage({ tasks, onAdd, onEdit, onToggle, onDelete }) {
  const ordered = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due) || (a.time || "").localeCompare(b.time || ""));
  return (
    <section className="page tasks-page">
      <div className="page-heading">
        <div><p className="eyebrow">STAY ON TRACK</p><h1>Tasks</h1><p className="page-subtitle">{tasks.filter((task) => !task.done).length} left to do.</p></div>
        <button className="primary-button" onClick={onAdd}><Plus size={17} /> Add task</button>
      </div>
      <section className="panel tasks-panel" aria-label="All tasks">
        {ordered.length ? <TaskList tasks={ordered} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} /> : (
          <div className="empty-panel-copy">No tasks yet. Add one to keep track of what’s next.</div>
        )}
      </section>
    </section>
  );
}

function TaskList({ tasks, onEdit, onToggle, onDelete }) {
  return (
    <ul className="planner-task-list">
      {tasks.map((task) => (
        <li className={`planner-task${task.done ? " is-complete" : ""}`} key={task.id}>
          <button className={`task-check${task.done ? " checked" : ""}`} aria-label={task.done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`} onClick={onToggle ? () => onToggle(task.id) : undefined}>{task.done && <Check size={14} />}</button>
          <button className="planner-task-main" onClick={() => onEdit(task)}>
            <strong>{task.title}</strong>
            <span>{dateLabel(task.due, { weekday: "short", month: "short", day: "numeric" })}{task.time ? ` · ${formatClock(task.time)}` : " · Any time"}{task.course ? ` · ${task.course}` : ""}</span>
          </button>
          {onDelete && <button className="icon-button delete-button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task.id)}><Trash2 size={16} /></button>}
        </li>
      ))}
    </ul>
  );
}

function SettingsPage({ backupInput, onExport, onImport }) {
  return (
    <section className="page settings-page">
      <div className="page-heading"><div><p className="eyebrow">YOUR DATA</p><h1>Settings</h1><p className="page-subtitle">Your planner stays on this device. No account or API key is needed.</p></div></div>
      <section className="panel settings-panel">
        <div><h2>Planner backup</h2><p>Download a copy of your tasks, classes, and notes, or add data from a previous Orbit backup. Importing keeps your existing planner data.</p></div>
        <div className="settings-actions">
          <button className="secondary-button" onClick={onExport}>Download backup</button>
          <button className="primary-button" onClick={() => backupInput.current?.click()}><Upload size={16} /> Import backup</button>
          <input ref={backupInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => onImport(event.target.files?.[0])} aria-label="Choose an Orbit planner backup" />
        </div>
        <p className="settings-storage-note">Tasks, classes, and notes are saved in this browser’s local storage.</p>
      </section>
    </section>
  );
}

const NOTE_TAGS = new Set(["A", "B", "BLOCKQUOTE", "BR", "DEL", "DIV", "EM", "H1", "H2", "H3", "I", "INPUT", "LI", "OL", "P", "S", "STRIKE", "STRONG", "U", "UL"]);

function sanitizeNoteHtml(value) {
  const documentValue = new DOMParser().parseFromString(String(value || ""), "text/html");
  const dangerousTags = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE", "SVG", "MATH", "VIDEO", "AUDIO"]);
  const sanitizeNode = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (dangerousTags.has(node.tagName)) {
        node.remove();
        return;
      }
      sanitizeNode(node);
      if (!NOTE_TAGS.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }
      const style = node.getAttribute("style") || "";
      const alignment = style.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right)\s*(?:;|$)/i)?.[1]?.toLowerCase();
      const href = node.tagName === "A" ? node.getAttribute("href") : "";
      const checked = node.tagName === "INPUT" && node.type === "checkbox" && node.checked;
      const checklist = node.tagName === "UL" && node.hasAttribute("data-checklist");
      [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
      if (alignment && ["P", "DIV", "H1", "H2", "H3", "BLOCKQUOTE"].includes(node.tagName)) {
        node.setAttribute("style", `text-align: ${alignment}`);
      }
      if (checklist) {
        node.setAttribute("data-checklist", "true");
      }
      if (node.tagName === "INPUT") {
        node.setAttribute("type", "checkbox");
        node.disabled = false;
        if (checked) node.setAttribute("checked", "");
        else node.removeAttribute("checked");
      }
      if (node.tagName === "A" && href && /^(https?:|mailto:)/i.test(href)) {
        node.setAttribute("href", href);
        node.setAttribute("rel", "noopener noreferrer");
        node.setAttribute("target", "_blank");
      }
    });
  };
  sanitizeNode(documentValue.body);
  return documentValue.body.innerHTML;
}

function notePlainText(value) {
  const documentValue = new DOMParser().parseFromString(String(value || ""), "text/html");
  return documentValue.body.textContent || "";
}

function NotesPage({ notes, setNotes }) {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [wordCount, setWordCount] = useState(0);
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  const pendingSave = useRef(null);
  const selectedNote = notes.find((note) => note.id === selectedId) || null;
  const visibleNotes = notes.filter((note) => (
    `${note.title} ${notePlainText(note.content)}`.toLowerCase().includes(search.trim().toLowerCase())
  )).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    if (selectedNote && editorRef.current) {
      const content = sanitizeNoteHtml(selectedNote.content);
      editorRef.current.innerHTML = content;
      const text = notePlainText(content).trim();
      setWordCount(text ? text.split(/\s+/).length : 0);
    }
  }, [selectedId]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (pendingSave.current) {
      updateNote(pendingSave.current.id, { content: sanitizeNoteHtml(pendingSave.current.content) });
      pendingSave.current = null;
    }
  }, []);

  function updateNote(id, changes) {
    setNotes((current) => current.map((note) => note.id === id
      ? { ...note, ...changes, updatedAt: new Date().toISOString() }
      : note));
  }

  function saveEditor(id, content, immediate = false) {
    if (!id) return;
    clearTimeout(saveTimer.current);
    pendingSave.current = { id, content };
    setSaveStatus("Saving…");
    const save = () => {
      const pending = pendingSave.current;
      if (!pending) return;
      updateNote(pending.id, { content: sanitizeNoteHtml(pending.content) });
      pendingSave.current = null;
      setSaveStatus("Saved");
    };
    if (immediate) save();
    else saveTimer.current = setTimeout(save, 450);
  }

  function createNote() {
    const id = newId();
    setNotes((current) => [{
      id,
      title: "Untitled note",
      content: "<p><br></p>",
      updatedAt: new Date().toISOString(),
    }, ...current]);
    setSelectedId(id);
    setSearch("");
    setSaveStatus("Saved");
  }

  function deleteNote() {
    if (!selectedNote || !window.confirm(`Delete "${selectedNote.title || "Untitled note"}"? This cannot be undone.`)) return;
    setNotes(notes.filter((note) => note.id !== selectedNote.id));
    setSelectedId("");
  }

  function runEditorCommand(command, value = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) saveEditor(selectedId, editorRef.current.innerHTML);
  }

  function clearFormatting() {
    editorRef.current?.focus();
    document.execCommand("removeFormat", false);
    document.execCommand("formatBlock", false, "p");
    document.execCommand("justifyLeft", false);
    if (editorRef.current) saveEditor(selectedId, editorRef.current.innerHTML);
  }

  function insertChecklist() {
    runEditorCommand("insertHTML", '<ul data-checklist="true"><li><input type="checkbox" />&nbsp;</li></ul><p><br></p>');
  }

  function pasteSanitized(event) {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (html) document.execCommand("insertHTML", false, sanitizeNoteHtml(html));
    else document.execCommand("insertText", false, text);
    if (editorRef.current) saveEditor(selectedId, editorRef.current.innerHTML);
  }

  function toggleChecklistItem(event) {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
    if (event.target.checked) event.target.setAttribute("checked", "");
    else event.target.removeAttribute("checked");
    if (editorRef.current) saveEditor(selectedId, editorRef.current.innerHTML, true);
  }

  const toolbarButtons = [
    { label: "Bold", icon: Bold, command: "bold" },
    { label: "Italic", icon: Italic, command: "italic" },
    { label: "Underline", icon: Underline, command: "underline" },
    { label: "Strikethrough", icon: Strikethrough, command: "strikeThrough" },
    { label: "Heading 1", icon: Heading1, command: "formatBlock", value: "h1" },
    { label: "Heading 2", icon: Heading2, command: "formatBlock", value: "h2" },
    { label: "Bulleted list", icon: List, command: "insertUnorderedList" },
    { label: "Numbered list", icon: ListOrdered, command: "insertOrderedList" },
    { label: "Checklist", icon: ListChecks, action: insertChecklist },
    { label: "Align left", icon: AlignLeft, command: "justifyLeft" },
    { label: "Align center", icon: AlignCenter, command: "justifyCenter" },
    { label: "Align right", icon: AlignRight, command: "justifyRight" },
    { label: "Undo", icon: Undo2, command: "undo" },
    { label: "Redo", icon: Redo2, command: "redo" },
    { label: "Clear formatting", icon: Eraser, action: clearFormatting },
  ];

  return (
    <section className="page notes-page">
      <div className="page-heading notes-page-heading">
        <div>
          <p className="eyebrow">YOUR IDEAS, ALL IN ONE PLACE</p>
          <h1>Notes</h1>
          <p className="page-subtitle">Capture class notes, reminders, and ideas.</p>
        </div>
        {!selectedNote && <div className="notes-heading-actions"><button className="primary-button" onClick={createNote}><Plus size={17} /> New note</button></div>}
      </div>
      {selectedNote ? (
        <>
          <button type="button" className="notes-back-button" onClick={() => setSelectedId("")}><ChevronLeft size={17} /> All notes</button>
          <section className="panel note-editor-panel" aria-label="Note editor">
              <div className="note-editor-heading">
                <input className="note-title-input" value={selectedNote.title} onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })} aria-label="Note title" placeholder="Untitled note" />
                <div className="note-save-actions"><span role="status">{saveStatus}</span><button className="icon-button delete-button" onClick={deleteNote} aria-label="Delete note"><Trash2 size={17} /></button></div>
              </div>
              <div className="note-writing-meta" aria-live="polite">
                <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
                <span aria-hidden="true">·</span>
                <span>{wordCount ? `${Math.max(1, Math.ceil(wordCount / 200))} min read` : "Ready to write"}</span>
              </div>
              <div className="note-toolbar" role="toolbar" aria-label="Note formatting">
                {toolbarButtons.map(({ label, icon: Icon, command, value, action }) => (
                  <button key={label} type="button" className="note-tool-button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={action || (() => runEditorCommand(command, value))}><Icon size={16} /></button>
                ))}
                <button type="button" className="note-tool-button" title="Normal text" aria-label="Normal text" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("formatBlock", "p")}>P</button>
              </div>
              <div
                ref={editorRef}
                className="note-editor"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Note content"
                aria-multiline="true"
                data-placeholder="Start writing your study notes…"
                onInput={() => {
                  if (!editorRef.current) return;
                  const text = editorRef.current.innerText.trim();
                  setWordCount(text ? text.split(/\s+/).length : 0);
                  saveEditor(selectedNote.id, editorRef.current.innerHTML);
                }}
                onBlur={() => editorRef.current && saveEditor(selectedNote.id, editorRef.current.innerHTML, true)}
                onPaste={pasteSanitized}
                onClick={toggleChecklistItem}
              />
          </section>
        </>
      ) : (
        <>
          <label className="notes-search notes-board-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your notes" aria-label="Search notes" /></label>
          <section className="note-board" aria-label="Saved notes">
            {visibleNotes.length ? visibleNotes.map((note) => (
              <button key={note.id} className="note-card" onClick={() => setSelectedId(note.id)}>
                <strong>{note.title || "Untitled note"}</strong>
                <span className="note-card-preview">{notePlainText(note.content).trim() || "Tap to add your thoughts…"}</span>
                <small>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
              </button>
            )) : (
              <div className="notes-empty-editor">
                <FileText size={28} />
                <h2>{search ? "No matching notes" : "Your notes will show up here"}</h2>
                <p>{search ? "Try another search or clear the search field." : "Start with a quick note, class summary, or reminder."}</p>
                {!search && <button className="primary-button" onClick={createNote}><Plus size={17} /> Create a note</button>}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function CalendarPage({
  month, setMonth, today, selectedDate, setSelectedDate, tasks,
  onEditTask, onDeleteTask, onAddForDate, hintVisible, onDismissHint,
}) {
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const ignoreClick = useRef(false);
  const suppressCalendarTap = useRef(false);
  const touchStart = useRef(null);
  const [pulseDate, setPulseDate] = useState("");
  const [showSelectedTasks, setShowSelectedTasks] = useState(false);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? day : null;
  });

  function selectCalendarDay(value) {
    setSelectedDate(value);
    setShowSelectedTasks(true);
  }

  const selectedTasks = tasks
    .filter((task) => task.due === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  function beginLongPress(event, value) {
    if (event.button !== undefined && event.button !== 0) return;
    clearTimeout(pressTimer.current);
    ignoreClick.current = false;
    pressStart.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = setTimeout(() => {
      ignoreClick.current = true;
      setSelectedDate(value);
      setShowSelectedTasks(true);
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
        {showSelectedTasks && <section className="panel selected-day-panel" aria-label="Selected day tasks" aria-live="polite">
          <div className="selected-day-heading">
            <div>
              <p className="eyebrow">{selectedDate === today ? "TODAY" : "SELECTED DAY"}</p>
              <h2>{dateLabel(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h2>
            </div>
            <div className="selected-day-actions">
              <span className="task-count" aria-label={`${selectedTasks.length} tasks`}>{selectedTasks.length}</span>
              <button className="primary-button" onClick={() => onAddForDate(selectedDate)}><Plus size={16} /> Add task</button>
              <button className="icon-button" aria-label="Close task list" onClick={() => setShowSelectedTasks(false)}><X size={16} /></button>
            </div>
          </div>
          {selectedTasks.length ? (
            <ul className="selected-day-list">
              {selectedTasks.map((task) => (
                <li className="selected-day-task" key={task.id}>
                  <button className="selected-day-task-content" onClick={() => onEditTask(task)}>
                    <strong>{task.title}</strong>
                    <span>{task.time || "Any time"}{task.course ? ` · ${task.course}` : ""}</span>
                  </button>
                  <button className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => onEditTask(task)}><Pencil size={15} /></button>
                  <button className="icon-button delete-button" aria-label={`Delete ${task.title}`} onClick={() => onDeleteTask(task.id)}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="selected-day-empty">No tasks for this day yet.</p>
          )}
        </section>}
        <section className="panel calendar-panel" aria-label="Monthly calendar" onTouchStart={onCalendarTouchStart} onTouchEnd={onCalendarTouchEnd}>
          <div className="calendar-heading">
            <div>
              <h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
              <p>Select any date to see its tasks</p>
            </div>
            <div className="month-controls">
              <button className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={18} /></button>
              <button className="today-button" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelectedDate(today); setShowSelectedTasks(true); }}>Today</button>
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
                    selectCalendarDay(value);
                  }}
                >
                  {day && <>
                    <span className="date-number">{day}</span>
                    {dayTasks.length > 0 && (
                      <span className="date-task-list" aria-hidden="true">
                        {dayTasks.slice(0, 2).map((task) => (
                          <span className={`date-task-chip${task.done ? " is-complete" : ""}`} key={task.id} title={task.title}>{task.title}</span>
                        ))}
                        {dayTasks.length > 2 && <span className="date-task-more">+{dayTasks.length - 2} more</span>}
                      </span>
                    )}
                  </>}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend"><i /> Days with tasks</div>
          {hintVisible && <div className="calendar-hint"><span>Tap a day to see its full task list above · Long press to add a task.</span><button aria-label="Dismiss calendar hint" onClick={onDismissHint}><X size={14} /></button></div>}
        </section>

      </div>
    </section>
  );
}

function SchedulePage({ classes, today, onAdd, onEdit, onImport, savedApiKey, onSaveApiKey }) {
  const todayName = DAYS[(new Date(`${today}T12:00:00`).getDay() + 6) % 7];
  const entries = scheduleEntries(classes);
  const firstClassHour = entries.length ? Math.floor(Math.min(...entries.map((entry) => entry.start)) / 60) : 8;
  const lastClassHour = entries.length ? Math.ceil(Math.max(...entries.map((entry) => entry.end)) / 60) : 18;
  const firstHour = Math.max(0, Math.min(23, firstClassHour));
  const lastHour = Math.max(firstHour + 1, Math.min(24, lastClassHour));
  const hourCount = lastHour - firstHour;
  const hours = Array.from({ length: hourCount + 1 }, (_, index) => firstHour * 60 + index * 60);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [review, setReview] = useState(null);
  const [overlapsConfirmed, setOverlapsConfirmed] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [apiKeyInput, setApiKeyInput] = useState(savedApiKey);
  const pinchStart = useRef(null);
  const invalidRows = review?.classes.filter((item) => (
    !item.subject.trim()
    || !item.days.length
    || timeToMinutes(item.startTime) === null
    || timeToMinutes(item.endTime) === null
    || item.startTime >= item.endTime
  )) || [];
  const overlapRows = review?.classes.filter((candidate, index, list) => (
    classesOverlap(candidate, classes)
    || list.slice(0, index).some((previous) => classesOverlap(candidate, [previous]))
  )) || [];

  async function scanSchedule(file) {
    setScanError("");
    setReview(null);
    setOverlapsConfirmed(false);
    setAddMenuOpen(false);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setScanError("Choose an image file to scan. You can also add a class manually.");
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setScanError("This image is larger than 15 MB. Choose a smaller photo or screenshot.");
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
      return;
    }

    setScanning(true);
    try {
      const extracted = await extractScheduleFromImage(file);
      if (!extracted.length) {
        setScanError("No classes could be read from this image. You can try another image or add classes manually.");
      }
      setReview({
        classes: extracted.map((item, index) => ({
          id: newId(),
          subject: item.subject,
          professor: item.professor,
          room: item.room,
          days: item.days.map((code) => SCHEDULE_DAYS[DAY_CODES.indexOf(code)]).filter(Boolean),
          startTime: item.startTime,
          endTime: item.endTime,
          color: CLASS_COLORS[index % CLASS_COLORS.length],
        })),
      });
    } catch (error) {
      console.error("Could not scan this schedule image.", error);
      setScanError(error instanceof Error ? error.message : "The schedule could not be scanned. Try again or add classes manually.");
    } finally {
      setScanning(false);
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  function updateReview(id, key, value) {
    setOverlapsConfirmed(false);
    setReview((current) => ({
      ...current,
      classes: current.classes.map((item) => item.id === id ? { ...item, [key]: value } : item),
    }));
  }

  function addReviewClass() {
    setOverlapsConfirmed(false);
    setReview((current) => ({
      ...current,
      classes: [...current.classes, {
        id: newId(),
        subject: "",
        professor: "",
        room: "",
        days: [],
        startTime: "",
        endTime: "",
        color: CLASS_COLORS[current.classes.length % CLASS_COLORS.length],
      }],
    }));
  }

  function confirmImport() {
    if (!review?.classes.length || invalidRows.length) return;
    if (overlapRows.length && !overlapsConfirmed) {
      setOverlapsConfirmed(true);
      return;
    }
    onImport(review.classes);
    setReview(null);
    setOverlapsConfirmed(false);
  }

  const renderDayColumn = (day) => (
    <div
      key={day}
      className={`schedule-day-column${day === todayName ? " today-column" : ""}`}
      aria-label={`${day} schedule.`}
      style={{ height: `${hourCount * HOUR_HEIGHT * zoom}px`, "--hour-height": `${HOUR_HEIGHT * zoom}px` }}
    >
      {entries.filter((entry) => entry.day === day).map((entry) => (
        <button
          key={entry.item.id}
          type="button"
          className="class-card"
          style={{
            "--class-accent": entry.item.color || CLASS_COLORS[0],
            top: `${((entry.start - firstHour * 60) / 60) * HOUR_HEIGHT * zoom}px`,
            height: `${((entry.end - entry.start) / 60) * HOUR_HEIGHT * zoom}px`,
            left: `calc(${(entry.lane / entry.laneCount) * 100}% + 3px)`,
            width: `calc(${100 / entry.laneCount}% - 6px)`,
          }}
          onClick={() => onEdit(entry.item)}
          aria-label={`${entry.item.subject}, ${day}, ${formatClock(entry.item.startTime)} to ${formatClock(entry.item.endTime)}, ${entry.item.room || "location not listed"}. Tap to edit or delete.`}
          title={`${entry.item.subject} | ${formatClock(entry.item.startTime)}-${formatClock(entry.item.endTime)} | ${entry.item.room || "Location not listed"}`}
        >
          <strong>{entry.item.subject}</strong>
          <span>{formatClock(entry.item.startTime)}-{formatClock(entry.item.endTime)} · {entry.item.room || "Location not listed"}</span>
          {entry.item.professor && <span>{entry.item.professor}</span>}
        </button>
      ))}
    </div>
  );

  function changeZoom(value) {
    setZoom(Math.min(2, Math.max(0.08, value)));
  }

  function fitSchedule() {
    const availableHeight = Math.max(100, window.innerHeight * 0.62 - 66);
    changeZoom(Math.min(1, availableHeight / (hourCount * HOUR_HEIGHT)));
  }

  function handlePinchStart(event) {
    if (event.touches.length === 2) {
      const [first, second] = event.touches;
      pinchStart.current = {
        distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
        zoom,
      };
    }
  }

  function handlePinchMove(event) {
    if (event.touches.length !== 2 || !pinchStart.current) return;
    const [first, second] = event.touches;
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    changeZoom(pinchStart.current.zoom + (distance - pinchStart.current.distance) / 260);
    if (event.cancelable) event.preventDefault();
  }

  return (
    <section className="page schedule-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPEATS EVERY WEEK</p>
          <h1>Classes</h1>
          <p className="page-subtitle">Your weekly timetable, with every class in its place.</p>
        </div>
        <div className="add-class-menu">
          <button className="primary-button add-class-trigger" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}><Plus size={17} /> Add class</button>
          {addMenuOpen && (
            <div className="add-class-options">
              <button onClick={() => { setAddMenuOpen(false); onAdd(todayName, "09:00"); }}><Pencil size={16} /> Add manually</button>
              <button onClick={() => cameraInput.current?.click()} disabled={scanning}><Camera size={16} /> Take photo</button>
              <button onClick={() => fileInput.current?.click()} disabled={scanning}><Upload size={16} /> Upload / scan image</button>
            </div>
          )}
        </div>
      </div>
      <input ref={fileInput} className="visually-hidden" type="file" accept="image/*" onChange={(event) => scanSchedule(event.target.files?.[0])} />
      <input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => scanSchedule(event.target.files?.[0])} />
      <details className="class-ai-settings">
        <summary>Gemini scan settings</summary>
        <label>Gemini API key
          <input type="password" autoComplete="off" value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} onBlur={() => onSaveApiKey(apiKeyInput)} placeholder={import.meta.env.VITE_GEMINI_API_KEY ? "Using environment key (or paste a local key)" : "Paste your Gemini API key"} />
        </label>
        <small>Your key is stored only in this browser’s local storage. Images are sent to Google Gemini when you scan.</small>
      </details>
      {scanning && <div className="scan-progress" role="status" aria-live="polite"><span>Scanning your schedule with Gemini…</span><span className="loading-spinner" /></div>}
      {scanError && <div className="scan-error" role="alert">{scanError}</div>}
      {!entries.length && <div className="schedule-empty-state">{classes.length ? "No classes with valid days and times are in your schedule. Your timetable is ready below." : "Your weekly timetable is ready. Add a class to get started."}</div>}
      <div className="schedule-zoom-controls" aria-label="Schedule zoom controls">
        <button className="icon-button" aria-label="Zoom out" onClick={() => changeZoom(zoom - 0.15)}><ZoomOut size={17} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-button" aria-label="Zoom in" onClick={() => changeZoom(zoom + 0.15)}><ZoomIn size={17} /></button>
        <button className="secondary-button fit-button" onClick={fitSchedule}><Maximize2 size={15} /> Fit</button>
      </div>
      <div className="panel schedule-panel">
        <div className="schedule-scroll" onTouchStart={handlePinchStart} onTouchMove={handlePinchMove} onTouchEnd={() => { pinchStart.current = null; }}>
          <div className="schedule-grid">
            <div className="schedule-grid-header">
              <div className="schedule-time-heading">TIME</div>
              {SCHEDULE_DAYS.map((day) => (
                <div key={day} className={`schedule-day-heading${day === todayName ? " today-column" : ""}`}>
                  <strong>{day.slice(0, 3)}</strong>
                </div>
              ))}
            </div>
            <div className="schedule-grid-body">
              <div className="schedule-time-column" aria-hidden="true" style={{ height: `${hourCount * HOUR_HEIGHT * zoom}px`, "--hour-height": `${HOUR_HEIGHT * zoom}px` }}>
                {hours.map((hour, index) => (
                  <span key={hour} className={`schedule-time-label${index === hours.length - 1 ? " last-time-label" : ""}`} style={{ top: `${index * HOUR_HEIGHT * zoom}px` }}>
                    {formatClock(formatTime(hour === 24 * 60 ? 0 : hour))}
                  </span>
                ))}
              </div>
              {SCHEDULE_DAYS.map(renderDayColumn)}
            </div>
          </div>
        </div>
      </div>
      <p className="schedule-note">Classes repeat weekly. Pinch or use the controls to zoom; tap a class to edit or delete it.</p>
      {review && (
        <Modal title="Review scanned classes" onClose={() => { setReview(null); setOverlapsConfirmed(false); }} wide>
          <p className="scan-review-copy">Review, edit, remove, or add classes before confirming. Unreadable details are left blank rather than guessed.</p>
          <div className="scan-review-list">
            {review.classes.map((item, index) => {
              const invalid = invalidRows.includes(item);
              const overlap = classesOverlap(item, classes)
                || review.classes.slice(0, index).some((previous) => classesOverlap(item, [previous]));
              return (
                <article key={item.id} className={`scan-review-card${invalid ? " needs-review" : ""}`}>
                  <div className="scan-review-heading">
                    <strong>Class {index + 1}</strong>
                    <button className="icon-button delete-button" aria-label={`Remove scanned class ${index + 1}`} onClick={() => {
                      setOverlapsConfirmed(false);
                      setReview((current) => ({ ...current, classes: current.classes.filter((entry) => entry.id !== item.id) }));
                    }}><Trash2 size={16} /></button>
                  </div>
                  <div className="scan-review-fields">
                    <label className={!item.subject.trim() ? "uncertain-field" : ""}>Subject / code<input value={item.subject} onChange={(event) => updateReview(item.id, "subject", event.target.value)} placeholder="Required" /></label>
                    <label>Professor<input value={item.professor} onChange={(event) => updateReview(item.id, "professor", event.target.value)} placeholder="Optional" /></label>
                    <label className={!item.startTime ? "uncertain-field" : ""}>Start<input type="time" value={item.startTime} onChange={(event) => updateReview(item.id, "startTime", event.target.value)} /></label>
                    <label className={!item.endTime ? "uncertain-field" : ""}>End<input type="time" value={item.endTime} onChange={(event) => updateReview(item.id, "endTime", event.target.value)} /></label>
                    <label className={!item.room ? "uncertain-field" : ""}>Room / location<input value={item.room} onChange={(event) => updateReview(item.id, "room", event.target.value)} placeholder="Optional" /></label>
                    <label>Color<input className="scan-color-input" type="color" value={item.color || CLASS_COLORS[0]} onChange={(event) => updateReview(item.id, "color", event.target.value)} aria-label="Class color" /></label>
                  </div>
                  <fieldset className="review-days">
                    <legend className={!item.days.length ? "uncertain-field" : ""}>Days</legend>
                    {SCHEDULE_DAYS.map((day) => <label key={day}><input type="checkbox" checked={item.days.includes(day)} onChange={(event) => updateReview(item.id, "days", event.target.checked ? [...item.days, day] : item.days.filter((entry) => entry !== day))} />{day.slice(0, 3)}</label>)}
                  </fieldset>
                  {invalid && <p className="scan-row-warning"><AlertTriangle size={15} />Add a subject and at least one day, and check that the end time is after the start.</p>}
                  {overlap && <p className="scan-row-warning"><AlertTriangle size={15} />This class overlaps another class. Nothing will be overwritten; confirm again to add it anyway.</p>}
                </article>
              );
            })}
          </div>
          <button className="review-add" onClick={addReviewClass}><Plus size={16} /> Add another class</button>
          <div className="modal-actions scan-review-actions">
            <button type="button" className="secondary-button" onClick={() => { setReview(null); setOverlapsConfirmed(false); }}>Cancel</button>
            <button type="button" className="primary-button" disabled={!review.classes.length || invalidRows.length > 0} onClick={confirmImport}>
              {overlapRows.length && overlapsConfirmed ? `Add ${review.classes.length} classes anyway` : "Confirm and Add to Schedule"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
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
    professor: item?.professor || "",
    room: item?.room || "",
    days: item?.days || defaults?.days || ["Monday"],
    startTime: item?.startTime || defaults?.startTime || "09:00",
    endTime: item?.endTime || formatTime(Math.min(timeToMinutes(defaults?.startTime || "09:00") + 60, 23 * 60 + 59)),
    color: item?.color || CLASS_COLORS[0],
  });
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    if (!form.days.length) {
      setError("Choose at least one day for this class.");
      return;
    }
    if (timeToMinutes(form.startTime) === null || timeToMinutes(form.endTime) === null || form.startTime >= form.endTime) {
      setError("Choose a valid start and end time, with the end after the start.");
      return;
    }
    onSave({ ...form, subject: form.subject.trim(), professor: form.professor.trim(), room: form.room.trim() });
    onClose();
  }
  return (
    <Modal title={item ? "Edit class" : "Add a class"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>Subject name or code<input autoFocus required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="e.g. Data Structures" /></label>
        <label>Room or location<input value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} placeholder="e.g. Science Hall 204" /></label>
        <label>Professor’s name<input value={form.professor} onChange={(event) => setForm({ ...form, professor: event.target.value })} placeholder="e.g. Prof. Lee" /></label>
        <fieldset className="class-days-field">
          <legend>Days</legend>
          <div className="class-day-options">{SCHEDULE_DAYS.map((day) => (
            <label key={day}><input type="checkbox" checked={form.days.includes(day)} onChange={(event) => setForm({
              ...form,
              days: event.target.checked ? [...form.days, day] : form.days.filter((entry) => entry !== day),
            })} />{day.slice(0, 3)}</label>
          ))}</div>
        </fieldset>
        <div className="form-row">
          <label>Start time<input type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
          <label>End time<input type="time" required value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
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
