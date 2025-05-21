const express = require('express');   
const cors = require('cors');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const path = require('path');
const fetch = require('node-fetch'); // ใช้ส่งข้อความ Discord webhook


// เริ่มต้น Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

db.collection('users').limit(1).get()
  .then(() => console.log('Firestore เชื่อมต่อได้!'))
  .catch(err => console.error('Firestore connect error:', err));

const app = express();
const port = process.env.PORT || 3000;  // fallback port สำหรับ local

app.use(cors());
// ใช้ express built-in json parser แทน body-parser
app.use(express.json());

// เสิร์ฟ static HTML, CSS, JS จากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

/**
 * ฟังก์ชันส่งข้อความแจ้งเตือนไปยัง Discord webhook
 * @param {string} message ข้อความที่จะส่ง
 * @param {object|null} embed (optional) ถ้ามี embed object จะส่งแทนข้อความธรรมดา
 */
async function sendDiscord(message, embed = null) {
  const webhookURL = process.env.DISCORD_WEBHOOK_URL;
  try {
    const body = embed ? { embeds: [embed] } : { content: message };
    await fetch(webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error('ส่งข้อความ Discord ล้มเหลว:', error);
  }
}

// กำหนดรหัสผ่าน admin ไว้ที่นี่ (เปลี่ยนเป็นรหัสที่ปลอดภัยจริง)
// ดึงค่า username และ password จาก environment variables หรือใช้ค่า default
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Middleware สำหรับตรวจสอบ admin ผ่าน header 'x-admin-password'
function adminAuth(req, res, next) {
  const adminPass = req.headers['x-admin-password'];
  if (!adminPass || adminPass !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  next();
}

// API สำหรับ admin login โดยเช็ค username และ password จาก body กับ env vars
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });
  }

  if (
    username === ADMIN_USERNAME &&
    password === ADMIN_PASSWORD
  ) {
    // ถ้าต้องการให้ระบบปลอดภัยขึ้น อาจสร้าง token จริง ๆ หรือ session ได้
    return res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token: 'dummy-admin-token' });
  } else {
    return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
});

