import React from "react";
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "מדיניות פרטיות | אשף המסחר",
  description: "כיצד אשף המסחר אוסף, משתמש ומגן על המידע שלך",
};

const UPDATED = "ספטמבר 2026";

function S({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-3 text-gray-900">{n}. {title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

const PROCESSORS = [
  ["Supabase", "מסד נתונים, ניהול חשבונות ואחסון קבצים", "האיחוד האירופי / אסיה"],
  ["OpenAI", "עיבוד תמונות הגרפים והפקת הניתוח", "ארצות הברית"],
  ["Vercel", "אירוח האתר והשרתים", "ארצות הברית"],
  ["ספקי סליקה (Stripe, Cardcom)", "עיבוד תשלומים וחיובי מנוי", "ארה״ב / ישראל"],
  ["Google Analytics", "סטטיסטיקת שימוש מצרפית", "ארצות הברית"],
  ["Meta Pixel", "מדידת אפקטיביות פרסום", "ארצות הברית"],
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ChevronLeft className="h-5 w-5" />חזרה לדף הבית
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="h-8 w-8 text-amber-500" />
            <h1 className="text-3xl font-bold text-gray-900">מדיניות פרטיות</h1>
          </div>
          <p className="text-sm text-gray-500 mb-8">
            אשף המסחר · עדכון אחרון: {UPDATED}
          </p>

          <div className="mb-8 p-5 rounded-xl bg-gray-50 border border-gray-200">
            <p className="text-gray-700 leading-relaxed">
              מסמך זה מסביר איזה מידע נאסף בעת השימוש באתר ובאפליקציית ״אשף המסחר״, לשם מה הוא
              משמש, עם מי הוא משותף ואילו זכויות עומדות לך. אנו אוספים את המידע המינימלי הדרוש
              להפעלת השירות.
            </p>
          </div>

          <S n={1} title="מי אנחנו">
            <p>
              מפעילי אשף המסחר, דרך מנחם בגין 146, תל אביב-יפו. לפניות בנושאי פרטיות:{" "}
              <strong>cryptoai043@gmail.com</strong>.
            </p>
          </S>

          <S n={2} title="איזה מידע אנו אוספים">
            <p><strong>מידע שאתה מוסר לנו:</strong></p>
            <ul className="list-disc mr-6 space-y-1">
              <li>שם וכתובת דוא״ל בעת ההרשמה</li>
              <li>תמונות גרפים שאתה מעלה לניתוח</li>
              <li>נתוני עסקאות שאתה מזין ביומן המסחר (נכס, מחירים, גודל פוזיציה, הערות)</li>
              <li>תוכן פניות שאתה שולח אלינו</li>
            </ul>

            <p className="pt-2"><strong>מידע הנאסף אוטומטית:</strong></p>
            <ul className="list-disc mr-6 space-y-1">
              <li>מספר הניתוחים שביצעת ומועדיהם — לצורך אכיפת מכסת השימוש</li>
              <li>נתוני שימוש כלליים: עמודים שנצפו, זמני שהייה, סוג דפדפן ומכשיר</li>
              <li>כתובת IP ומזהי התחברות, לצורכי אבטחה</li>
            </ul>

            <p className="pt-2">
              <strong>איננו אוספים</strong> פרטי כרטיס אשראי. פרטי התשלום נמסרים ישירות לספק הסליקה
              ואינם עוברים בשרתינו או נשמרים בהם.
            </p>
          </S>

          <S n={3} title="למה המידע משמש">
            <ul className="list-disc mr-6 space-y-1">
              <li>אספקת השירות — הפקת ניתוחים, שמירת היסטוריה וניהול יומן העסקאות</li>
              <li>ניהול חשבונך, המנוי והחיובים</li>
              <li>אכיפת מכסות שימוש בהתאם למסלול שרכשת</li>
              <li>שיפור השירות וזיהוי תקלות</li>
              <li>אבטחת המערכת ומניעת שימוש לרעה</li>
              <li>משלוח עדכונים ודיוור שיווקי — רק אם נתת לכך הסכמה, וניתן להסירה בכל עת</li>
            </ul>
            <p>
              <strong>איננו מוכרים את המידע שלך לצדדים שלישיים</strong> ואיננו משתמשים בתמונות
              שאתה מעלה לצרכים שאינם הפקת הניתוח עבורך.
            </p>
          </S>

          <S n={4} title="עיבוד באמצעות בינה מלאכותית">
            <p>
              כדי להפיק את הניתוח, תמונת הגרף שאתה מעלה נשלחת לעיבוד אצל ספק בינה מלאכותית חיצוני
              (OpenAI) הממוקם בארצות הברית. התמונה נשלחת לצורך הפקת הניתוח בלבד.
            </p>
            <p className="font-medium">
              אנא הימנע מהעלאת תמונות המכילות מידע אישי רגיש — כגון צילומי מסך שבהם נראים שם החשבון,
              יתרות, מספרי חשבון או פרטים מזהים אחרים. חתוך את התמונה כך שתכלול את הגרף בלבד.
            </p>
          </S>

          <S n={5} title="שיתוף מידע עם ספקים">
            <p>אנו נעזרים בספקי שירות המעבדים מידע עבורנו ובהתאם להוראותינו:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-2 border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-right p-2 border">ספק</th>
                    <th className="text-right p-2 border">תפקיד</th>
                    <th className="text-right p-2 border">מיקום</th>
                  </tr>
                </thead>
                <tbody>
                  {PROCESSORS.map(([name, role, loc]) => (
                    <tr key={name}>
                      <td className="p-2 border font-medium">{name}</td>
                      <td className="p-2 border">{role}</td>
                      <td className="p-2 border">{loc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pt-2">
              בנוסף, נחשוף מידע אם נידרש לכך על פי דין, צו שיפוטי, או לצורך הגנה על זכויותינו.
            </p>
          </S>

          <S n={6} title="העברת מידע אל מחוץ לישראל">
            <p>
              חלק מהספקים המפורטים לעיל מאחסנים ומעבדים מידע מחוץ לישראל, ובכלל זה בארצות הברית.
              בשימושך בשירות אתה מסכים להעברה זו. אנו בוחרים ספקים המקיימים סטנדרטים מקובלים
              להגנת מידע.
            </p>
          </S>

          <S n={7} title="עוגיות וטכנולוגיות מעקב">
            <p>אנו עושים שימוש ב:</p>
            <ul className="list-disc mr-6 space-y-1">
              <li><strong>עוגיות הכרחיות</strong> — לשמירת ההתחברות שלך. בלעדיהן השירות לא יפעל</li>
              <li><strong>Google Analytics</strong> — לניתוח סטטיסטי מצרפי של דפוסי שימוש</li>
              <li><strong>Meta Pixel</strong> — למדידת אפקטיביות קמפיינים פרסומיים</li>
            </ul>
            <p>
              ניתן לחסום עוגיות בהגדרות הדפדפן, אך חסימת העוגיות ההכרחיות תמנע התחברות לשירות.
            </p>
          </S>

          <S n={8} title="משך שמירת המידע">
            <ul className="list-disc mr-6 space-y-1">
              <li><strong>נתוני חשבון</strong> — כל עוד החשבון פעיל</li>
              <li><strong>ניתוחים ותמונות</strong> — עד למחיקתם על ידך או עד סגירת החשבון</li>
              <li><strong>רשומות חיוב</strong> — לתקופה הנדרשת על פי דיני המס והחשבונאות</li>
            </ul>
            <p>לאחר סגירת חשבון, המידע יימחק או יעבור אנונימיזציה בתוך זמן סביר.</p>
          </S>

          <S n={9} title="הזכויות שלך">
            <p>בהתאם לחוק הגנת הפרטיות, התשמ״א-1981, אתה רשאי:</p>
            <ul className="list-disc mr-6 space-y-1">
              <li>לעיין במידע השמור עליך</li>
              <li>לבקש תיקון מידע שאינו נכון או מעודכן</li>
              <li>לבקש מחיקת חשבונך והמידע הקשור אליו</li>
              <li>לבקש קבלת עותק מהמידע שלך</li>
              <li>להסיר את עצמך מרשימת הדיוור בכל עת</li>
            </ul>
            <p>
              לממימוש זכות כלשהי, פנה אלינו בדוא״ל <strong>cryptoai043@gmail.com</strong>. נשיב
              לפנייתך בתוך זמן סביר ובהתאם לדין.
            </p>
          </S>

          <S n={10} title="אבטחת מידע">
            <p>
              המידע מאוחסן בשרתים מאובטחים, ההעברה מוצפנת ב-HTTPS, וההרשאות מוגדרות כך שכל משתמש
              יכול לגשת לנתוניו בלבד. הסיסמאות נשמרות בצורה מוצפנת ואינן נגישות לנו.
            </p>
            <p>
              עם זאת, אף מערכת אינה חסינה לחלוטין. איננו יכולים להתחייב לאבטחה מוחלטת, ומומלץ לבחור
              סיסמה ייחודית וחזקה.
            </p>
          </S>

          <S n={11} title="פרטיות קטינים">
            <p>
              השירות מיועד לבני 18 ומעלה בלבד. איננו אוספים ביודעין מידע על קטינים. אם נודע לך
              שקטין מסר לנו מידע, אנא פנה אלינו ונמחק אותו.
            </p>
          </S>

          <S n={12} title="שינויים במדיניות">
            <p>
              נעדכן מסמך זה מעת לעת. שינוי מהותי יפורסם באתר ובאפליקציה. תאריך העדכון האחרון מופיע
              בראש העמוד.
            </p>
          </S>

          <S n={13} title="יצירת קשר">
            <ul className="list-none space-y-1">
              <li><strong>דוא״ל:</strong> cryptoai043@gmail.com</li>
              <li><strong>טלפון:</strong> 050-7552271</li>
              <li><strong>כתובת:</strong> דרך מנחם בגין 146, תל אביב-יפו</li>
            </ul>
          </S>

          <div className="mt-10 pt-6 border-t text-sm text-gray-500">
            <p>
              ראה גם:{" "}
              <Link href="/app-terms" className="text-amber-600 underline">תנאי שימוש באפליקציה</Link>
              {" · "}
              <Link href="/terms" className="text-amber-600 underline">תקנון האתר</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
