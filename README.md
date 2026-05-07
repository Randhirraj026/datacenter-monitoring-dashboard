# Data Center Monitoring Dashboard & AI Forecasting

A high-performance, full-stack operational intelligence platform designed to monitor enterprise IT infrastructure with a focus on visual excellence and predictive analytics.

This system natively integrates with **VMware vSphere**, **HPE iLO**, and **Vertiv RDU** to aggregate real-time hardware telemetry, virtual machine lifecycle data, and environmental metrics into a unified, glassmorphic dashboard.

## 🛠️ Prerequisites

To ensure proper installation and build stability (especially for the Vite 6 frontend), please verify your environment versions:

- **Node.js**: `v20.x` or `v22.x` (LTS) recommended (Verified on `v24.13.1`).
- **NPM**: `v10.x` or higher recommended.
- **Database**: PostgreSQL 14+

---

## 🚀 Core Features

### 📡 Multi-Source Integration
- **vSphere Integration**: Synchronizes Datastores, VM states (Running/Stopped), and cluster-wide compute (CPU/Memory) via SOAP and REST APIs.
- **HPE iLO Redfish API**: Polls physical server hardware for inlet temperatures, CPU health, and real-time power consumption (Wattage).
- **Vertiv RDU Monitoring**: Proxies environmental sensors including rack front/rear temperature, humidity, AC supply air, and UPS battery status.
- **Live Camera Feed**: Real-time HLS streaming of server room surveillance with FFmpeg-driven high-definition processing.
- **Live Person Detection**: Separate Python service detects people and faces in the surveillance feed so the dashboard still shows a signal when the face-recognition path misses a frame.

### 🔔 Unified Global Notification System
- **Real-Time Alerts**: A centralized notification bell accessible to all administrators.
- **VM Lifecycle Tracking**: Instant notifications for VM creation, deletion, and power state changes.
- **Threshold Monitoring**: Proactive alerts for high CPU, Memory, or Temperature breaches across physical and virtual hosts.
- **Deduplication Engine**: Intelligent alert buffering to prevent redundant notifications for persistent hardware issues.

### 🛠️ SuperAdmin Configuration & Management
- **Employee Biometric Management**: Full CRUD interface for managing employee access lists synced with a persistent PostgreSQL database.
- **Alert Rules Engine**: Granular control over threshold values (CPU%, Memory%, Temp C) and toggle-able system event notifications.
- **SMTP & Mail Settings**: Integrated mail server configuration with built-in "Send Test Email" functionality for verification.
- **Historical Analysis**: Customizable date-range filtering using a polished calendar popover to query months of historical performance data.

### 🔮 AI/ML Forecasting Module
- **Predictive Analytics**: Dedicated Python FastAPI microservice powered by **PyTorch LSTMs**.
- **Trend Projection**: Autoregressive neural networks predict the next 24-hour and 7-day power/compute trends based on historical snapshot data.

---

## 💻 Tech Stack

- **Frontend**: React 18, Vite, Vanilla CSS (Premium Glassmorphism), Chart.js
- **Backend**: Node.js, Express.js, PostgreSQL (pg-pool), Nodemailer
- **ML Service**: Python 3.10+, FastAPI, PyTorch, Pandas, Scikit-learn
- **Person Detection Service**: Python 3.10+, FastAPI, OpenCV, NumPy
- **Video Processing**: FFmpeg (HLS Streaming)

---

## 🏗️ Architecture Overview

The system follows a decoupled microservices architecture:

1.  **Primary Backend (Node.js)**: The central hub for real-time data collection (5-second polling), background snapshotting, and role-based API access.
2.  **Predictive Engine (Python/FastAPI)**: Independent service specialized in processing time-series data for LSTM model training and inference.
3.  **Modern Frontend (React)**: High-performance SPA utilizing custom hooks for dual-dashboard support (Admin for real-time, SuperAdmin for analytics).

---

## 📂 Project Structure

```text
.
├── backend/          # Node.js Express server (vSphere/iLO/RDU Workers)
│   ├── routes/       # API endpoints (Authenticated & Role-based)
│   ├── services/     # Business logic (vSphere SDK, iLO Redfish, Mail)
│   ├── db/           # PostgreSQL connection, bootstrap schemas, and mappers
│   └── schedulers/   # Background jobs (Snapshot collection, Archiving)
├── frontend/         # React SPA (Vite)
│   ├── src/pages/    # Admin Dashboard & SuperAdmin Analytics
│   ├── src/hooks/    # Custom data polling & historical fetchers
│   └── src/services/ # API integration layer
├── database/         # PostgreSQL schema definition (superadmin_schema.sql)
└── ml_service/       # Python Forecasting Microservice (PyTorch LSTM)
```

---

## 🛠️ Setup & Installation

### 1. Database
Create a PostgreSQL database and initialize it using the provided schema:
```bash
psql -U your_user -d your_db -f database/superadmin_schema.sql
```

### 2. Backend Environment (`backend/.env`)
```env
PORT=3000
ADMIN_USER=admin
ADMIN_PASSWORD=your_password
JWT_SECRET=your_jwt_key
PGHOST=localhost
PGDATABASE=your_db
VCENTER_HOST=...
ILO_HOST_1=...
# ... RDU, SMTP, Camera, and Biometric settings
```

### 3. Services Execution
**Backend**:
```bash
cd backend && npm install && npm run dev
```

**ML Service**:
```bash
cd ml_service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

**Person Detection Service**:
```bash
cd person_detection_service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
Copy `person_detection_service/.env.example` to `person_detection_service/.env` if you want to tune detector thresholds or the service port.

**Frontend**:
```bash
cd frontend && npm install && npm run dev
```

---

## 📝 Configuration Highlights

### Alert Thresholds
Configurable via the SuperAdmin "Alert Rules" panel. Default thresholds include:
- CPU Usage: > 85%
- Memory Usage: > 85%
- Temperature: > 35°C
- Disk Usage: > 90%

### SMTP Settings
Required for email alerts. Supports SSL/TLS and customizable recipient/CC/BCC lists. 

---

## 🤝 Contributing
1. Ensure `bootstrapSql` in `backend/db/index.js` is updated if the schema changes.
2. Maintain the Glassmorphic design system using the tokens in `index.css`.
3. Document all new API endpoints in the `README.md`.
