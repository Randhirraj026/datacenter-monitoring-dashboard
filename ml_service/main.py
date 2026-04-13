from fastapi import FastAPI, HTTPException, Query
import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import os
from pathlib import Path
from dotenv import load_dotenv
import logging
from model import train_and_predict_lstm
import cachetools
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(title="ML Forecasting Service")

# Cache to store predictions. Key: (host_id, metric, forecast_hours). TTL: 1 hour
cache = cachetools.TTLCache(maxsize=100, ttl=3600)
ARCHIVES_DIR = Path(__file__).resolve().parents[1] / "archives"

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
        database=os.getenv("PGDATABASE", "superadmin_db"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", "Kristellar@1980")
    )

def load_archived_host_metrics(host_id: int, days_history: int) -> pd.DataFrame:
    if not ARCHIVES_DIR.exists():
        return pd.DataFrame()

    cutoff = pd.Timestamp.utcnow() - pd.Timedelta(days=days_history)
    frames = []

    for csv_path in ARCHIVES_DIR.glob("*/host_metrics.csv"):
        try:
            df = pd.read_csv(csv_path)
        except Exception as exc:
            logger.warning(f"Skipping archive file {csv_path}: {exc}")
            continue

        if df.empty or "host_id" not in df.columns or "ts" not in df.columns:
            continue

        df["timestamp"] = pd.to_datetime(df["ts"], errors="coerce", utc=True)
        df = df[df["host_id"].astype(str) == str(host_id)]
        df = df[df["timestamp"].notna()]
        df = df[df["timestamp"] >= cutoff]
        if df.empty:
            continue

        frames.append(pd.DataFrame({
            "timestamp": df["timestamp"],
            "cpu": pd.to_numeric(df.get("cpu_usage_pct"), errors="coerce"),
            "memory": pd.to_numeric(df.get("memory_usage_pct"), errors="coerce"),
            "power": pd.to_numeric(df.get("power_kw"), errors="coerce"),
            "temperature": pd.to_numeric(df.get("temperature_c"), errors="coerce"),
        }))

    if not frames:
        return pd.DataFrame()

    return pd.concat(frames, ignore_index=True)

def load_db_host_metrics(host_id: int, days_history: int) -> pd.DataFrame:
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    query = f"""
        SELECT 
            ts as timestamp,
            cpu_usage_pct as cpu,
            memory_usage_pct as memory,
            power_kw as power,
            temperature_c as temperature
        FROM host_metrics
        WHERE host_id = %s AND ts >= NOW() - INTERVAL '{days_history} days'
        ORDER BY ts ASC;
    """

    cursor.execute(query, (host_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    if not rows:
        return pd.DataFrame(columns=["timestamp", "cpu", "memory", "power", "temperature"])

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    return df

def load_training_history(host_id: int, days_history: int) -> pd.DataFrame:
    db_df = load_db_host_metrics(host_id, days_history)
    archive_df = load_archived_host_metrics(host_id, days_history)

    combined = pd.concat([archive_df, db_df], ignore_index=True)
    if combined.empty:
        return combined

    combined = combined.dropna(subset=["timestamp"])
    combined = combined.sort_values("timestamp")
    combined = combined.drop_duplicates(subset=["timestamp"], keep="last")
    return combined

@app.get("/predict")
def predict(host_id: int, metric: str, time_range: str = Query(..., alias="range", description="24h or 7d")):
    if metric not in ["cpu", "memory", "power", "temperature"]:
        raise HTTPException(status_code=400, detail="Invalid metric")
    
    forecast_hours = 24 if time_range == "24h" else 168
    
    cache_key = (host_id, metric, forecast_hours)
    if cache_key in cache:
        logger.info(f"Returning cached predictions for {cache_key}")
        cached = cache[cache_key]
        if isinstance(cached, dict) and "predictions" in cached:
            return {
                "metric": metric,
                "range": time_range,
                "predictions": cached["predictions"],
                "metrics": cached.get("metrics", {})
            }
        return {
            "metric": metric,
            "range": time_range,
            "predictions": cached
        }
        
    logger.info(f"Training and predicting for {cache_key}")
        
    try:
        # We fetch last 7 days for 24h forecast, and last 30 days for 7d forecast
        days_history = 7 if forecast_hours <= 24 else 30

        df = load_training_history(host_id, days_history)
        logger.info(f"Prediction training rows for host={host_id}, metric={metric}: {len(df)}")

        if df.empty:
            return {"metric": metric, "range": time_range, "predictions": []}
        
        # Run prediction
        predictions_data = train_and_predict_lstm(df, metric, forecast_hours)
        
        cache[cache_key] = predictions_data
        
        if isinstance(predictions_data, dict) and "predictions" in predictions_data:
            return {
                "metric": metric,
                "range": time_range,
                "predictions": predictions_data["predictions"],
                "metrics": predictions_data.get("metrics", {})
            }
        return {
            "metric": metric,
            "range": time_range,
            "predictions": predictions_data
        }

    except Exception as e:
        logger.error(f"Error during prediction: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
