# Orbit — Personal Student Planner

A simple, responsive, dark-mode planner built with React and Vite. It has two pages: a monthly task calendar and a recurring weekly class schedule.

## Features
- Monthly calendar with today and task days highlighted.
- Tap a date to select it or preview its tasks; long-press for a focused add-task sheet. Swipe to change months.
- Complete, edit, and delete tasks from the day preview. Optional time, subject, and priority details are available on demand.
- Weekly schedule with days across the top and 30-minute slots covering the time range of saved classes.
- Add, edit, and delete recurring classes with subject, professor, room, times, and an accent color.
- Zoom the schedule with pinch gestures or the +/− controls; use Fit to show the full timetable. Schedule zoom is saved on this device.
- Optionally scan a schedule image with Gemini Flash-Lite, review and edit the detected classes, then import them without replacing existing classes.
- Saves tasks and classes in this browser's `localStorage`; no account or backend is used.
- Responsive layout for mobile and desktop. The app uses system fonts and works offline after it has loaded.
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

## Data and deployment
Data stays in the current browser profile on this device and does not sync to other devices. Clearing the browser's site data will remove saved tasks and classes. To deploy, build with `npm run build` and publish the generated `dist/` folder to a static hosting provider.

## Optional schedule scan
Manual class entry works without an API key. To use **Scan schedule**:
1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Schedule tab, open **Gemini API key & privacy**, paste the key, and save it.
3. Choose or take a clear photo/screenshot of your timetable. Review and correct every detected class before importing.

The selected image is sent to Google's Gemini API using the `gemini-3.5-flash-lite` model. The API key is stored in this browser's local storage; it is not sent to this app's server, but can be accessed by anyone with access to this browser profile. Images are not saved by the app. Gemini requires an internet connection and its free-tier limits and availability are controlled by Google. If scanning is unavailable, add classes manually as usual. To change the model, update `GEMINI_MODEL` in `src/main.jsx`.

## Project structure
- `index.html` — app entry document
- `src/main.jsx` — React components and app logic
- `src/styles.css` — theme color variables and responsive styling
