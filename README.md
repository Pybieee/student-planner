# Orbit — Personal Student Planner

A simple, responsive, dark-mode planner built with React and Vite. It has two pages: a monthly task calendar and a recurring weekly class schedule.

## Features
- Monthly calendar with today and task days highlighted.
- Quickly add tasks to a selected date; optional time, subject, and priority details are available on demand.
- Complete, edit, and delete tasks from the selected day's list.
- Weekly schedule with days across the top and 30-minute slots from 07:00 to 22:00.
- Add, edit, and delete recurring classes with subject, professor, room, times, and an accent color.
- Saves tasks and classes in this browser's `localStorage`; no account or backend is used.
- Responsive layout for mobile and desktop. The app uses system fonts and works offline after it has loaded.

## Run locally
Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

For a production build:

```bash
npm run build
npm run preview
```

## Data and deployment
Data stays in the current browser profile on this device and does not sync to other devices. Clearing the browser's site data will remove saved tasks and classes. To deploy, build with `npm run build` and publish the generated `dist/` folder to a static hosting provider.

## Project structure
- `index.html` — app entry document
- `src/main.jsx` — React components and app logic
- `src/styles.css` — theme color variables and responsive styling
