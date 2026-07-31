/* ============================================================
   عيادة علاء الدين لطب أسنان الأطفال
   تحليل صحة وسلوك طفلك — Backend server
   Serves the RTL web app + proxies to the Notion API.
   ============================================================ */

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const {
  NOTION_API_KEY,
  NOTION_DATABASE_ID = 'c58f0dbe-be75-424b-9b0d-31b23a86496f',
  ADMIN_KEY,
  WHATSAPP_NUMBER = '9647861111304',
  PORT = 3000,
} = process.env;

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/* ---- helpers ---------------------------------------------------------- */

// Notion rich_text / title cells cap at 2000 chars per text object.
function richText(value) {
  const text = String(value == null ? '' : value).slice(0, 1900);
  return [{ type: 'text', text: { content: text } }];
}
function title(value) {
  return [{ type: 'text', text: { content: String(value || '').slice(0, 200) } }];
}
function num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

// Expose the public WhatsApp number to the frontend without a rebuild.
app.get('/api/config', (_req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER });
});

/* ---- submit a completed assessment ----------------------------------- */

app.post('/api/submit', async (req, res) => {
  if (!NOTION_API_KEY) {
    return res.status(500).json({ ok: false, error: 'NOTION_API_KEY غير مضبوط على الخادم.' });
  }

  const b = req.body || {};

  // Minimal server-side validation.
  if (!b.childName || String(b.childName).trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'اسم الطفل مطلوب.' });
  }
  if (!/^07\d{9}$/.test(String(b.parentPhone || '').replace(/\s/g, ''))) {
    return res.status(400).json({ ok: false, error: 'رقم الهاتف غير صحيح.' });
  }

  const total = num(b.totalScore);

  // Auto-rules (safety net — enforced on the server regardless of client).
  const highRisk = total < 60;
  const needsFollowUp = total < 60;
  const leadStatus = 'New Lead';

  const properties = {
    'Child Name': { title: title(b.childName) },
    'Parent Phone Number': { phone_number: String(b.parentPhone).trim() },
    'Oral Health Score': { number: num(b.oralScore) },
    'Nutrition Score': { number: num(b.nutritionScore) },
    'Activity Score': { number: num(b.activityScore) },
    'Daily Habits Score': { number: num(b.habitsScore) },
    'Total Score': { number: total },
    'Risk Factors': { rich_text: richText(b.riskFactors) },
    'Recommendations': { rich_text: richText(b.recommendations) },
    'Generated Report': { rich_text: richText(b.generatedReport) },
    'High Risk Flag': { checkbox: !!highRisk },
    'Needs Follow Up': { checkbox: !!needsFollowUp },
  };

  // Select fields — only send when we have a value (Notion rejects empty names).
  if (b.childAge) properties['Child Age'] = { select: { name: b.childAge } };
  if (b.childGender) properties['Child Gender'] = { select: { name: b.childGender } };
  if (b.mainConcern) properties['Main Concern'] = { select: { name: b.mainConcern } };
  if (b.healthStatus) properties['Health Status'] = { select: { name: b.healthStatus } };
  properties['Lead Status'] = { select: { name: leadStatus } };

  try {
    const r = await fetch(`${NOTION_BASE}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Notion create page failed:', r.status, detail);
      return res.status(502).json({ ok: false, error: 'تعذّر حفظ البيانات، حاولوا مرة ثانية.' });
    }

    const page = await r.json();
    return res.json({ ok: true, id: page.id });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ ok: false, error: 'خطأ غير متوقع بالخادم.' });
  }
});

/* ---- admin dashboard stats ------------------------------------------- */

function checkAdmin(req) {
  const key = req.get('x-admin-key') || req.query.key;
  return ADMIN_KEY && key === ADMIN_KEY;
}

async function queryAllRows() {
  const rows = [];
  let cursor;
  do {
    const r = await fetch(`${NOTION_BASE}/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!r.ok) throw new Error(`Notion query ${r.status}: ${await r.text()}`);
    const data = await r.json();
    rows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return rows;
}

const readTitle = (p) => (p?.title?.[0]?.plain_text) || '';
const readNumber = (p) => (typeof p?.number === 'number' ? p.number : null);
const readSelect = (p) => p?.select?.name || null;
const readCheckbox = (p) => !!p?.checkbox;
const readPhone = (p) => p?.phone_number || '';

app.get('/api/admin/stats', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ ok: false, error: 'كلمة مرور غير صحيحة.' });
  if (!NOTION_API_KEY) return res.status(500).json({ ok: false, error: 'NOTION_API_KEY غير مضبوط.' });

  try {
    const rows = await queryAllRows();
    const props = rows.map((r) => r.properties || {});

    const totals = props.map((p) => readNumber(p['Total Score'])).filter((n) => n != null);
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, c) => a + c, 0) / arr.length) : 0);

    // Most frequent main concern.
    const concernCounts = {};
    props.forEach((p) => {
      const c = readSelect(p['Main Concern']);
      if (c) concernCounts[c] = (concernCounts[c] || 0) + 1;
    });
    const topConcern =
      Object.entries(concernCounts).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    const highRisk = props.filter((p) => readCheckbox(p['High Risk Flag'])).length;
    const followUp = props.filter((p) => readCheckbox(p['Needs Follow Up'])).length;

    const statusCounts = {};
    props.forEach((p) => {
      const s = readSelect(p['Health Status']);
      if (s) statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    const latest = rows.slice(0, 12).map((r) => {
      const p = r.properties || {};
      return {
        name: readTitle(p['Child Name']),
        phone: readPhone(p['Parent Phone Number']),
        age: readSelect(p['Child Age']),
        concern: readSelect(p['Main Concern']),
        total: readNumber(p['Total Score']),
        status: readSelect(p['Health Status']),
        leadStatus: readSelect(p['Lead Status']),
        highRisk: readCheckbox(p['High Risk Flag']),
        date: r.created_time,
      };
    });

    res.json({
      ok: true,
      totalAssessments: rows.length,
      averageTotal: avg(totals),
      averageOral: avg(props.map((p) => readNumber(p['Oral Health Score'])).filter((n) => n != null)),
      averageNutrition: avg(props.map((p) => readNumber(p['Nutrition Score'])).filter((n) => n != null)),
      averageActivity: avg(props.map((p) => readNumber(p['Activity Score'])).filter((n) => n != null)),
      averageHabits: avg(props.map((p) => readNumber(p['Daily Habits Score'])).filter((n) => n != null)),
      topConcern: { name: topConcern[0], count: topConcern[1] },
      concernCounts,
      statusCounts,
      highRiskCount: highRisk,
      followUpCount: followUp,
      latest,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(502).json({ ok: false, error: 'تعذّر جلب البيانات من Notion.' });
  }
});

/* ---- routes ----------------------------------------------------------- */

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`\n🦷  Aladdin Child Analysis running on http://localhost:${PORT}`);
  console.log(`    Admin dashboard: http://localhost:${PORT}/admin`);
  if (!NOTION_API_KEY) console.log('    ⚠️  NOTION_API_KEY is not set — submissions will fail until you add it.\n');
});
