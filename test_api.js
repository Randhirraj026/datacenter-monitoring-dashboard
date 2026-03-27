async function test() {
  try {
    const login = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'superadmin', password: 'Kris@2025$1980' })
    });
    const loginData = await login.json();
    const token = loginData.token;

    console.log("Got token:", token ? "Yes" : "No");

    const res = await fetch('http://localhost:3000/api/superadmin/predict?host_id=1&metric=cpu&range=24h', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
        console.log('Error Status:', res.status);
        console.log('Error Body:', await res.text());
    } else {
        console.log('Success:', await res.json());
    }
  } catch (err) {
    console.log("Exception:", err);
  }
}
test();
