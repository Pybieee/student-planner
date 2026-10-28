import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, Bell, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Circle, Clock3, Code2, GraduationCap, LayoutDashboard, ListTodo, Plus, Search,
  Settings2, Trash2, X, Zap, BookOpen, CalendarClock, Menu
} from "lucide-react";
import "./styles.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SUBJECT_COLORS = ["#8b7cff", "#31c7c5", "#f5a45d", "#ed78b5", "#6fa7ff", "#b0d56e"];
const starterTasks = [
  { id: 1, title: "Finish discrete math problem set", course: "Discrete Mathematics", due: dateOffset(0), time: "17:00", priority: "High", type: "Assignment", done: false, reminder: true },
  { id: 2, title: "Review data structures notes", course: "Data Structures", due: dateOffset(1), time: "20:00", priority: "Medium", type: "Study", done: false, reminder: false },
  { id: 3, title: "Prepare UI wireframe", course: "Human Computer Interaction", due: dateOffset(2), time: "15:30", priority: "High", type: "Project", done: false, reminder: true },
  { id: 4, title: "Read chapter 4", course: "Purposive Communication", due: dateOffset(3), time: "09:00", priority: "Low", type: "Reading", done: true, reminder: false },
];
function dateOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function prettyDate(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "No date";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
}
function uid() { return Date.now() + Math.floor(Math.random()*1000); }

const starterClasses = [
  { id: 101, day: "Monday", start: "08:00", end: "09:30", subject: "Discrete Mathematics", code: "MATH 211", room: "Lab 2", instructor: "Prof. Reyes", color: SUBJECT_COLORS[0] },
  { id: 102, day: "Monday", start: "10:00", end: "11:30", subject: "Data Structures", code: "CS 221", room: "Room 304", instructor: "Prof. Santos", color: SUBJECT_COLORS[1] },
  { id: 103, day: "Tuesday", start: "09:00", end: "10:30", subject: "Human Computer Interaction", code: "IT 214", room: "Lab 1", instructor: "Prof. Cruz", color: SUBJECT_COLORS[2] },
  { id: 104, day: "Wednesday", start: "08:00", end: "09:30", subject: "Discrete Mathematics", code: "MATH 211", room: "Room 205", instructor: "Prof. Reyes", color: SUBJECT_COLORS[0] },
  { id: 105, day: "Thursday", start: "13:00", end: "14:30", subject: "Data Structures", code: "CS 221", room: "Room 304", instructor: "Prof. Santos", color: SUBJECT_COLORS[1] },
  { id: 106, day: "Friday", start: "10:00", end: "11:30", subject: "Purposive Communication", code: "GE 105", room: "Room 202", instructor: "Prof. Dela Cruz", color: SUBJECT_COLORS[3] },
];

