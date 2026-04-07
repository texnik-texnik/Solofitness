# Solo Fitness — QWEN Context

## Project Overview

**Solo Leveling Fitness** is a gamified fitness Progressive Web App (PWA) themed around the "Solo Leveling" anime/manhwa concept. The app transforms real-world workouts into RPG-style quests, tracking user progress through levels, experience points (EXP), and four core stats: **Strength**, **Agility**, **Vitality**, and **Intelligence**.

### Key Features

- **Shadow Quests** — Daily randomized quests across 4 types: run, strength, vitality, intelligence
- **GPS Run Tracking** — Real-time distance tracking using the Geolocation API with Haversine distance calculation
- **Camera Workout** — Uses device camera for pushup/workout sessions with rep counting (simulated) and photo proof capture
- **Intelligence Quiz** — Mock fitness knowledge quizzes
- **Leveling System** — EXP-based progression with stat boosts on level-up
- **Progress Charts** — Recharts-based line chart visualizing EXP and Agility growth over time
- **Quest History** — Persistent log of completed activities with optional photo proof
- **Haptic Feedback** — Vibration API for quest completion feedback

### Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19.2 with TypeScript |
| Build Tool | Create React App (react-scripts 5.0.1) |
| Charts | Recharts 3.2.1 |
| Testing | @testing-library/react, Jest |
| Styling | Tailwind CSS utility classes (inline) |
| State Persistence | `localStorage` |

## Project Structure

```
solo-fitness/
├── public/
│   ├── index.html          # HTML shell with PWA meta tags
│   ├── manifest.json       # PWA manifest
│   ├── robots.txt
│   └── favicon.ico, logo*.png
├── src/
│   ├── App.tsx             # Main application component (all logic + UI)
│   ├── App.css             # App-specific styles (minimal, uses Tailwind)
│   ├── index.tsx           # React entry point
│   ├── index.css           # Global CSS resets
│   ├── reportWebVitals.ts  # Web Vitals reporting
│   ├── setupTests.ts       # Test setup
│   └── react-app-env.d.ts  # TypeScript declarations
├── package.json
├── tsconfig.json
└── README.md
```

## Building and Running

### Development
```bash
npm start
```
Starts the development server on `http://localhost:3000`. Hot-reload enabled.

### Production Build
```bash
npm run build
```
Outputs optimized production bundle to `build/` folder.

### Run Tests
```bash
npm test
```
Launches Jest in interactive watch mode.

### Eject (One-Way)
```bash
npm run eject
```
Exposes underlying webpack/Babel config. **Cannot be undone.**

## Development Conventions

- **Single-file architecture**: All application logic resides in `src/App.tsx` — a monolithic component handling state, effects, camera, GPS, and UI rendering
- **Tailwind CSS classes**: Styling is done inline using Tailwind utility classes (no separate CSS framework imported)
- **TypeScript interfaces**: Core data types (`Stat`, `Quest`, `Position`, `HistoryEntry`) are defined at the top of `App.tsx`
- **localStorage persistence**: User data (level, EXP, stats, history) is saved to `localStorage` and restored on load
- **Daily quest reset**: Quests regenerate when the stored `questDate` doesn't match today's date
- **Simulated rep counting**: The camera workout simulates 1 rep every 3 seconds (not actual pose detection)

## Important Implementation Details

1. **GPS Tracking**: Uses `navigator.geolocation.watchPosition()` with high accuracy mode. Distance calculated via Haversine formula.
2. **Camera**: Uses `navigator.mediaDevices.getUserMedia()` with `facingMode: 'user'`. Captures frames to canvas for photo proof.
3. **No backend**: Entirely client-side. All data stored in `localStorage`.
4. **Recharts dependency**: Used for the growth chart — imported at the top of `App.tsx`.
5. **Encoding issues**: Some emoji characters in the source appear garbled (e.g., `рџЋ‰` instead of 🎉). This is likely an encoding artifact.

## Android/Termux Context

This project is being developed on **Android** using **Termux**. Key considerations:
- Camera and GPS require Chrome permission grants on Android
- PWA should be "Add to Home Screen" for full functionality
- `navigator.vibrate()` works on Android devices with vibration hardware
