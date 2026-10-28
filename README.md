# Orbit — Student Planner

A responsive dark-mode student organizer built with React and Vite.

## Features
- Dashboard with task totals, completion progress, upcoming deadlines, and quick navigation.
- Create, edit, complete, search, filter, and delete tasks.
- Task fields: title, course, due date/time, priority, type, and reminder toggle.
- Calendar month view with task markers and a selected-day panel showing tasks and classes.
- Separate weekly class schedule with editable class blocks and a sortable table view.
- Class fields: subject, subject code, day, start/end time, room, instructor, and color.
- Overlap detection for classes on the same day.
- Responsive layouts for desktop, tablet, and mobile.
- Saves tasks and classes in browser `localStorage`.

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

## Reminders
The app can request browser notification permission. Scheduled reminders work while the app page remains open; browsers may delay timers when a tab is suspended. This is a front-end prototype, not a guaranteed background/push notification service. For reliable reminders while the app is closed, add a backend, push notification service, and/or a native mobile wrapper.

## Data and deployment
Data is stored locally in the current browser profile and does not sync between devices. For multi-device sync or accounts, connect a backend/database and authentication. To deploy, build with `npm run build` and publish the generated `dist/` folder to a static hosting provider.

## Project structure
- `index.html` — app entry document
- `src/main.jsx` — React components and app logic
- `src/styles.css` — dark tech UI and responsive styling
