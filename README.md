# Orbit — Personal Student Planner

A responsive, dark-mode student planner built with React and Vite. It includes a home dashboard, monthly calendar, task list, and recurring weekly class schedule.

## Features
- Monthly calendar with today and task days highlighted.
- Tap a date to select it or preview its tasks; long-press for a focused add-task sheet. Swipe to change months.
- Complete, edit, and delete tasks from the day preview. Optional time, subject, and priority details are available on demand.
- Weekly Monday-to-Sunday visual time grid from 7:00 AM to 8:00 PM, with classes positioned and sized by their actual times and overlapping classes arranged side by side.
- Add, edit, and delete recurring classes with a subject, day, start and end times, optional room and instructor, and an accent color.
- Tap a class to open its editor, or tap an empty time in the grid to start adding a class.
- Scan a schedule photo or screenshot with Tesseract.js OCR in the browser. JPG, JPEG, and PNG are supported; detected classes can be corrected before importing. Recognition assets are served with the app, and images are not uploaded.
- View all seven days together. On narrow screens the weekly grid scrolls horizontally while keeping the time column visible.
- Open Notes from Home without adding another permanent navigation item. Create, search, rename, and delete notes; format text, headings, lists, and checklists in the local rich-text editor.
- Notes, tasks, and classes are saved in this browser's `localStorage`; no account or backend is used.
- Download or import a planner backup from Settings. Backups include notes, and imports add to existing data rather than replacing it.
- The app uses system fonts and works offline after it has loaded.
- The dark blue/black theme is defined with CSS variables at the top of `src/styles.css`.

Schedule scanning uses locally bundled Tesseract.js assets. Recognized text and OCR word positions are used to associate class times and subjects with weekday columns; uncertain or missing fields remain editable in the review step. Grid layouts without readable time ranges may need manual correction because OCR cannot reliably infer a class duration from position alone.

## Run locally
Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

For a production build:

```bash
npm test
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
