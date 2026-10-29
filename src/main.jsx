import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Plus, Trash2, X,
} from "lucide-react";
import "./styles.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CLASS_COLORS = ["#3b82f6", "#22d3ee", "#a78bfa", "#34d399", "#f59e0b", "#f472b6"];
const SCHEDULE_SLOTS = Array.from({ length: 30 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function App() {
  const [tab, setTab] = useState("calendar");
  const [tasks, setTasks] = useState(() => readStored("orbit_tasks"));
  const [classes, setClasses] = useState(() => readStored("orbit_classes"));
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [quickTitle, setQuickTitle] = useState("");
  const [quickMore, setQuickMore] = useState(false);
  const [quickDetails, setQuickDetails] = useState({ time: "", subject: "", priority: "Medium" });
  const [editingTask, setEditingTask] = useState(null);
  const [editingClass, setEditingClass] = useState(null);
  const [classDefaults, setClassDefaults] = useState(null);
  const [notice, setNotice] = useState("");

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
    setQuickTitle("");
    setQuickDetails({ time: "", subject: "", priority: "Medium" });
    setQuickMore(false);
  }, [selectedDate]);

  const today = localDate();
  const selectedTasks = tasks
    .filter((task) => task.due === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  function addTask(event) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setTasks((current) => [...current, {
      id: newId(),
      title,
      due: selectedDate,
      time: quickMore ? quickDetails.time : "",
      course: quickMore ? quickDetails.subject.trim() : "",
      priority: quickMore ? quickDetails.priority : "Medium",
      done: false,
    }]);
    setQuickTitle("");
    setQuickDetails({ time: "", subject: "", priority: "Medium" });
    setNotice("Task added.");
  }

  function saveTask(task) {
    setTasks((current) => editingTask
      ? current.map((item) => item.id === editingTask.id ? { ...task, id: editingTask.id } : item)
      : [...current, { ...task, id: newId(), done: false }]);
    setEditingTask(null);
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Orbit planner home">
          <span className="brand-mark"><CalendarDays size={20} /></span>
          <span>orbit<span className="brand-period">.</span></span>
        </a>
        <nav className="tabs" aria-label="Planner pages">
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
            selectedTasks={selectedTasks}
            quickTitle={quickTitle}
            setQuickTitle={setQuickTitle}
            quickMore={quickMore}
            setQuickMore={setQuickMore}
            quickDetails={quickDetails}
            setQuickDetails={setQuickDetails}
            onAddTask={addTask}
            onToggleTask={(id) => setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task))}
            onEditTask={setEditingTask}
            onDeleteTask={(id) => setTasks((current) => current.filter((task) => task.id !== id))}
          />
        ) : (
          <SchedulePage
            classes={classes}
            today={today}
            onAdd={openClass}
            onEdit={setEditingClass}
          />
        )}
      </main>

      {editingTask && (
        <TaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={saveTask}
          onDelete={() => {
            setTasks((current) => current.filter((task) => task.id !== editingTask.id));
            setEditingTask(null);
          }}
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
  month, setMonth, today, selectedDate, setSelectedDate, tasks, selectedTasks,
  quickTitle, setQuickTitle, quickMore, setQuickMore, quickDetails, setQuickDetails,
  onAddTask, onToggleTask, onEditTask, onDeleteTask,
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? day : null;
  });

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
        <section className="panel calendar-panel" aria-label="Monthly calendar">
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
                  className={`calendar-day${!day ? " empty-day" : ""}${value === today ? " is-today" : ""}${value === selectedDate ? " is-selected" : ""}`}
                  onClick={() => day && setSelectedDate(value)}
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
        </section>

        <section className="panel day-panel" aria-label={`Tasks for ${dateLabel(selectedDate)}`}>
          <div className="day-heading">
            <div>
              <p className="eyebrow">{selectedDate === today ? "TODAY" : "SELECTED DAY"}</p>
              <h2>{dateLabel(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h2>
            </div>
            <span className="task-count">{selectedTasks.length}</span>
          </div>
          <form className="quick-add" onSubmit={onAddTask}>
            <div className="quick-add-row">
              <input
                autoComplete="off"
                aria-label="Task title"
                placeholder="Add a task..."
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
              />
              <button className="add-button" type="submit" disabled={!quickTitle.trim()} aria-label="Add task"><Plus size={19} /></button>
            </div>
            {quickMore && (
              <div className="quick-details">
                <label>Time<input type="time" value={quickDetails.time} onChange={(event) => setQuickDetails({ ...quickDetails, time: event.target.value })} /></label>
                <label>Subject<input value={quickDetails.subject} onChange={(event) => setQuickDetails({ ...quickDetails, subject: event.target.value })} placeholder="Optional" /></label>
                <label>Priority<select value={quickDetails.priority} onChange={(event) => setQuickDetails({ ...quickDetails, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label>
              </div>
            )}
            <button type="button" className="more-button" onClick={() => setQuickMore((value) => !value)}>
              {quickMore ? "− Fewer details" : "+ More details"}
            </button>
          </form>

          <div className="task-list-heading"><h3>Tasks</h3><span>{selectedTasks.length} {selectedTasks.length === 1 ? "task" : "tasks"}</span></div>
          {selectedTasks.length ? (
            <ul className="task-list">
              {selectedTasks.map((task) => (
                <li className={`task-item${task.done ? " is-complete" : ""}`} key={task.id}>
                  <button className={`task-check${task.done ? " checked" : ""}`} aria-label={task.done ? "Mark task incomplete" : "Mark task complete"} onClick={() => onToggleTask(task.id)}>
                    {task.done && <Check size={14} />}
                  </button>
                  <button className="task-content" onClick={() => onEditTask(task)}>
                    <span className="task-title">{task.title}</span>
                    <span className="task-meta">
                      {task.time && <><Clock3 size={12} />{task.time}</>}
                      {task.course && <span>{task.time ? " · " : ""}{task.course}</span>}
                    </span>
                  </button>
                  <button className="icon-button delete-button" aria-label={`Delete ${task.title}`} onClick={() => onDeleteTask(task.id)}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-tasks"><span className="empty-icon"><CalendarDays size={20} /></span><strong>Nothing planned yet</strong><p>Add a task above to get started.</p></div>
          )}
        </section>
      </div>
    </section>
  );
}

function SchedulePage({ classes, today, onAdd, onEdit }) {
  const todayName = DAYS[(new Date(`${today}T12:00:00`).getDay() + 6) % 7];
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPEATS EVERY WEEK</p>
          <h1>Class schedule</h1>
          <p className="page-subtitle">Your weekly timetable, with every class in its place.</p>
        </div>
        <button className="primary-button" onClick={() => onAdd(todayName, "09:00")}><Plus size={17} /> Add class</button>
      </div>
      <div className="panel schedule-panel">
        <div className="schedule-scroll">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="time-column">Time</th>
                {DAYS.map((day) => <th key={day} className={day === todayName ? "today-column" : ""}>{day.slice(0, 3)}<span>{day}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_SLOTS.map((time) => (
                <tr key={time}>
                  <th className="time-column">{time}</th>
                  {DAYS.map((day) => {
                    const entries = classes.filter((item) => item.day === day && item.start >= time && item.start < nextSlot(time));
                    return (
                      <td key={`${day}-${time}`} className={day === todayName ? "today-column" : ""}>
                        {entries.length ? entries.map((item) => (
                          <button
                            key={item.id}
                            className="class-card"
                            style={{ "--class-accent": item.color || "var(--accent)" }}
                            onClick={() => onEdit(item)}
                            aria-label={`Edit ${item.subject}, ${item.instructor}, ${item.room}`}
                          >
                            <strong>{item.subject}</strong>
                            <span>{item.instructor}</span>
                            <small>{item.room} · {item.start}–{item.end}</small>
                          </button>
                        )) : (
                          <button className="empty-slot" onClick={() => onAdd(day, time)} aria-label={`Add class on ${day} at ${time}`}><Plus size={14} /></button>
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
      <p className="schedule-note">Select an empty time slot to add a class. Select a class to edit or delete it.</p>
    </section>
  );
}

function nextSlot(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = hours * 60 + minutes + 30;
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}

function TaskModal({ task, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: task.title,
    due: task.due,
    time: task.time || "",
    course: task.course || "",
    priority: task.priority || "Medium",
  });
  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...task, ...form, title: form.title.trim(), course: form.course.trim() });
    onClose();
  }
  return (
    <Modal title="Edit task" onClose={onClose}>
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
          <button type="submit" className="primary-button">Save task</button>
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

function Modal({ title, onClose, children }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {children}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
