import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlignCenter, AlignLeft, AlignRight, AlertTriangle, Bold, CalendarDays, Camera, Check,
  ChevronLeft, ChevronRight, Clock3, Eraser, FileText, Heading1, Heading2, House,
  Italic, List, ListChecks, ListOrdered, Pencil, Plus, Redo2, ScanLine, Search,
  Settings, Strikethrough, Trash2, Underline, Undo2, Upload, X,
} from "lucide-react";
import { extractScannedClasses, preprocessScheduleImage, wordsFromOcrResult } from "./scheduleScanner.js";
import "./styles.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SCHEDULE_DAYS = DAYS;
const CLASS_COLORS = ["#3787f5", "#28b8ad", "#71839b", "#596fea", "#50a3d8"];
const SCHEDULE_START = 7 * 60;
const SCHEDULE_END = 20 * 60;
const HOUR_HEIGHT = 64;
const NAV_ITEMS = [
  { id: "home", label: "Home", icon: House },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "schedule", label: "Class Schedule", icon: Clock3 },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "settings", label: "Settings", icon: Settings },
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
      .map((item) => ({ item, start: timeToMinutes(item.start), end: timeToMinutes(item.end) }))
      .filter(({ item, start, end }) => (
        item.day === day && start !== null && end !== null && start < end
        && start < SCHEDULE_END && end > SCHEDULE_START
      ))
      .map(({ item, start, end }) => ({
        item,
        start: Math.max(start, SCHEDULE_START),
        end: Math.min(end, SCHEDULE_END),
      }))
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

