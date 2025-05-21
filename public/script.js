const apiURL = '/proxy'; // เรียก backend API

// ฟังก์ชันช่วย fetch POST และรับ JSON ตอบกลับ
async function postAPI(data) {
  try {
    const res = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (error) {
    console.error('API error:', error);
    return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ API' };
  }
}

// ตัวอย่าง: ลงทะเบียนผู้ใช้
async function register(username, password) {
  const data = { action: 'register', username, password };
  const result = await postAPI(data);
  if (result.success) {
    alert('สมัครสมาชิกสำเร็จ!');
  } else {
    alert('สมัครสมาชิกไม่สำเร็จ: ' + result.message);
  }
}

// ตัวอย่าง: เข้าสู่ระบบ
async function login(username, password) {
  const data = { action: 'login', username, password };
  const result = await postAPI(data);
  if (result.success) {
    alert('เข้าสู่ระบบสำเร็จ');
    // เก็บข้อมูลผู้ใช้ไว้ใน localStorage หรือแสดงในหน้าเว็บต่อได้
    localStorage.setItem('username', username);
    localStorage.setItem('password', password);
    // แสดงข้อมูล user
    console.log('User info:', result);
  } else {
    alert('เข้าสู่ระบบไม่สำเร็จ: ' + result.message);
  }
}

// ตัวอย่าง: ดึงข้อมูลผู้ใช้
async function getUserInfo(username, password) {
  const data = { action: 'userinfo', username, password };
  const result = await postAPI(data);
  if (result.success) {
    console.log('ข้อมูลผู้ใช้:', result);
    return result;
  } else {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + result.message);
    return null;
  }
}

// ตัวอย่าง: ใช้พ้อยท์แลกไอเท็ม TOPGM
async function usePoint(username, password, name, pointChange, topgmChange) {
  const data = {
    action: 'usepoint',
    username,
    password,
    name,
    pointChange,
    topgmChange
  };
  const result = await postAPI(data);
  if (result.success) {
    alert('แลกพ้อยท์สำเร็จ!');
  } else {
    alert('แลกพ้อยท์ไม่สำเร็จ: ' + result.message);
  }
}

// ตัวอย่าง: อัปเกรดไอเท็ม TOPGM เป็น Warzone
async function upgradeItem(username, password, name) {
  const data = {
    action: 'upgrade',
    username,
    password,
    name
  };
  const result = await postAPI(data);
  if (result.success) {
    alert('ผลการอัปเกรด: ' + result.resultMessage);
  } else {
    alert('อัปเกรดไม่สำเร็จ: ' + result.message);
  }
}

// ตัวอย่างการใช้งานฟังก์ชัน
// register('user1', 'pass1');
// login('user1', 'pass1');
// getUserInfo('user1', 'pass1');
// usePoint('user1', 'pass1', 'ชื่อตัวละคร', -10, 1);
// upgradeItem('user1', 'pass1', 'ชื่อตัวละคร');
