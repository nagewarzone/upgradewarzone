async function loginUser(username, password) {
  const res = await fetch('/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username, password })
  });
  const data = await res.json();
  if (data.success) {
    console.log('Login success:', data);
  } else {
    console.error('Login failed:', data.message);
  }
}
