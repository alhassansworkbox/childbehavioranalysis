# 🦷 تحليل صحة وسلوك طفلك — Aladdin Pediatric Dental Clinic

تطبيق ويب عربي (RTL) يقدّم للأهل تحليلاً مخصصاً لصحة أسنان وعادات طفلهم، ويولّد Leads مؤهّلة داخل قاعدة بيانات Notion لعيادة علاء الدين لطب أسنان الأطفال.

A mobile-first, Arabic RTL assessment wizard. Parents answer 12 questions; the app scores four health dimensions, generates a **fully personalized** report + improvement plan, shows a WhatsApp CTA, and saves every lead to a Notion database. Includes a hidden admin dashboard.

---

## ✨ What's inside

| Path | Purpose |
|---|---|
| `server.js` | Express server — serves the pages + proxies to the Notion API |
| `index.html` | The whole assessment app (styles + wizard + scoring + report engine, all inline) |
| `admin.html` | Hidden dashboard at `/admin` (self-contained) |
| `package.json` | Dependencies + start script |
| `render.yaml` | One-click Render Blueprint config |

**All files sit at the project root — there is no `public/` subfolder.** This is intentional so hosting never gets confused about where `server.js` is.

---

## 🧮 Scoring model (max = 120)

| Dimension | Questions | Max |
|---|---|---|
| صحة الفم والأسنان (Oral Health) | 1, 2, 3, 4, 8 | 50 |
| التغذية (Nutrition) | 5, 6, 7 | 30 |
| النشاط (Activity) | 9, 10 | 20 |
| العادات اليومية (Daily Habits) | 11, 12 | 20 |

**Result bands:** `90–120` 🟢 بطل صحة · `60–89` 🟡 على الطريق الصحيح · `< 60` 🔴 يحتاج اهتمام أكثر.

**Auto-rules** (enforced on the server): Total `< 60` ⇒ `High Risk Flag = true`, `Needs Follow Up = true`. Every submission ⇒ `Lead Status = New Lead`.

---

## 🗄️ Notion database

The **Child Analysis** database is already created in your workspace:

- **Database ID:** `c58f0dbe-be75-424b-9b0d-31b23a86496f`
- Location: under the *Aladdin Dental Clinic* page.

You only need to connect an integration to it (below). If you ever recreate it, keep the same property names — the server maps to them exactly.

---

## 🚀 Setup (local)

```bash
# 1. install
npm install

# 2. configure — create a .env file in the project root:
#   NOTION_API_KEY=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   NOTION_DATABASE_ID=c58f0dbe-be75-424b-9b0d-31b23a86496f
#   ADMIN_KEY=choose-a-strong-password
#   WHATSAPP_NUMBER=9647861111304

# 3. run
npm start
# → http://localhost:3000        (assessment)
# → http://localhost:3000/admin  (dashboard)
```

### Getting `NOTION_API_KEY`
1. Go to <https://www.notion.so/my-integrations> → **New integration** → internal → copy the secret (starts with `ntn_`).
2. Open the **Child Analysis** database in Notion → `•••` menu → **Connections** → add your integration.
   *(Without this step the API returns 404/permission errors.)*

---

## ☁️ Deploy on Render (foolproof)

**The #1 rule: `server.js` must be at the TOP level of your GitHub repo — not inside any folder. Leave Render's "Root Directory" EMPTY.**

Easiest path — upload through GitHub's website:
1. Unzip `aladdin-child-analysis.zip`. You'll see `server.js`, `index.html`, `admin.html`, `package.json`, `render.yaml` — loose files, no wrapper folder.
2. On GitHub: **New repository** → after creating it, click **"uploading an existing file"** → drag **all those loose files** in (select the files, not the folder) → **Commit**.
3. Open the repo — you should see `server.js` immediately on the first page. ✅
4. Render → **New → Web Service** → pick the repo. Because `render.yaml` is included, build/start are auto-filled:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - **Root Directory: leave blank**
5. Add env vars: `NOTION_API_KEY` and `ADMIN_KEY` (the other two are prefilled by `render.yaml`).
6. **Create Web Service.**

If you ever see `Cannot find module '.../server.js'` → your files are inside a subfolder in the repo. Fix by moving them to the root (or set Render's Root Directory to that exact folder name).

---

## 🔗 Point the flyer QR code here

The printed flyer's "قيمنا" QR can point to your deployed URL (e.g. `https://aladdin-analysis.onrender.com`). Every scan becomes a scored lead in Notion.

---

## 🔒 Notes

- The Notion secret lives **only** on the server; the browser never sees it.
- `/admin` is unlinked and gated by `ADMIN_KEY` (sent as `x-admin-key`). Change the default password.
- Parent data is collected for clinic follow-up only — add a short privacy line to the flyer/landing if required locally.
- Phone validation expects Iraqi format `07XXXXXXXXX`. Adjust the regex in `app.js` and `server.js` if you expand regions.
