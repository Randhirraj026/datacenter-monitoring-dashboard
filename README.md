# Data Center Monitoring Dashboard & AI Forecasting

A high-performance, full-stack operational intelligence platform designed to monitor enterprise IT infrastructure. This system natively integrates with VMware vSphere and HPE iLO to aggregate real-time hardware telemetry and virtual machine lifecycle data. It features a dedicated Machine Learning forecasting layer powered by PyTorch LSTMs to predict cluster performance trends.

## Core Features

- **vSphere Integration:** Automatically synchronizes Datastores, VM states, and cluster-wide compute (CPU/Mem) allocations via SOAP and REST APIs.
- **HPE iLO Redfish API:** Directly polls iLO management ports for physical inlet temperatures, fan speeds, and realtime power consumption (Wattage).
- **Vertiv RDU Integration:** Supports a configurable backend proxy for Vertiv RDU metrics such as rack front/rear temperature, humidity, AC supply air, UPS battery, runtime, and active alarms.
- **Time-Series Database Archive:** Background Node.js cron workers continuously snapshot network telemetries into PostgreSQL for historical performance tracking.
- **Role-Based Access Control:** Secure JWT authentication splitting user views into standard `Admin` (Dashboard) and `SuperAdmin` (Deep diagnostics).
- **AI/ML Forecasting Module:** A dedicated Python FastAPI microservice trained iteratively on PostgreSQL data to predict next 24-hour and 7-day power/compute trends using an LSTM autoregressive neural network.

---

## Tech Stack
- **Frontend:** React, Vite, Tailwind CSS, Chart.js
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (pg-pool)
- **ML / AI Service:** Python, FastAPI, PyTorch, scikit-learn, pandas

---

## Architecture Overview

The application follows a microservices architecture with three main components:

1. **Backend (Node.js/Express)**: Handles API endpoints, data collection from vSphere/iLO/RDU, alert processing, and archiving.
2. **Frontend (React/Vite)**: Provides two dashboards - Admin (real-time monitoring) and SuperAdmin (historical analytics + forecasting).
3. **ML Service (Python/FastAPI)**: Runs LSTM models for predictive analytics on time-series data.

### Data Flow
- **Real-time Collection**: Every 5 seconds, the backend polls vSphere, iLO, and RDU APIs, stores snapshots in PostgreSQL, and triggers alerts.
- **Archiving**: Weekly cron job exports old data to CSV files in `/archives/` for long-term storage.
- **Forecasting**: On-demand LSTM training using historical data from DB and archives to predict future metrics.

---

## Folder Structure
```text
.
├── backend/          # Node.js Express server (APIs, vSphere/iLO Workers)
│   ├── server.js     # Main server initialization
│   ├── auth.js       # JWT authentication
│   ├── routes/       # API endpoints (vsphere, ilo, rdu, superadmin, etc.)
│   ├── services/     # Business logic (vSphere API, iLO polling, alerts, etc.)
│   ├── schedulers/   # Background jobs (weekly archiving)
│   ├── db/           # Database connection and schema
│   └── config/       # Archive table configurations
├── frontend/         # React SPA (Vite) User Interfaces
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Login, Dashboard, SuperAdmin pages
│   │   ├── hooks/       # Custom React hooks for data fetching
│   │   ├── services/    # API client functions
│   │   └── constants/   # Configuration constants
├── database/         # PostgreSQL schemas and queries
├── ml_service/       # Python Forecasting Model (FastAPI)
└── archives/         # CSV exports from weekly archiving
```

---

## Backend Components

### Server Initialization ([server.js](backend/server.js))
- Initializes Express app with CORS and JWT middleware.
- Starts background workers: metrics collector (5-sec polling) and archive scheduler (weekly).
- Exposes health check endpoint.

### Authentication ([auth.js](backend/auth.js))
- JWT-based auth with 8-hour expiry.
- Two roles: Admin (dashboard access) and SuperAdmin (full access).
- Credentials configured via environment variables.

### API Routes
- **vSphere Routes**: Real-time cluster data (hosts, VMs, datastores, alerts).
- **iLO Routes**: Physical server health metrics.
- **RDU Routes**: Rack monitoring data.
- **SuperAdmin Routes**: Historical data and alert configuration.
- **Archive Routes**: Access to CSV exports.

### Services
- **vSphere Service**: Hybrid SOAP/REST API integration with caching and error handling.
- **iLO Service**: Redfish API polling with serialization to avoid connection limits.
- **RDU Service**: Proxy for Vertiv RDU data.
- **Metrics Store**: Background snapshot collection and storage.
- **Alert Engine**: Anomaly detection and email notifications.
- **Archive Service**: Weekly CSV export to disk.

