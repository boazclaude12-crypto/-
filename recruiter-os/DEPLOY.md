# פריסה

המערכת היא תהליך Node אחד עם **מסד נתונים מקומי (SQLite)** וקבצי קורות חיים על הדיסק.
זה מה שמכתיב איפה היא יכולה לרוץ.

---

## הבחירה בקצרה

| יעד | עובד כמו שהוא? | מה נדרש |
|---|---|---|
| Railway / Render / Fly.io / VPS | ✅ כן | לחבר Volume ל-`/app/data`. אפס שינויי קוד. |
| Docker בכל מקום | ✅ כן | ה-`Dockerfile` שבתיקייה |
| מקומי | ✅ כן | `npm run dev` |
| **Vercel / Netlify / Lambda** | ❌ **לא** | ראה "למה לא Vercel" |

---

## למה לא Vercel (בינתיים)

שלוש סיבות, ואף אחת מהן אינה באג:

1. **מערכת הקבצים ב-Vercel זמנית.** קובץ ה-SQLite וקורות החיים שמועלים נכתבים לדיסק.
   בכל deploy — ולעיתים בין בקשות — הדיסק מתאפס. כלומר: כל הנתונים נמחקים.
2. **שכבת הנתונים סינכרונית.** `Db.all()` מחזיר `T[]`, לא `Promise<T[]>`, וכך גם כל
   שירותי הדומיין שמעליה. כל מסד נתונים ברשת (Postgres, Turso, PlanetScale) הוא
   אסינכרוני, ולכן המעבר דורש להפוך את כל השכבה ל-`async` — לא רק להחליף מימוש.
   זו עבודה אמיתית, לא קובץ קונפיגורציה.
3. **קבצים** יצטרכו לעבור לאחסון אובייקטים (Vercel Blob / S3) במקום הדיסק.

**מה שנדרש כדי להעלות ל-Vercel:** להפוך את `src/lib/db` ואת `src/lib/domain` ל-async,
לכתוב מיגרציות בדיאלקט של Postgres, ולהחליף את `src/lib/documents/storage.ts` באחסון
אובייקטים. ה-`Db` interface אכן מבודד את נקודת המגע — אבל השינוי לא מסתיים בו.

---

## Railway (הדרך המהירה ביותר לכתובת חיה)

1. חשבון ב-[railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. בחר את הריפו. Railway מזהה את ה-`Dockerfile` לבד.
3. **Variables** — הגדר:
   ```
   AUTH_SECRET=<הרץ: openssl rand -hex 32>
   DATABASE_FILE=/app/data/recruiter.db
   UPLOAD_DIR=/app/data/uploads
   AI_PROVIDER=local
   ```
4. **Settings → Volumes → Add Volume**, mount path: `/app/data`.
   בלי זה הנתונים נמחקים בכל deploy.
5. Deploy. בכניסה הראשונה הסכימה נוצרת אוטומטית (28 טבלאות), ואז נרשמים דרך `/register`.

לטעינת נתוני דמו: התחבר → **הגדרות → טעינת נתוני דמו**.

## Render

זהה ברוחו: **New → Web Service**, סביבה Docker, אותם משתני סביבה, ותחת **Disks**
להוסיף דיסק ב-mount path `/app/data`.

## Fly.io

```bash
fly launch --no-deploy          # מזהה את ה-Dockerfile
fly volumes create data --size 1
fly secrets set AUTH_SECRET=$(openssl rand -hex 32)
fly deploy
```
ב-`fly.toml` להוסיף:
```toml
[[mounts]]
  source = "data"
  destination = "/app/data"
```

## VPS רגיל (בלי Docker)

```bash
git clone <repo> && cd recruiter-os
npm ci && npm run build
export AUTH_SECRET=$(openssl rand -hex 32)
npm start                       # פורט 3100
```
מומלץ מאחורי nginx עם TLS, ותחת `systemd` או `pm2` כדי שיעלה מחדש לבד.

---

## גיבוי

כל המצב נמצא בתיקייה אחת. גיבוי = העתקה של `data/`:

```bash
sqlite3 data/recruiter.db ".backup '/backup/recruiter-$(date +%F).db'"
tar czf /backup/uploads-$(date +%F).tar.gz data/uploads
```

SQLite רץ ב-WAL, ולכן יש גם `recruiter.db-wal`. השתמש ב-`.backup` ולא בהעתקת הקובץ
בזמן שהשרת חי — העתקה גולמית עלולה לתפוס מצב לא עקבי.

---

## רשימת בדיקה לפני עלייה לאוויר

- [ ] `AUTH_SECRET` הוגדר ובאורך 32 תווים ומעלה. **בלעדיו השרת מסרב לעלות ב-production** — במכוון.
- [ ] Volume מחובר ל-`/app/data`.
- [ ] HTTPS פעיל. עוגיית ההתחברות מסומנת `Secure` ב-production ולא תישלח על HTTP.
- [ ] גיבוי מתוזמן ל-`data/`.
- [ ] `npm test` ו-`npm run build` עוברים.
