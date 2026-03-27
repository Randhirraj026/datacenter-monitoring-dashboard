import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from sklearn.preprocessing import MinMaxScaler
from datetime import timedelta

class LSTMModel(nn.Module):
    def __init__(self, input_size=1, hidden_layer_size=50, output_size=1):
        super().__init__()
        self.hidden_layer_size = hidden_layer_size
        self.lstm = nn.LSTM(input_size, hidden_layer_size)
        self.linear = nn.Linear(hidden_layer_size, output_size)

    def forward(self, input_seq):
        lstm_out, _ = self.lstm(input_seq.view(len(input_seq), 1, -1))
        predictions = self.linear(lstm_out.view(len(input_seq), -1))
        return predictions[-1]

def create_inout_sequences(input_data, tw):
    inout_seq = []
    L = len(input_data)
    for i in range(L - tw):
        train_seq = input_data[i:i+tw]
        train_label = input_data[i+tw:i+tw+1]
        inout_seq.append((train_seq, train_label))
    return inout_seq

def train_and_predict_lstm(df: pd.DataFrame, metric: str, forecast_hours: int = 24):
    if df.empty or metric not in df.columns:
        return []

    # Filter out null values
    df = df.dropna(subset=[metric])
    if len(df) < 50:
        return []

    # Sort by timestamp
    df = df.sort_values('timestamp')
    
    # We assume timestamps are every 2 minutes. Which means 30 items per hour.
    steps_to_forecast = forecast_hours * 30
    
    scaler = MinMaxScaler(feature_range=(-1, 1))
    data_normalized = scaler.fit_transform(df[metric].values.reshape(-1, 1))
    
    train_data = torch.FloatTensor(data_normalized).view(-1)
    
    # Using last 4 hours (120 points) as sequence window to learn the curve/shape better
    train_window = min(120, len(train_data) - 10) 
    train_inout_seq = create_inout_sequences(train_data, train_window)
    
    model = LSTMModel()
    loss_function = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    # Train the model
    # Keep epochs low for fast retraining suitable for an interactive API 
    epochs = 15 
    for i in range(epochs):
        for seq, labels in train_inout_seq:
            optimizer.zero_grad()
            y_pred = model(seq)
            single_loss = loss_function(y_pred, labels)
            single_loss.backward()
            optimizer.step()

    model.eval()
    test_inputs = train_data[-train_window:].tolist()
    
    # Generating predictions step by step
    for i in range(steps_to_forecast):
        seq = torch.FloatTensor(test_inputs[-train_window:])
        with torch.no_grad():
            raw_pred = model(seq).item()
            
            # Dampen extreme spikes smoothly using an exponential moving average
            recent_ma = np.mean(test_inputs[-20:]) if len(test_inputs) >= 20 else raw_pred
            
            # Start trusting the raw prediction, but slowly shift trust to the moving average
            # as we get further into the future to prevent the limit-cycle (looping) effect
            trust_factor = max(0.2, 1.0 - (i / steps_to_forecast))
            smoothed_pred = (raw_pred * trust_factor) + (recent_ma * (1 - trust_factor))
            
            test_inputs.append(smoothed_pred)
            
    actual_predictions = scaler.inverse_transform(np.array(test_inputs[train_window:]).reshape(-1, 1))
    
    last_timestamp = pd.to_datetime(df['timestamp'].iloc[-1])
    historical_values = df[metric].astype(float).values
    
    results = []
    current_time = last_timestamp
    
    # Calculate exactly how jittery this specific metric is historically
    historical_std = float(np.std(historical_values))
    
    for val in actual_predictions:
        current_time += timedelta(minutes=2)
        
        # Add realistic micro-noise strictly based on the metric's actual historical variance
        # If the history is completely flat (std = ~0), the noise will be practically 0.
        noise = float(np.random.normal(0, max(0.01, historical_std * 0.6)))
        realistic_val = float(val[0]) + noise
        
        # Prevent negative values for metrics
        realistic_val = max(0.1, realistic_val)
        
        results.append({
            "timestamp": current_time.isoformat(),
            "value": float(realistic_val)
        })
        
    return results
