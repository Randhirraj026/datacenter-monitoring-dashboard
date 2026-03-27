# Data Center Monitoring Dashboard & AI Forecasting

A high-performance, full-stack operational intelligence platform designed to monitor enterprise IT infrastructure. This system natively integrates with VMware vSphere and HPE iLO to aggregate real-time hardware telemetry and virtual machine lifecycle data. It features a dedicated Machine Learning forecasting layer powered by PyTorch LSTMs to predict cluster performance trends.

## Core Features

- **vSphere Integration:** Automatically synchronizes Datastores, VM states, and cluster-wide compute (CPU/Mem) allocations via SOAP and REST APIs.
- **HPE iLO Redfish API:** Directly polls iLO management ports for physical inlet temperatures, fan speeds, and realtime power consumption (Wattage).
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

## Folder Structure
```text
.
├── backend/          # Node.js Express server (APIs, vSphere/iLO Workers)
├── frontend/         # React SPA (Vite) User Interfaces
├── database/         # Original PostgreSQL Schemas and queries
├── ml_service/       # Python Forecasting Model (FastAPI)
└── README.md
```

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

### 4. React Frontend
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173/` in your local browser to access the dashboard.
