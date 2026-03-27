# ORION – Kristellar DNN Dashboard (React + Tailwind)

A fully converted, production-grade React 18 + Tailwind CSS v3 dashboard — migrated from the original vanilla HTML/CSS/JS codebase.

---

## 📁 Folder Structure

```
orion-dnn-dashboard/
├── index.html                        # Vite HTML entry point
├── vite.config.js                    # Vite config (dev proxy → :3000)
├── tailwind.config.js                # Tailwind theme extending original CSS variables
├── postcss.config.js                 # PostCSS / autoprefixer
├── package.json
│
└── src/
    ├── main.jsx                      # ReactDOM entry + BrowserRouter
    ├── App.jsx                       # Route definitions + PrivateRoute guard
    ├── index.css                     # Global styles, @tailwind directives, keyframes
    │
    ├── constants/
    │   └── config.js                 # API base URL, poll interval, IP_NAME_MAP, VC_HOST
    │
    ├── services/
    │   ├── api.js                    # login(), logout(), fetchVsphereCore(), fetchILO()
    │   └── ipMapper.js               # mapIpName(), getServerDisplayName(), isGenericServerLabel()
    │
    ├── hooks/
    │   ├── useDashboardData.js       # Polling hook — fetches & normalises all dashboard data
    │   └── useCardAnimation.js       # IntersectionObserver → adds .visible class to cards
    │
    ├── pages/
    │   ├── LoginPage.jsx             # /login  — auth form, error/success alerts, shake anim
    │   └── DashboardPage.jsx         # /dashboard — full dashboard layout
    │
    ├── components/
    │   ├── layout/
    │   │   ├── Header.jsx            # Sticky header: logo, centred stats, logout button
    │   │   └── Footer.jsx            # Footer copyright bar
    │   │
    │   ├── ui/
    │   │   ├── BackgroundAnimation.jsx  # Moving grid + floating glow shapes (fixed bg)
    │   │   ├── LoadingOverlay.jsx       # Full-screen loader (3-dot pulse)
    │   │   ├── StatusBadge.jsx          # Fixed connection status badge (top-right)
    │   │   ├── SectionHeader.jsx        # Section title with coloured icon pill
    │   │   ├── DashCard.jsx             # Base .dash-card wrapper + CardHeader / StatsGrid / StatItem
    │   │   ├── GaugeChart.jsx           # SVG circular gauge (stroke-dasharray)
    │   │   ├── Badge.jsx                # Inline status badges (success/warning/danger/info)
    │   │   └── ProgressBar.jsx          # Thin horizontal progress bar
    │   │
    │   └── dashboard/
    │       ├── SummaryRow.jsx           # 6-card top summary row (CPU/Mem/Storage/Power/Temp/VMs)
    │       ├── CpuSection.jsx           # CPU gauge + per-host bar chart + host list
    │       ├── MemorySection.jsx        # Memory gauge + donut chart + per-host bars
    │       ├── StorageSection.jsx       # Storage gauge + donut chart + datastore table
    │       ├── VMSection.jsx            # VM overview, quick list, alerts, modal
    │       ├── PowerSection.jsx         # Power gauge + 24h line chart + PSU detail
    │       ├── ILOSection.jsx           # Per-server iLO hardware cards (fans/PSU/storage/temps)
    │       └── NetworkSection.jsx       # Per-server live network RX/TX line charts
    │
    └── assets/                         # Place dnnlogo.png here (also copy to /public/)
```

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Add your logo
Copy `dnnlogo.png` into the `public/` folder:
```
public/
└── dnnlogo.png
```

### 3. Configure API endpoint
Edit `src/constants/config.js`:
```js
export const API = 'http://localhost:3000/api'   // DEV
// export const API = '/api'                      // PROD
```

### 4. Run development server
```bash
npm run dev
```
The app runs on `http://localhost:5173` and proxies `/api` requests to `:3000`.

### 5. Production build
```bash
npm run build
npm run preview
```

---

## 🔌 API Compatibility

This React app consumes the **same Express backend** as the original vanilla project. No backend changes are needed.

| Endpoint              | Used by                        |
|-----------------------|--------------------------------|
| `POST /api/login`     | LoginPage                      |
| `POST /api/logout`    | Header logout button           |
| `GET  /api/vsphere/core` | useDashboardData (CPU/Mem/Storage/VMs) |
| `GET  /api/ilo`       | useDashboardData (iLO/Power/Temps) |

---

## 🎨 Design Notes

- **All animations** from the original CSS are preserved (grid-move, floatShape, pulseDot, card hover lift, gauge transition, LED blink, loader pulse, shake).
- **Chart.js** charts are identical in type and data to the originals (bar, doughnut, line).
- **Tailwind** is used for layout/spacing; custom CSS classes (`.dash-card`, `.ilo-card`, `.summary-card`, `.gauge-*`, `.progress-*`) are retained in `index.css` for complex hover/animation states that Tailwind can't handle with JIT alone.
- **IP → Name mapping** is fully preserved via `src/services/ipMapper.js`.

---

## 📦 Key Dependencies

| Package            | Purpose                          |
|--------------------|----------------------------------|
| react 18           | UI framework                     |
| react-router-dom 6 | Client-side routing              |
| chart.js 4         | All dashboard charts             |
| react-chartjs-2    | React wrapper for Chart.js       |
| tailwindcss 3      | Utility-first styling            |
| vite 5             | Build tool & dev server          |
