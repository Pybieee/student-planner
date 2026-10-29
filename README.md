# Orbit — Personal Student Planner

A responsive, dark-mode student planner built with React and Vite. It includes a home dashboard, monthly calendar, task list, and recurring weekly class schedule.

## Features
- Monthly calendar with today and task days highlighted.
- Tap a date to select it or preview its tasks; long-press for a focused add-task sheet. Swipe to change months.
- Complete, edit, and delete tasks from the day preview. Optional time, subject, and priority details are available on demand.
- Weekly Monday-to-Friday visual time grid from 7:00 AM to 8:00 PM, with classes positioned and sized by their actual times and overlapping classes arranged side by side.
- Add, edit, and delete recurring classes with a subject, day, start and end times, optional room and instructor, and an accent color.
- Tap a class to open its editor, or tap an empty time in the grid to start adding a class.
- Scan a schedule photo or screenshot with Tesseract.js OCR in the browser. JPG, JPEG, and PNG are supported; detected classes can be corrected before importing. Recognition assets are served with the app, and images are not uploaded.
- Switch between weekdays in the mobile schedule; the full Monday-to-Friday grid remains available on wider screens.
- Saves tasks and classes in this browser's `localStorage`; no account or backend is used.
- Download or import a planner backup from Settings. Imports add to existing data rather than replacing it.
- The app uses system fonts and works offline after it has loaded.
- The dark blue/black theme is defined with CSS variables at the top of `src/styles.css`.

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

The development and production build scripts copy the OCR worker, WebAssembly core, and English recognition data from installed npm packages into `public/ocr/`. These files are served locally with the app; no OCR API or API key is used.

## Data and deployment
Data stays in the current browser profile on this device and does not sync to other devices. Clearing the browser's site data will remove saved tasks and classes. To deploy, build with `npm run build` and publish the generated `dist/` folder to a static hosting provider.

## Project structure
- `index.html` — app entry document
- `src/main.jsx` — React components and app logic
- `src/styles.css` — theme color variables and responsive styling