function isDuplicateClass(candidate, existing) {
  const subject = (candidate.subject || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return existing.some((item) => (
    item.day === candidate.day
    && (item.subject || "").toLowerCase().replace(/[^a-z0-9]/g, "") === subject
    && item.start === candidate.start
    && item.end === candidate.end
  ));
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
  const [tab, setTab] = useState("home");
  const [tasks, setTasks] = useState(() => readStored("orbit_tasks"));
  const [classes, setClasses] = useState(() => readStored("orbit_classes"));
  const [notes, setNotes] = useState(() => readStored("orbit_notes").map(normalizeNote));
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
      localStorage.removeItem("orbit_gemini_api_key");
      localStorage.removeItem("orbit_schedule_zoom");
    } catch (error) {
      console.warn("Could not remove legacy schedule settings from local storage.", error);
    }
  }, []);

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

  function importScannedClasses(imported) {
    const duplicates = imported.filter((item) => isDuplicateClass(item, classes));
    if (duplicates.length) {
      setNotice(`${duplicates.length} possible duplicate${duplicates.length === 1 ? "" : "s"} kept; nothing was overwritten.`);
    }
    setClasses((current) => [...current, ...imported.map((item) => ({ ...item, id: newId() }))]);
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
        item && typeof item.subject === "string" && SCHEDULE_DAYS.includes(item.day)
      )).map((item) => ({ ...item, id: newId() }));
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
        <nav className="top-tabs" aria-label="Planner pages">
          {NAV_ITEMS.map(({ id, label }) => (
            <button key={id} className={(tab === id || (tab === "notes" && id === "home")) ? "tab active" : "tab"} aria-current={(tab === id || (tab === "notes" && id === "home")) ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <div className="today-label"><span className="today-indicator" />{dateLabel(today, { weekday: "short", month: "short", day: "numeric" })}</div>
      </header>

      <main className="main-content">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>}
        {tab === "home" ? (
          <HomePage
            today={today}
            tasks={tasks}
            classes={classes}
            onNavigate={setTab}
            onAddTask={() => setTaskComposerDate(today)}
            onEditTask={editTask}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
            onEditClass={setEditingClass}
            noteCount={notes.length}
          />
        ) : tab === "calendar" ? (
          <CalendarPage
            month={month}
            setMonth={setMonth}
            today={today}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            tasks={tasks}
            onToggleTask={toggleTask}
            onEditTask={editTask}
            onDeleteTask={deleteTask}
            onAddForDate={(date) => setTaskComposerDate(date)}
            hintVisible={calendarHintVisible}
            onDismissHint={dismissCalendarHint}
          />
        ) : tab === "schedule" ? (
          <SchedulePage
            classes={classes}
            today={today}
            onAdd={openClass}
            onEdit={setEditingClass}
            onImport={importScannedClasses}
          />
        ) : tab === "tasks" ? (
          <TasksPage
            tasks={tasks}
            onAdd={() => setTaskComposerDate(today)}
            onEdit={editTask}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        ) : tab === "notes" ? (
          <NotesPage notes={notes} setNotes={setNotes} onBack={() => setTab("home")} />
        ) : (
          <SettingsPage
            backupInput={backupInput}
            onExport={exportBackup}
            onImport={(file) => importBackup(file)}
          />
        )}
      </main>

      <nav className="bottom-tabs" aria-label="Planner pages">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={(tab === id || (tab === "notes" && id === "home")) ? "bottom-tab active" : "bottom-tab"} aria-current={(tab === id || (tab === "notes" && id === "home")) ? "page" : undefined} onClick={() => setTab(id)}>
            <Icon size={19} /><span>{label === "Class Schedule" ? "Classes" : label}</span>
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

function NotesPage({ notes, setNotes, onBack }) {
  const [selectedId, setSelectedId] = useState(notes[0]?.id || "");
  const [search, setSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved");
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  const pendingSave = useRef(null);
  const selectedNote = notes.find((note) => note.id === selectedId) || null;
  const visibleNotes = notes.filter((note) => (
    `${note.title} ${notePlainText(note.content)}`.toLowerCase().includes(search.trim().toLowerCase())
  )).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    if (selectedNote && editorRef.current) {
      editorRef.current.innerHTML = sanitizeNoteHtml(selectedNote.content);
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
    const remaining = notes.filter((note) => note.id !== selectedNote.id);
    setNotes(remaining);
    setSelectedId(remaining[0]?.id || "");
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
          <p className="eyebrow">YOUR STUDY SPACE</p>
          <h1>Notes</h1>
          <p className="page-subtitle">Write, format, and keep your study notes on this device.</p>
        </div>
        <div className="notes-heading-actions">
          <button className="secondary-button" onClick={onBack}><ChevronLeft size={16} /> Home</button>
          <button className="primary-button" onClick={createNote}><Plus size={17} /> New note</button>
        </div>
      </div>
      <div className="notes-layout">
        <aside className="panel notes-list-panel" aria-label="Saved notes">
          <label className="notes-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" aria-label="Search notes" /></label>
          <div className="notes-list">
            {visibleNotes.length ? visibleNotes.map((note) => (
              <button key={note.id} className={`note-list-item${note.id === selectedId ? " selected" : ""}`} onClick={() => setSelectedId(note.id)}>
                <strong>{note.title || "Untitled note"}</strong>
                <span>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                <small>{notePlainText(note.content).trim().slice(0, 90) || "No text yet"}</small>
              </button>
            )) : <p className="notes-empty-list">{search ? "No notes match your search." : "Your saved notes will appear here."}</p>}
          </div>
        </aside>
        <section className="panel note-editor-panel" aria-label="Note editor">
          {selectedNote ? (
            <>
              <div className="note-editor-heading">
                <input className="note-title-input" value={selectedNote.title} onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })} aria-label="Note title" placeholder="Untitled note" />
                <div className="note-save-actions"><span role="status">{saveStatus}</span><button className="icon-button delete-button" onClick={deleteNote} aria-label="Delete note"><Trash2 size={17} /></button></div>
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
                onInput={() => editorRef.current && saveEditor(selectedNote.id, editorRef.current.innerHTML)}
                onBlur={() => editorRef.current && saveEditor(selectedNote.id, editorRef.current.innerHTML, true)}
                onPaste={pasteSanitized}
                onClick={toggleChecklistItem}
              />
            </>
          ) : (
            <div className="notes-empty-editor"><FileText size={28} /><h2>{search ? "No matching note" : "Start a study note"}</h2><p>{search ? "Try another search or clear the search field." : "Create a note for class summaries, ideas, and revision."}</p>{!search && <button className="primary-button" onClick={createNote}><Plus size={17} /> Create a note</button>}</div>
          )}
        </section>
      </div>
    </section>
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

function SchedulePage({ classes, today, onAdd, onEdit, onImport }) {
  const todayName = DAYS[(new Date(`${today}T12:00:00`).getDay() + 6) % 7];
  const entries = scheduleEntries(classes);
  const hours = Array.from({ length: 14 }, (_, index) => SCHEDULE_START + index * 60);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [scanError, setScanError] = useState("");
  const [review, setReview] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [duplicatesConfirmed, setDuplicatesConfirmed] = useState(false);
  const invalidRows = review?.classes.filter((item) => (
    !item.subject.trim()
    || !SCHEDULE_DAYS.includes(item.day)
    || timeToMinutes(item.start) === null
    || timeToMinutes(item.end) === null
    || item.start < "07:00"
    || item.end > "20:00"
    || item.start >= item.end
  )) || [];
  const duplicateRows = review?.classes.filter((candidate, index, list) => (
    isDuplicateClass(candidate, classes)
    || list.slice(0, index).some((previous) => isDuplicateClass(candidate, [previous]))
  )) || [];

  function addAtTime(event, day) {
    if (event.target.closest(".class-card")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const minutes = Math.floor(offset / HOUR_HEIGHT * 2) * 30;
    onAdd(day, formatTime(Math.min(SCHEDULE_END - 30, SCHEDULE_START + minutes)));
  }

  async function scanSchedule(file) {
    setScanError("");
    setReview(null);
    setOcrText("");
    setDuplicatesConfirmed(false);
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
      setScanError("Choose a JPG, JPEG, or PNG image.");
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

    let worker;
    setOcrProgress({ status: "Preparing your image…", progress: 0 });
    try {
      const image = await preprocessScheduleImage(file);
      setOcrProgress({ status: "Loading the on-device text recognizer…", progress: 0 });
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        workerPath: `${import.meta.env.BASE_URL}ocr/worker.min.js`,
        corePath: `${import.meta.env.BASE_URL}ocr/tesseract-core-lstm.wasm.js`,
        langPath: `${import.meta.env.BASE_URL}ocr/tessdata`,
        gzip: true,
        logger: (message) => setOcrProgress({
          status: message.status === "recognizing text" ? "Reading your schedule…" : "Preparing the on-device text recognizer…",
          progress: Number.isFinite(message.progress) ? message.progress : 0,
        }),
      });
      const { data } = await worker.recognize(image, {}, { blocks: true });
      const recognizedText = data.text || "";
      const extracted = extractScannedClasses(recognizedText, wordsFromOcrResult(data));
      setOcrText(recognizedText);
      setReview({
        classes: extracted.length ? extracted : [{
          id: newId(),
          subject: "",
          instructor: "",
          room: "",
          day: "",
          start: "",
          end: "",
          color: CLASS_COLORS[0],
          uncertain: ["subject", "day", "start time", "end time", "location"],
        }],
      });
      if (!recognizedText.trim()) {
        setScanError("No readable text was found. Try a sharper, brighter image or enter the classes manually.");
      } else if (!extracted.length) {
        setScanError("Text was recognized, but no complete class time ranges were found. Review the extracted text and add classes manually.");
      }
    } catch (error) {
      console.error("Could not scan this schedule image.", error);
      setScanError(error instanceof Error
        ? `The schedule could not be read: ${error.message}`
        : "The schedule could not be read. You can still add classes manually.");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.error("Could not stop the on-device OCR worker.", error);
        }
      }
      setOcrProgress(null);
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  function updateReview(id, key, value) {
    const uncertaintyByField = {
      subject: "subject",
      day: "day",
      start: "start time",
      end: "end time",
      room: "location",
    };
    setReview((current) => ({
      ...current,
      classes: current.classes.map((item) => item.id === id ? {
        ...item,
        [key]: value,
        uncertain: item.uncertain?.filter((field) => field !== uncertaintyByField[key]),
      } : item),
    }));
  }

  function addReviewClass() {
    setReview((current) => ({
      ...current,
      classes: [...current.classes, {
        id: newId(),
        subject: "",
        instructor: "",
        room: "",
        day: "Monday",
        start: "09:00",
        end: "10:00",
        color: CLASS_COLORS[current.classes.length % CLASS_COLORS.length],
        uncertain: ["subject", "day", "start time", "end time"],
      }],
    }));
  }

  function confirmImport() {
    if (!review?.classes.length || invalidRows.length) return;
    if (duplicateRows.length && !duplicatesConfirmed) {
      setDuplicatesConfirmed(true);
      return;
    }
    onImport(review.classes.map(({ uncertain, ...item }) => item));
    setReview(null);
    setDuplicatesConfirmed(false);
  }

  const renderDayColumn = (day) => (
    <div
      key={day}
      className={`schedule-day-column${day === todayName ? " today-column" : ""}`}
      onClick={(event) => addAtTime(event, day)}
      aria-label={`${day} schedule. Tap an empty time to add a class.`}
    >
      {entries.filter((entry) => entry.day === day).map((entry) => (
        <button
          key={entry.item.id}
          type="button"
          className="class-card"
          style={{
            "--class-accent": entry.item.color || CLASS_COLORS[0],
            top: `${((entry.start - SCHEDULE_START) / 60) * HOUR_HEIGHT}px`,
            height: `${((entry.end - entry.start) / 60) * HOUR_HEIGHT}px`,
            left: `calc(${(entry.lane / entry.laneCount) * 100}% + 3px)`,
            width: `calc(${100 / entry.laneCount}% - 6px)`,
          }}
          onClick={() => onEdit(entry.item)}
          aria-label={`${entry.item.subject}, ${day}, ${formatClock(entry.item.start)} to ${formatClock(entry.item.end)}, ${entry.item.room || "location not listed"}. Tap to view, edit, or delete.`}
          title={`${entry.item.subject} | ${formatClock(entry.item.start)}-${formatClock(entry.item.end)} | ${entry.item.room || "Location not listed"}`}
        >
          <strong>{entry.item.subject}</strong>
          <span>{formatClock(entry.item.start)}-{formatClock(entry.item.end)} · {entry.item.room || "Location not listed"}</span>
        </button>
      ))}
    </div>
  );

  return (
    <section className="page schedule-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPEATS EVERY WEEK</p>
          <h1>Class schedule</h1>
          <p className="page-subtitle">Your weekly timetable, with every class in its place.</p>
        </div>
        <div className="schedule-actions">
          <input ref={fileInput} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(event) => scanSchedule(event.target.files?.[0])} />
          <input ref={cameraInput} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" capture="environment" onChange={(event) => scanSchedule(event.target.files?.[0])} />
          <button className="secondary-button scan-button" onClick={() => fileInput.current?.click()} disabled={Boolean(ocrProgress)}><ScanLine size={17} /> Scan schedule</button>
          <button className="secondary-button camera-button" onClick={() => cameraInput.current?.click()} disabled={Boolean(ocrProgress)}><Camera size={17} /> Take photo</button>
          <button className="primary-button" onClick={() => onAdd(SCHEDULE_DAYS.includes(todayName) ? todayName : "Monday", "09:00")}><Plus size={17} /> Add class</button>
        </div>
      </div>
      <p className="scanner-privacy">Images are read on this device. Nothing is uploaded.</p>
      {ocrProgress && (
        <div className="scan-progress" role="status" aria-live="polite">
          <span>{ocrProgress.status}</span><progress max="1" value={ocrProgress.progress} />
        </div>
      )}
      {scanError && <div className="scan-error" role="alert">{scanError}</div>}
      {classes.length === 0 && <div className="schedule-empty-state">Add a class or tap a time in the grid to start planning your week.</div>}
      <div className="panel schedule-panel">
        <div className="schedule-scroll">
          <div className="schedule-grid">
            <div className="schedule-grid-header">
              <div className="schedule-time-heading">TIME</div>
              {SCHEDULE_DAYS.map((day) => (
                <div key={day} className={`schedule-day-heading${day === todayName ? " today-column" : ""}`}>
                  <span>{day.slice(0, 3)}</span><strong>{day}</strong>
                </div>
              ))}
            </div>
            <div className="schedule-grid-body">
              <div className="schedule-time-column" aria-hidden="true">
                {hours.map((hour, index) => (
                  <span key={hour} className={`schedule-time-label${index === hours.length - 1 ? " last-time-label" : ""}`} style={{ top: `${index * HOUR_HEIGHT}px` }}>
                    {formatClock(formatTime(hour))}
                  </span>
                ))}
              </div>
              {SCHEDULE_DAYS.map(renderDayColumn)}
            </div>
          </div>
        </div>
      </div>
      <p className="schedule-note">Monday–Sunday are shown together; swipe horizontally on a small screen to see the full week. Tap a class to edit it or an empty time to add one.</p>
      {review && (
        <Modal title="Review scanned classes" onClose={() => { setReview(null); setDuplicatesConfirmed(false); }} wide>
          <p className="scan-review-copy">Review and correct everything before adding it. OCR can misread printed schedules; highlighted fields need your attention.</p>
          <div className="scan-review-list">
            {review.classes.map((item, index) => {
              const invalid = invalidRows.includes(item);
              const duplicate = isDuplicateClass(item, classes);
              return (
                <article key={item.id} className={`scan-review-card${invalid || item.uncertain?.length ? " needs-review" : ""}`}>
                  <div className="scan-review-heading">
                    <strong>Class {index + 1}</strong>
                    <button className="icon-button delete-button" aria-label={`Remove scanned class ${index + 1}`} onClick={() => setReview((current) => ({ ...current, classes: current.classes.filter((entry) => entry.id !== item.id) }))}><Trash2 size={16} /></button>
                  </div>
                  <div className="scan-review-fields">
                    <label className={!item.subject.trim() ? "uncertain-field" : ""}>Subject / code<input value={item.subject} onChange={(event) => updateReview(item.id, "subject", event.target.value)} placeholder="Required" /></label>
                    <label className={!SCHEDULE_DAYS.includes(item.day) ? "uncertain-field" : ""}>Day<select value={item.day} onChange={(event) => updateReview(item.id, "day", event.target.value)}><option value="">Choose day</option>{SCHEDULE_DAYS.map((day) => <option key={day}>{day}</option>)}</select></label>
                    <label className={!item.start || item.uncertain?.includes("start time") ? "uncertain-field" : ""}>Start<input type="time" value={item.start} onChange={(event) => updateReview(item.id, "start", event.target.value)} /></label>
                    <label className={!item.end || item.uncertain?.includes("end time") ? "uncertain-field" : ""}>End<input type="time" value={item.end} onChange={(event) => updateReview(item.id, "end", event.target.value)} /></label>
                    <label className={!item.room ? "uncertain-field" : ""}>Room / location<input value={item.room} onChange={(event) => updateReview(item.id, "room", event.target.value)} placeholder="Optional" /></label>
                    <label>Color<input className="scan-color-input" type="color" value={item.color || CLASS_COLORS[0]} onChange={(event) => updateReview(item.id, "color", event.target.value)} aria-label="Class color" /></label>
                  </div>
                  {invalid && <p className="scan-row-warning"><AlertTriangle size={15} />Add a subject and weekday, and check that the class time is valid (7:00 AM–8:00 PM).</p>}
                  {!invalid && item.uncertain?.length > 0 && <p className="scan-row-warning"><AlertTriangle size={15} />Please verify: {item.uncertain.join(", ")}.</p>}
                  {duplicate && <p className="scan-row-warning"><AlertTriangle size={15} />This looks like a class already in your schedule. It will only be added if you confirm below.</p>}
                </article>
              );
            })}
          </div>
          <button className="review-add" onClick={addReviewClass}><Plus size={16} /> Add another class</button>
          {ocrText && <details className="ocr-text-details"><summary>See recognized text</summary><pre>{ocrText}</pre></details>}
          <div className="modal-actions scan-review-actions">
            <button type="button" className="secondary-button" onClick={() => { setReview(null); setDuplicatesConfirmed(false); }}>Cancel</button>
            <button type="button" className="primary-button" disabled={!review.classes.length || invalidRows.length > 0} onClick={confirmImport}>
              {duplicateRows.length && duplicatesConfirmed ? `Add ${review.classes.length} classes anyway` : "Confirm and Add to Schedule"}
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
    instructor: item?.instructor || "",
    room: item?.room || "",
    day: SCHEDULE_DAYS.includes(item?.day) ? item.day : defaults?.day || "Monday",
    start: item?.start || defaults?.start || "09:00",
    end: item?.end || formatTime(Math.min(timeToMinutes(defaults?.start || "09:00") + 60, SCHEDULE_END)),
    color: item?.color || CLASS_COLORS[0],
  });
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    if (form.start < "07:00" || form.end > "20:00" || form.start >= form.end) {
      setError("Choose a valid time between 7:00 AM and 8:00 PM, with the end after the start.");
      return;
    }
    onSave({ ...form, subject: form.subject.trim(), instructor: form.instructor.trim(), room: form.room.trim() });
    onClose();
  }
  return (
    <Modal title={item ? "Edit class" : "Add a class"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>Subject name or code<input autoFocus required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="e.g. Data Structures" /></label>
        <label>Room or location<input value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} placeholder="e.g. Science Hall 204" /></label>
        <label>Instructor (optional)<input value={form.instructor} onChange={(event) => setForm({ ...form, instructor: event.target.value })} placeholder="e.g. Prof. Lee" /></label>
        <label>Day<select value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })}>{SCHEDULE_DAYS.map((day) => <option key={day}>{day}</option>)}</select></label>
        <div className="form-row">
          <label>Start time<input type="time" required min="07:00" max="19:59" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label>
          <label>End time<input type="time" required min="07:01" max="20:00" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label>
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
