import urllib.request
import json

try:
    url = "http://localhost:8000/predict?host_id=1&metric=cpu&range=24h"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        data = json.loads(response.read().decode())
        print("Success, predictions count:", len(data.get('predictions', [])))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Body:", e.read().decode())
except Exception as e:
    print("Other Error:", e)
