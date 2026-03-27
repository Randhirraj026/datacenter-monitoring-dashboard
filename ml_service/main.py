from fastapi import FastAPI, HTTPException, Query
import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import os
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

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
        database=os.getenv("PGDATABASE", "superadmin_db"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", "Kristellar@1980")
    )

@app.get("/predict")
def predict(host_id: int, metric: str, time_range: str = Query(..., alias="range", description="24h or 7d")):
    if metric not in ["cpu", "memory", "power", "temperature"]:
        raise HTTPException(status_code=400, detail="Invalid metric")
    
    forecast_hours = 24 if time_range == "24h" else 168
    
    cache_key = (host_id, metric, forecast_hours)
    if cache_key in cache:
        logger.info(f"Returning cached predictions for {cache_key}")
        return {
            "metric": metric,
            "range": time_range,
            "predictions": cache[cache_key]
        }
        
    logger.info(f"Training and predicting for {cache_key}")
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # We fetch last 7 days for 24h forecast, and last 30 days for 7d forecast
        days_history = 7 if forecast_hours <= 24 else 30
        
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
            return {"metric": metric, "range": time_range, "predictions": []}
            
        df = pd.DataFrame(rows)
        # Ensure timestamp is datetime
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # Run prediction
        predictions = train_and_predict_lstm(df, metric, forecast_hours)
        
        cache[cache_key] = predictions
        
        return {
            "metric": metric,
            "range": time_range,
            "predictions": predictions
        }

    except Exception as e:
        logger.error(f"Error during prediction: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