// --- API สำหรับผู้ใช้ทั่วไป ลงทะเบียน / เข้าสู่ระบบ / ใช้พ้อยท์ / อัปเกรด ---
app.post('/proxy', async (req, res) => {
  const { action, username, password, name, pointChange, topgmChange } = req.body;

  if (!action) return res.json({ success: false, message: 'Missing action' });

  try {
    const userRef = db.collection('users').doc(username);
    const userDoc = await userRef.get();

    if (action === 'register') {
      if (!username || !password) return res.json({ success: false, message: 'Missing username or password' });

      if (userDoc.exists) return res.json({ success: false, message: 'Username ซ้ำ' });

      await userRef.set({
        password,
        token: 0,
        topgm: 0,
        warzone: 0,
        point: 0
      });
      return res.json({ success: true });
    }

    if (!userDoc.exists) return res.json({ success: false, message: 'ไม่พบผู้ใช้' });
    const userData = userDoc.data();
    if (userData.password !== password) return res.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });

    if (action === 'login' || action === 'userinfo') {
      return res.json({ success: true, ...userData });
    }

    // ใช้พ้อยท์แลก topgm (แจ้งเตือน Discord ด้วยชื่อผู้เล่น)
    if (action === 'usepoint') {
      if (typeof pointChange !== 'number' || typeof topgmChange !== 'number') {
        return res.json({ success: false, message: 'Invalid pointChange or topgmChange' });
      }

      const displayName = req.body.name || username; // fallback เผื่อไม่มี name

      const currentPoint = userData.point || 0;
      const currentTopgm = userData.topgm || 0;

      const newPoint = currentPoint + pointChange;
      const newTopgm = currentTopgm + topgmChange;

      if (newPoint < 0) {
        return res.json({ success: false, message: 'POINT ไม่พอ' });
      }

      if (newTopgm < 0) {
        return res.json({ success: false, message: 'ไม่สามารถลบ topgm ได้มากกว่าที่มี' });
      }

      await userRef.update({ point: newPoint, topgm: newTopgm });

      // ใช้ชื่อตัวละครในข้อความแจ้งเตือนแทน username
      await sendDiscord(`${displayName} แลก ${Math.abs(pointChange)} พ้อยท์ ได้รับไอเท็ม TOPGM จำนวน ${Math.abs(topgmChange)} ชิ้น`);

      return res.json({ success: true });
    }

    // อัปเกรดไอเท็ม topgm เป็น warzone พร้อมแจ้งเตือน Discord
    if (action === 'upgrade') {
      const itemName = 'topgm';
      const hasItem = userData[itemName] || 0;
      let currentToken = userData.token || 0;
      let warzone = userData.warzone || 0;
      let topgm = hasItem;

      if (currentToken <= 0) {
        return res.json({ success: false, message: 'คุณไม่มี PEMTO สำหรับอัปเกรด' });
      }
      if (topgm <= 0) {
        return res.json({ success: false, message: 'คุณไม่มีไอเท็มสำหรับอัพเกรด' });
      }

      const rateDoc = await db.collection('upgraderates').doc(itemName).get();
      if (!rateDoc.exists) return res.json({ success: false, message: 'ไม่มีข้อมูลอัตราอัพเกรด' });

      const { successRate, failRate, breakRate } = rateDoc.data();
      if (
        typeof successRate !== 'number' || typeof failRate !== 'number' || typeof breakRate !== 'number' ||
        successRate < 0 || failRate < 0 || breakRate < 0 ||
        successRate + failRate + breakRate > 1
      ) {
        return res.json({ success: false, message: 'ข้อมูลอัตราอัพเกรดไม่ถูกต้อง' });
      }

      const roll = Math.random();
      let result = '';
      let logResult = '';
      let resultMessage = '';

      currentToken -= 1;

      if (roll < successRate) {
        result = 'success';
        topgm -= 1;
        warzone += 1;
        logResult = `สำเร็จ`;
        resultMessage = `อัพเกรดสำเร็จ: Warzone`;

        // ตัวอย่าง embed พร้อมรูปโล่
        const embed = { 
          title: `🎉 ${name || username} ได้อัพเกรด สำเร็จ !`,
          description: `ไอเท็มมีระดับสูงขึ้นเป็น "Warzone S.GOD+7"!!`,
          color: 0x00FF00, // สีเขียวสดใส
          image: {
            url: "https://img5.pic.in.th/file/secure-sv1/image_2025-05-21_025140493-removebg-preview.png"
          },
          footer: {
            text: "ได้รับไอเท็ม Warzone S.GOD+7"
          },
          timestamp: new Date().toISOString()
        };

        await sendDiscord(null, embed);

      } else if (roll < successRate + failRate) {
        result = 'fail';
        logResult = `ล้มเหลว`;
        resultMessage = `อัพเกรดไม่สำเร็จ (TOPGM ยังอยู่)`;
        await sendDiscord(`\u00A0\u00A0\u00A0\u00A0${name || username}\u00A0\u00A0 ⚠️\u00A0\u00A0 ได้อัพเกรด \u00A0\u00A0ปลอกTOPGM ล้มเหลว!\u00A0 ขอให้โชคดีครั้งหน้า`);
      } else {
        result = 'broken';
        topgm -= 1;
        logResult = `แตก`;
        resultMessage = `อัพเกรดล้มเหลว ไอเท็มสูญหาย (TOPGM หาย)`;
        await sendDiscord(`\u00A0\u00A0\u00A0\u00A0${name || username}\u00A0\u00A0 💥\u00A0\u00A0 ได้อัพเกรด \u00A0\u00A0ปลอกTOPGM แตกหาย!!\u00A0 ขอให้โชคดีครั้งหน้า`);
      }

      await userRef.update({
        token: currentToken,
        topgm: topgm,
        warzone: warzone
      });

      await db.collection('logs').add({
        username,
        name: name || username,
        action: 'upgrade',
        item: 'topgm',
        result: logResult,
        timestamp: new Date()
      });

      return res.json({ success: true, result, message: resultMessage });
    }

    return res.json({ success: false, message: 'ไม่รองรับ action นี้' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
  }
});


// --- API สำหรับ Admin ---
// ดู Log อัพเกรด
app.get('/logs', adminAuth, async (req, res) => {
  try {
    const logsRef = db.collection('logs').orderBy('timestamp', 'desc').limit(100);
    const snapshot = await logsRef.get();

    const logs = [];
    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, logs });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Server error' });
  }
});

// ค้นหาผู้ใช้ (admin only)
app.get('/searchUser', adminAuth, async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json({ success: false, message: 'กรุณากรอกคำค้นหาอย่างน้อย 2 ตัวอักษร' });

  try {
    const usersRef = db.collection('users');

    // ใช้ documentId() แทน username field
    const snapshot = await usersRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAt(q)
      .endAt(q + '\uf8ff')
      .limit(20)
      .get();

    const users = [];
    snapshot.forEach(doc => {
      users.push({ username: doc.id, ...doc.data() });
    });

    res.json({ success: true, users });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Server Error' });
  }
});


// เริ่มฟังพอร์ต
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