### Database
- PostgreSQL with tables for inventory, metrics, and events.
- Auto-initialization on startup.
- Time-series data with proper indexing.

---

## Frontend Components

### Pages
- **LoginPage**: Authentication form.
- **DashboardPage**: Real-time monitoring for admins.
- **SuperAdminPage**: Advanced analytics and forecasting.

### Key Hooks
- **useDashboardData**: 5-second polling for real-time data.
- **useSuperAdminDashboardData**: Fetches live and historical data.
- **useSuperAdminHistoricalData**: Parses archived CSV data.

### UI Components
- Charts using Chart.js for metrics visualization.
- Responsive design with Tailwind CSS.
- Animated cards and loading states.

---
 
## ML Service

### Functionality
- **LSTM Forecasting**: Trains on historical data to predict CPU, memory, and power usage.
- **Data Sources**: PostgreSQL snapshots and CSV archives.
- **Caching**: 1-hour TTL for predictions.
- **Endpoints**: Single forecast endpoint with parameters for host, metric, and time horizon.

---

## Setup & Deployment

### 1. PostgreSQL Database
You must have a running PostgreSQL instance.
1. Create a database named `superadmin_db` (or as defined in your environment).
2. Execute the schema queries found in `database/superadmin_schema.sql` to initialize all required inventory, events, and metrics tables.

### 2. Node.js Backend Server
This acts as the main proxy and data synchronization pipeline.
```bash
cd backend
npm install
```

Create a `.env` file in `backend/.env` with your secure credentials:
```env
PORT=3000
JWT_SECRET=your_secure_hash
JWT_EXPIRES_IN=8h
PGHOST=localhost
PGPORT=5432
PGDATABASE=superadmin_db
PGUSER=root
PGPASSWORD=secret
VCENTER_HOST=ip address
VCENTER_USER=administrator@vsphere.local
VCENTER_PASSWORD=...
ILO_HOST_1=ip address
ILO_PASS_1=...
```
Start the service:
```bash
npm run dev
```

### 3. Python ML Forecasting Service
This drives the predictive charting found exclusively on the SuperAdmin dashboard.
```bash
cd ml_service
python -m venv venv
source venv/Scripts/activate # (Or venv\bin\activate on Mac/Linux)
pip install -r requirements.txt
```
Ensure you create `ml_service/.env` using the identical PostgreSQL credentials.
Start the FastAPI server on port 8000:
```bash
python main.py
```

### Vertiv RDU Setup
The backend can proxy a Vertiv RDU feed so the browser does not need to talk to the RDU directly.

Add these variables to `backend/.env`:
```env
RDU_ENABLED=true
RDU_BASE_URL=https://your-rdu-ip
RDU_AUTH_MODE=vertiv_cgi
RDU_USERNAME=rduadmin
RDU_PASSWORD=your_password
RDU_LOGIN_PATH=/cgi-bin/login.cgi
RDU_DATA_PATH=/cgi-bin/p50_main_page.cgi
RDU_VERIFY_TLS=false
```

Notes:
- For Vertiv RDU-A G2, use `RDU_AUTH_MODE=vertiv_cgi`.
- This mode logs in through `/cgi-bin/login.cgi` and polls `/cgi-bin/p50_main_page.cgi` for live rack, UPS, AC, and alarm values.

### 4. React Frontend
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173/` in your local browser to access the dashboard.

---

## Key Workflows

### Real-Time Monitoring
1. Backend polls vSphere/iLO/RDU every 5 seconds.
2. Stores snapshots in PostgreSQL.
3. Triggers alerts on anomalies.
4. Frontend updates dashboards with fresh data.

### Historical Analysis
1. SuperAdmin selects date range.
2. Backend merges data from archives and live DB.
3. Frontend renders historical charts.

### Forecasting
1. ML service trains LSTM on historical data.
2. Predicts future metrics.
3. Frontend overlays predictions on charts.

### Alerting
1. Anomalies detected during snapshots.
2. Emails sent to ops team.
3. Alerts displayed in UI.

---

## Configuration

- **Environment Variables**: All sensitive data (credentials, IPs) via `.env` files.
- **Alert Thresholds**: Configurable via SuperAdmin panel.
- **Archive Retention**: Default 7 days, configurable.
- **Polling Intervals**: 5 seconds for real-time, weekly for archiving.

---

## Troubleshooting

- **Connection Issues**: Check vSphere/iLO IPs and credentials in `.env`.
- **Database Errors**: Ensure PostgreSQL is running and schema is initialized.
- **ML Service**: Verify Python environment and dependencies.
- **Frontend**: Check console for API errors; ensure backend is running.

---

## Contributing

1. Follow the existing code structure.
2. Add tests for new features.
3. Update documentation for API changes.
4. Use environment variables for configuration.