function App() {
  const [tab, setTab] = useState("overview");
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("orbit_tasks")) || starterTasks; } catch { return starterTasks; }
  });
  const [classes, setClasses] = useState(() => {
    try { return JSON.parse(localStorage.getItem("orbit_classes")) || starterClasses; } catch { return starterClasses; }
  });
  const [selectedDate, setSelectedDate] = useState(dateOffset(0));
  const [month, setMonth] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [taskModal, setTaskModal] = useState(false);
  const [classModal, setClassModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editingClass, setEditingClass] = useState(null);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => localStorage.setItem("orbit_tasks", JSON.stringify(tasks)), [tasks]);
  useEffect(() => localStorage.setItem("orbit_classes", JSON.stringify(classes)), [classes]);
  useEffect(() => {
    if (!("Notification" in window)) return;
    const timers = [];
    tasks.filter(t => !t.done && t.reminder && t.due && t.time).forEach(t => {
      const at = new Date(`${t.due}T${t.time}:00`).getTime();
      const delay = at - Date.now();
      if (delay > 0 && delay < 2147483647) {
        timers.push(setTimeout(() => {
          if (Notification.permission === "granted") new Notification("Orbit reminder", { body: `${t.title} is due now.` });
          else setNotice(`Reminder: ${t.title} is due now.`);
        }, delay));
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [tasks]);

  const today = dateOffset(0);
  const completed = tasks.filter(t => t.done).length;
  const pending = tasks.filter(t => !t.done);
  const dueSoon = pending.filter(t => t.due >= today).sort((a,b) => `${a.due}${a.time}`.localeCompare(`${b.due}${b.time}`)).slice(0,4);
  const filteredTasks = tasks.filter(t => {
    const matchesQuery = `${t.title} ${t.course} ${t.type}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "All" || (filter === "Completed" ? t.done : filter === "Pending" ? !t.done : t.priority === filter);
    return matchesQuery && matchesFilter;
  }).sort((a,b) => `${a.due}${a.time}`.localeCompare(`${b.due}${b.time}`));
  const selectedTasks = tasks.filter(t => t.due === selectedDate);
  const selectedClasses = classes.filter(c => c.day === DAYS[(new Date(`${selectedDate}T12:00:00`).getDay()+6)%7]).sort((a,b) => a.start.localeCompare(b.start));

  function toggleTask(id) { setTasks(old => old.map(t => t.id === id ? {...t, done: !t.done} : t)); }
  function saveTask(data) {
    if (editingTask) setTasks(old => old.map(t => t.id === editingTask.id ? {...data, id: editingTask.id} : t));
    else setTasks(old => [...old, {...data, id: uid(), done: false}]);
    setTaskModal(false); setEditingTask(null); setNotice("Task saved successfully.");
  }
  function saveClass(data) {
    if (editingClass) setClasses(old => old.map(c => c.id === editingClass.id ? {...data, id: editingClass.id} : c));
    else setClasses(old => [...old, {...data, id: uid()}]);
    setClassModal(false); setEditingClass(null); setNotice("Class schedule saved.");
  }
  function deleteTask(id) { setTasks(old => old.filter(t => t.id !== id)); }
  function deleteClass(id) { setClasses(old => old.filter(c => c.id !== id)); }
  function openNewTask() { setEditingTask(null); setTaskModal(true); }
  function openNewClass() { setEditingClass(null); setClassModal(true); }
  async function enableReminders() {
    if (!("Notification" in window)) { setNotice("Browser notifications are not supported here."); return; }
    const result = await Notification.requestPermission();
    setNotice(result === "granted" ? "Browser reminders enabled. Keep the app open for scheduled reminders." : "Notifications were not enabled. You can still see reminders in the app.");
  }

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "tasks", label: "Tasks & deadlines", icon: ListTodo, count: pending.length },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "schedule", label: "Class schedule", icon: Code2 },
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-icon"><Activity size={21}/></div><div><strong>orbit<span>.</span></strong><small>STUDENT WORKSPACE</small></div><button className="icon-btn mobile-close" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{navItems.map(item => <button key={item.id} className={`nav-item ${tab===item.id?"active":""}`} onClick={() => {setTab(item.id);setMobileNav(false);}}><item.icon size={18}/><span>{item.label}</span>{item.count !== undefined && <em>{item.count}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-orb"><Zap size={17}/></div><strong>Make room to focus.</strong><p>Your semester, organized in one place.</p><div className="mini-progress"><span style={{width:`${tasks.length ? completed/tasks.length*100 : 0}%`}}/></div><small>{completed} of {tasks.length} tasks completed</small></div><button className="nav-item settings" onClick={enableReminders}><Settings2 size={18}/><span>Reminder settings</span></button><div className="profile"><div className="avatar">ST</div><div><strong>Student account</strong><small>Personal workspace</small></div><span className="online-dot"/></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn menu-toggle" onClick={() => setMobileNav(true)}><Menu size={20}/></button><span className="breadcrumb">Workspace</span><ChevronRight size={14}/><strong>{navItems.find(n=>n.id===tab)?.label}</strong></div><div className="topbar-actions"><div className="date-chip"><span className="live-dot"/>{new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</div><button className="icon-btn notification-btn" title="Enable browser reminders" onClick={enableReminders}><Bell size={18}/><i/></button><button className="add-task-btn" onClick={openNewTask}><Plus size={17}/> <span>New task</span></button></div></header>

      <div className="page-content">
        {notice && <div className="notice"><CheckCircle2 size={16}/><span>{notice}</span><button onClick={()=>setNotice("")}><X size={15}/></button></div>}
        {tab==="overview" && <Overview tasks={tasks} pending={pending} completed={completed} dueSoon={dueSoon} classes={classes} setTab={setTab} toggleTask={toggleTask} openNewTask={openNewTask} setEditingTask={setEditingTask} setTaskModal={setTaskModal}/>}
        {tab==="tasks" && <TasksPage tasks={filteredTasks} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} toggleTask={toggleTask} deleteTask={deleteTask} editTask={t=>{setEditingTask(t);setTaskModal(true)}} openNewTask={openNewTask}/>}
        {tab==="calendar" && <CalendarPage month={month} setMonth={setMonth} selectedDate={selectedDate} setSelectedDate={setSelectedDate} tasks={tasks} classes={classes} toggleTask={toggleTask} openNewTask={openNewTask} editTask={t=>{setEditingTask(t);setTaskModal(true)}}/>}
        {tab==="schedule" && <SchedulePage classes={classes} onAdd={openNewClass} onEdit={c=>{setEditingClass(c);setClassModal(true)}} onDelete={deleteClass}/>}
      </div>
      <footer className="footer"><span>ORBIT STUDENT WORKSPACE</span><span><span className="footer-dot"/> Your progress is saved on this device</span></footer>
    </main>
    {taskModal && <TaskModal task={editingTask} onClose={()=>{setTaskModal(false);setEditingTask(null)}} onSave={saveTask}/>}
    {classModal && <ClassModal item={editingClass} classes={classes} onClose={()=>{setClassModal(false);setEditingClass(null)}} onSave={saveClass}/>}
  </div>;
}

function PageHeading({eyebrow, title, subtitle, action}) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function Overview({tasks,pending,completed,dueSoon,classes,setTab,toggleTask,openNewTask,setEditingTask,setTaskModal}) {
  const progress = tasks.length ? Math.round(completed/tasks.length*100) : 0;
  return <>
    <PageHeading eyebrow="YOUR ACADEMIC COMMAND CENTER" title={<>Stay in your <span className="gradient-text">flow.</span></>} subtitle="A little structure goes a long way. Here's your day at a glance." action={<button className="secondary-btn" onClick={()=>setTab("calendar")}><CalendarDays size={16}/> Open calendar</button>}/>
    <div className="welcome-banner"><div className="banner-copy"><div className="banner-tag"><span/> YOUR STUDENT SPACE</div><h2>Small steps. <span>Big semester.</span></h2><p>Keep your tasks clear, your schedule balanced, and your goals in sight.</p><button className="banner-btn" onClick={openNewTask}>Plan something <ChevronRight size={16}/></button></div><div className="banner-art"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><div className="planet"><GraduationCap size={34}/></div><div className="float-card float-card-one"><CheckCircle2 size={15}/> <span>Keep going!</span></div><div className="float-card float-card-two"><CalendarClock size={15}/><span>One day at a time</span></div><div className="star star-one">✦</div><div className="star star-two">✧</div></div></div>
    <div className="stats-grid">
      <StatCard icon={ListTodo} label="Total tasks" value={tasks.length} foot={`${pending.length} still on your list`} color="purple"/>
      <StatCard icon={CheckCircle2} label="Completed" value={completed} foot={`${progress}% overall progress`} color="green"/>
      <StatCard icon={Clock3} label="Upcoming" value={dueSoon.length} foot="Due soon or today" color="orange"/>
      <StatCard icon={BookOpen} label="Class blocks" value={classes.length} foot="Across your weekly schedule" color="blue"/>
    </div>
    <div className="dashboard-grid">
      <section className="panel task-panel"><div className="panel-heading"><div><h3>Coming up next</h3><p>Your next few deadlines</p></div><button className="text-btn" onClick={()=>setTab("tasks")}>View all <ChevronRight size={15}/></button></div>
        {dueSoon.length ? <div className="task-list">{dueSoon.map(t=><TaskRow key={t.id} task={t} onToggle={toggleTask} onEdit={()=>{setEditingTask(t);setTaskModal(true)}} compact/>)}</div> : <EmptyState title="Nothing due soon" text="Add a task and keep your momentum going." action={openNewTask}/>}
      </section>
      <section className="panel progress-panel"><div className="panel-heading"><div><h3>Your progress</h3><p>Every task counts</p></div><div className="panel-icon"><Activity size={18}/></div></div><div className="progress-ring-wrap"><svg viewBox="0 0 160 160" className="progress-ring"><circle cx="80" cy="80" r="65" className="ring-track"/><circle cx="80" cy="80" r="65" className="ring-value" style={{strokeDasharray:`${2*Math.PI*65}`,strokeDashoffset:`${2*Math.PI*65*(1-progress/100)}`}}/></svg><div className="progress-ring-label"><strong>{progress}%</strong><span>completed</span></div></div><div className="progress-legend"><span><i className="legend-purple"/> Completed <strong>{completed}</strong></span><span><i className="legend-muted"/> Remaining <strong>{pending.length}</strong></span></div><div className="focus-tip"><Zap size={16}/><p><strong>Quick tip</strong> Break bigger assignments into smaller tasks to make them easier to start.</p></div></section>
    </div>
    <div className="section-heading"><div><h3>Quick access</h3><p>Jump back into your school workflow</p></div></div>
    <div className="quick-grid"><button className="quick-card" onClick={()=>setTab("tasks")}><div className="quick-icon purple-bg"><ListTodo size={20}/></div><div><strong>Task manager</strong><small>Track assignments and deadlines</small></div><ChevronRight size={17}/></button><button className="quick-card" onClick={()=>setTab("calendar")}><div className="quick-icon blue-bg"><CalendarDays size={20}/></div><div><strong>Calendar planner</strong><small>See your week and due dates</small></div><ChevronRight size={17}/></button><button className="quick-card" onClick={()=>setTab("schedule")}><div className="quick-icon teal-bg"><Code2 size={20}/></div><div><strong>Class schedule</strong><small>Edit your weekly timetable</small></div><ChevronRight size={17}/></button></div>
  </>;
}
function StatCard({icon:Icon,label,value,foot,color}) {return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon size={19}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>}
function TaskRow({task,onToggle,onEdit,compact=false,onDelete}) {
  return <div className={`task-row ${task.done?"is-done":""} ${compact?"compact":""}`}><button className={`check-circle ${task.done?"checked":""}`} onClick={()=>onToggle(task.id)} title={task.done?"Mark pending":"Mark complete"}>{task.done&&<Check size={13}/>}</button><button className="task-main" onClick={onEdit}><span className="task-title">{task.title}</span><span className="task-meta">{task.course || "Personal"} <span>·</span> {task.type}</span></button><div className="task-due"><span className={`priority-dot ${task.priority.toLowerCase()}`}/><span>{prettyDate(task.due)}{task.time?` · ${task.time}`:""}</span></div>{!compact&&<><span className={`priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span><button className="icon-btn row-delete" onClick={()=>onDelete?.(task.id)} title="Delete task"><Trash2 size={15}/></button></>}</div>;
}
function EmptyState({title,text,action}) {return <div className="empty-state"><div className="empty-icon"><CheckCircle2 size={22}/></div><strong>{title}</strong><p>{text}</p>{action&&<button className="secondary-btn small" onClick={action}><Plus size={14}/> Add task</button>}</div>}

function TasksPage({tasks,query,setQuery,filter,setFilter,toggleTask,deleteTask,editTask,openNewTask}) {
  return <><PageHeading eyebrow="PLAN • PRIORITIZE • COMPLETE" title={<>Tasks & <span className="gradient-text">deadlines.</span></>} subtitle="Everything you need to do, organized in one list." action={<button className="primary-btn" onClick={openNewTask}><Plus size={17}/> Add task</button>}/>
    <div className="task-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tasks, subjects..."/></div><div className="filter-pills">{["All","Pending","Completed","High","Medium","Low"].map(f=><button key={f} onClick={()=>setFilter(f)} className={filter===f?"selected":""}>{f}</button>)}</div></div>
    <section className="panel full-panel"><div className="panel-heading"><div><h3>Your task list</h3><p>{tasks.length} {tasks.length===1?"task":"tasks"} match your filters</p></div><span className="muted-label">SORTED BY DUE DATE</span></div>
      {tasks.length ? <div className="task-list">{tasks.map(t=><TaskRow key={t.id} task={t} onToggle={toggleTask} onEdit={()=>editTask(t)} onDelete={deleteTask}/>)}</div> : <EmptyState title="No matching tasks" text="Try another search or add a new task." action={openNewTask}/>}
    </section>
  </>;
}

function CalendarPage({month,setMonth,selectedDate,setSelectedDate,tasks,classes,toggleTask,openNewTask,editTask}) {
  const year=month.getFullYear(), mo=month.getMonth();
  const first=new Date(year,mo,1), start=(first.getDay()+6)%7, daysInMonth=new Date(year,mo+1,0).getDate();
  const cells=[...Array(start).fill(null),...Array(daysInMonth).keys()].map(n=>n===null?null:n+1);
  while(cells.length%7) cells.push(null);
  const selectedDay = DAYS[(new Date(`${selectedDate}T12:00:00`).getDay()+6)%7];
  const dayClasses=classes.filter(c=>c.day===selectedDay).sort((a,b)=>a.start.localeCompare(b.start));
  const dayTasks=tasks.filter(t=>t.due===selectedDate);
  function moveMonth(delta){setMonth(new Date(year,mo+delta,1));}
  return <><PageHeading eyebrow="SEE THE BIG PICTURE" title={<>Your <span className="gradient-text">calendar.</span></>} subtitle="Connect deadlines with your day-to-day schedule." action={<button className="primary-btn" onClick={openNewTask}><Plus size={17}/> Add task</button>}/>
    <div className="calendar-layout"><section className="panel calendar-panel"><div className="calendar-header"><div><h3>{month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h3><p>Choose a date to see what's planned</p></div><div className="month-controls"><button className="icon-btn" onClick={()=>moveMonth(-1)}><ChevronLeft size={18}/></button><button className="today-btn" onClick={()=>{setMonth(new Date());setSelectedDate(dateOffset(0));}}>Today</button><button className="icon-btn" onClick={()=>moveMonth(1)}><ChevronRight size={18}/></button></div></div>
      <div className="calendar-grid weekdays">{SHORT_DAYS.map(d=><div key={d}>{d}</div>)}</div><div className="calendar-grid">{cells.map((n,i)=>{const value=n?isoDate(new Date(year,mo,n)):"";const dayTasks=tasks.filter(t=>t.due===value);const dayClasses=classes.filter(c=>c.day===DAYS[(new Date(`${value||todayIso()}T12:00:00`).getDay()+6)%7]);return <button key={i} disabled={!n} className={`calendar-cell ${value===selectedDate?"selected":""} ${value===dateOffset(0)?"today":""} ${!n?"blank":""}`} onClick={()=>setSelectedDate(value)}><span className="cell-date">{n||""}</span><span className="cell-dots">{dayTasks.slice(0,3).map(t=><i key={t.id} className={`dot-${t.priority.toLowerCase()}`}/>)}{dayClasses.length>0&&<i className="dot-class"/>}</span>{dayTasks.length>0&&<small>{dayTasks.length} {dayTasks.length===1?"task":"tasks"}</small>}</button>})}</div>
      <div className="calendar-legend"><span><i className="dot-high"/> High priority</span><span><i className="dot-medium"/> Medium</span><span><i className="dot-class"/> Class day</span></div>
    </section><section className="panel day-panel"><div className="panel-heading"><div><div className="eyebrow">{selectedDate===dateOffset(0)?"TODAY":"SELECTED DATE"}</div><h3>{prettyDate(selectedDate,{weekday:"long",month:"long",day:"numeric"})}</h3><p>{selectedDay} overview</p></div></div><div className="day-section-title"><strong>Tasks</strong><span>{dayTasks.length}</span></div>{dayTasks.length?dayTasks.map(t=><TaskRow key={t.id} task={t} onToggle={toggleTask} onEdit={()=>editTask(t)} compact/>):<p className="subtle-empty">No tasks due on this date.</p>}<div className="day-section-title schedule-title"><strong>Classes</strong><span>{dayClasses.length}</span></div>{dayClasses.length?dayClasses.map(c=><div className="mini-class" key={c.id}><i style={{background:c.color}}/><div><strong>{c.subject}</strong><small>{c.start}–{c.end} · {c.room}</small></div></div>):<p className="subtle-empty">No classes scheduled for this day.</p>}<button className="secondary-btn full-width" onClick={openNewTask}><Plus size={15}/> Add task to this date</button></section></div>
  </>;
}
function todayIso(){return dateOffset(0)}

function SchedulePage({classes,onAdd,onEdit,onDelete}) {
  const [view,setView]=useState("grid");
  const [search,setSearch]=useState("");
  const [dayFilter,setDayFilter]=useState("All days");
  const visible=classes.filter(c=>(`${c.subject} ${c.code} ${c.room} ${c.instructor}`.toLowerCase().includes(search.toLowerCase()))&&(dayFilter==="All days"||c.day===dayFilter)).sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start.localeCompare(b.start));
  const overlaps = useMemo(()=>{const found=new Set();classes.forEach(a=>classes.forEach(b=>{if(a.id!==b.id&&a.day===b.day&&a.start<b.end&&b.start<a.end) {found.add(a.id);found.add(b.id);}}));return found;},[classes]);
  const times=[...new Set(classes.map(c=>c.start))].sort();
  return <><PageHeading eyebrow="YOUR WEEK, AT A GLANCE" title={<>Class <span className="gradient-text">schedule.</span></>} subtitle="Build and edit your weekly timetable. Changes are saved on this device." action={<button className="primary-btn" onClick={onAdd}><Plus size={17}/> Add class</button>}/>
    <div className="schedule-summary"><div className="summary-symbol"><Code2 size={21}/></div><div><strong>Weekly timetable</strong><p>{classes.length} class blocks across {new Set(classes.map(c=>c.day)).size} days</p></div><div className="summary-spacer"/><div className="view-switch"><button className={view==="grid"?"on":""} onClick={()=>setView("grid")}>Timetable</button><button className={view==="table"?"on":""} onClick={()=>setView("table")}>Table view</button></div></div>
    {overlaps.size>0&&<div className="warning-notice"><Bell size={16}/><span><strong>Schedule conflict detected.</strong> {overlaps.size} class entries overlap. Review the highlighted rows.</span></div>}
    <div className="schedule-toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subject, room, instructor..."/></div><select value={dayFilter} onChange={e=>setDayFilter(e.target.value)}><option>All days</option>{DAYS.map(d=><option key={d}>{d}</option>)}</select><span className="muted-label">{visible.length} ENTRIES</span></div>
    {view==="grid"?<div className="timetable-wrap panel"><div className="timetable" style={{"--day-count":7}}><div className="time-head">TIME</div>{DAYS.map(d=><div className="day-head" key={d}>{d.slice(0,3)}<small>{d}</small></div>)}{(times.length?times:["08:00","10:00","13:00"]).map(time=><React.Fragment key={time}><div className="time-label">{time}</div>{DAYS.map(day=>{const entry=visible.find(c=>c.day===day&&c.start===time);return <div className="time-slot" key={`${day}-${time}`}>{entry&&<button className={`class-block ${overlaps.has(entry.id)?"conflict":""}`} style={{"--class-color":entry.color}} onClick={()=>onEdit(entry)} title="Click to edit"><strong>{entry.subject}</strong><span>{entry.code}</span><small><Clock3 size={11}/>{entry.start}–{entry.end}</small><small><BookOpen size={11}/>{entry.room}</small></button>}</div>})}</React.Fragment>)}</div><div className="timetable-hint"><span><i className="hint-dot"/> Click a class block to edit it</span><span>Times shown in 24-hour format</span></div></div>:<div className="panel full-panel table-panel"><div className="table-scroll"><table><thead><tr><th>Day</th><th>Time</th><th>Subject / Code</th><th>Room</th><th>Instructor</th><th>Actions</th></tr></thead><tbody>{visible.map(c=><tr key={c.id} className={overlaps.has(c.id)?"conflict-row":""}><td><span className="day-tag">{c.day}</span></td><td className="time-cell">{c.start}–{c.end}</td><td><div className="subject-cell"><i style={{background:c.color}}/><div><strong>{c.subject}</strong><small>{c.code}</small></div></div></td><td>{c.room||"—"}</td><td>{c.instructor||"—"}</td><td><div className="table-actions"><button className="icon-btn" onClick={()=>onEdit(c)} title="Edit"><Settings2 size={15}/></button><button className="icon-btn danger-hover" onClick={()=>onDelete(c.id)} title="Delete"><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>{visible.length===0&&<EmptyState title="No class entries found" text="Change your search or add a class." action={onAdd}/>}</div></div>}
    <div className="schedule-bottom"><div><div className="bottom-icon"><CheckCircle2 size={18}/></div><div><strong>Keep your timetable up to date</strong><p>Tap any class to edit details. The table and timetable views share the same data.</p></div></div><button className="secondary-btn" onClick={onAdd}><Plus size={15}/> Add class block</button></div>
  </>;
}

function TaskModal({task,onClose,onSave}) {
  const [form,setForm]=useState({title:task?.title||"",course:task?.course||"",due:task?.due||dateOffset(0),time:task?.time||"17:00",priority:task?.priority||"Medium",type:task?.type||"Assignment",reminder:task?.reminder??true,done:task?.done||false});
  const [error,setError]=useState("");
  function update(key,value){setForm(f=>({...f,[key]:value}));}
  function submit(e){e.preventDefault();if(!form.title.trim()){setError("Please enter a task title.");return;}onSave({...form,title:form.title.trim()});}
  return <ModalShell title={task?"Edit task":"Create a task"} subtitle="Keep the details clear so future-you says thanks." onClose={onClose}><form onSubmit={submit} className="modal-form"><label>Task title <input autoFocus value={form.title} onChange={e=>update("title",e.target.value)} placeholder="e.g. Finish project proposal" /></label><label>Subject / course <input value={form.course} onChange={e=>update("course",e.target.value)} placeholder="e.g. Data Structures"/></label><div className="form-two"><label>Due date <input type="date" value={form.due} onChange={e=>update("due",e.target.value)} required/></label><label>Due time <input type="time" value={form.time} onChange={e=>update("time",e.target.value)}/></label></div><div className="form-two"><label>Priority <select value={form.priority} onChange={e=>update("priority",e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Task type <select value={form.type} onChange={e=>update("type",e.target.value)}>{["Assignment","Quiz","Exam","Project","Study","Reading","Other"].map(x=><option key={x}>{x}</option>)}</select></label></div><label className="toggle-row"><span><strong><Bell size={15}/> Reminder</strong><small>Show an in-app/browser reminder at the due time.</small></span><input type="checkbox" checked={form.reminder} onChange={e=>update("reminder",e.target.checked)}/></label>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button type="submit" className="primary-btn"><Check size={16}/>{task?"Save changes":"Create task"}</button></div></form></ModalShell>;
}
function ClassModal({item,classes,onClose,onSave}) {
  const [form,setForm]=useState({day:item?.day||"Monday",start:item?.start||"08:00",end:item?.end||"09:30",subject:item?.subject||"",code:item?.code||"",room:item?.room||"",instructor:item?.instructor||"",color:item?.color||SUBJECT_COLORS[classes.length%SUBJECT_COLORS.length]});
  const [error,setError]=useState("");
  function update(key,value){setForm(f=>({...f,[key]:value}));}
  function submit(e){e.preventDefault();if(!form.subject.trim()){setError("Please enter a subject name.");return;}if(form.start>=form.end){setError("End time must be later than start time.");return;}onSave({...form,subject:form.subject.trim()});}
  return <ModalShell title={item?"Edit class entry":"Add a class"} subtitle="Build your weekly timetable, one class at a time." onClose={onClose}><form onSubmit={submit} className="modal-form"><label>Subject name <input autoFocus value={form.subject} onChange={e=>update("subject",e.target.value)} placeholder="e.g. Programming 2"/></label><label>Subject code <input value={form.code} onChange={e=>update("code",e.target.value)} placeholder="e.g. CS 202"/></label><div className="form-two"><label>Day <select value={form.day} onChange={e=>update("day",e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select></label><label>Room <input value={form.room} onChange={e=>update("room",e.target.value)} placeholder="e.g. Lab 3"/></label></div><div className="form-two"><label>Start time <input type="time" value={form.start} onChange={e=>update("start",e.target.value)} required/></label><label>End time <input type="time" value={form.end} onChange={e=>update("end",e.target.value)} required/></label></div><label>Instructor <input value={form.instructor} onChange={e=>update("instructor",e.target.value)} placeholder="e.g. Prof. Dela Cruz"/></label><label>Color tag <div className="color-options">{SUBJECT_COLORS.map(c=><button type="button" key={c} className={`color-choice ${form.color===c?"chosen":""}`} style={{background:c}} onClick={()=>update("color",c)} aria-label={`Choose color ${c}`}/>)}</div></label>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button type="submit" className="primary-btn"><Check size={16}/>{item?"Save changes":"Add to schedule"}</button></div></form></ModalShell>;
}
function ModalShell({title,subtitle,onClose,children}) {useEffect(()=>{function key(e){if(e.key==="Escape")onClose();}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[onClose]);return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal-card"><div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" onClick={onClose}><X size={19}/></button></div>{children}</section></div>}

createRoot(document.getElementById("root")).render(<App />);
