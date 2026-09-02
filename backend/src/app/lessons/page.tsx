"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Heebo, Rubik } from "next/font/google";
import { BookOpen, Clock, ChevronLeft, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";

const heebo = Heebo({ subsets: ["latin", "hebrew"] });
const rubik = Rubik({ subsets: ["latin", "hebrew"] });

interface Lesson {
  id: number;
  title: string;
  summary: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  duration_minutes: number | null;
}

const DONE_KEY = "wizard_lessons_done";

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [active, setActive] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number[]>([]);

  // Progress is a per-viewer convenience, so the browser is the right place for
  // it; a failure to read it must not stop the lessons from rendering.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DONE_KEY);
      if (raw) setDone(JSON.parse(raw));
    } catch { /* no stored progress */ }
  }, []);

  const toggleDone = (id: number) => {
    const next = done.includes(id) ? done.filter(d => d !== id) : [...done, id];
    setDone(next);
    try { localStorage.setItem(DONE_KEY, JSON.stringify(next)); } catch { /* not persisted */ }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get("/api/lessons");
        setLessons(res.data.lessons ?? []);
        setError(res.data.error ?? null);
      } catch (e: any) {
        if (e?.response?.status === 401) window.location.href = "/?auth=login";
        else setError(e?.message ?? "שגיאה בטעינת השיעורים");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const progress = lessons.length ? Math.round((done.length / lessons.length) * 100) : 0;

  return (
    <div className={`min-h-screen ${heebo.className}`} style={{ background: "#0D0D14", direction: "rtl" }}>
      <header className="sticky top-0 z-30" style={{ background: "#0D0D14", borderBottom: "1px solid #F0B90B22" }}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm" style={{ color: "#888" }}>
            <ArrowRight className="h-4 w-4" />חזרה ללוח הבקרה
          </Link>
          <h1 className={`text-lg font-bold ${rubik.className}`} style={{ color: "#F0B90B" }}>
            🎓 אזור הלימוד
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {error && (
          <div className="mb-6 p-4 rounded-xl flex items-start gap-3" style={{ background: "#2a1a1a", border: "1px solid #f8717155" }}>
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#f87171" }} />
            <div className="text-sm" style={{ color: "#ffc9c9" }}>
              <div className="font-bold mb-1">לא הצלחנו לטעון את השיעורים</div>
              <div style={{ color: "#c88" }}>{error}</div>
              <div className="mt-2" style={{ color: "#a88" }}>
                אם זו ההפעלה הראשונה — צריך להריץ את <code style={{ color: "#F0B90B" }}>backend/supabase/lessons.sql</code> ב-Supabase.
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20" style={{ color: "#666" }}>טוען שיעורים...</div>
        ) : active ? (
          <article>
            <button
              onClick={() => setActive(null)}
              className="mb-6 flex items-center gap-1 text-sm"
              style={{ color: "#F0B90B" }}
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />לכל השיעורים
            </button>

            <h2 className={`text-3xl font-bold mb-3 ${rubik.className}`} style={{ color: "#fff" }}>
              {active.title}
            </h2>
            {active.duration_minutes && (
              <div className="flex items-center gap-1.5 text-sm mb-8" style={{ color: "#777" }}>
                <Clock className="h-4 w-4" />{active.duration_minutes} דקות קריאה
              </div>
            )}

            {active.video_url && (
              <div className="mb-8 rounded-xl overflow-hidden" style={{ border: "1px solid #F0B90B22" }}>
                <video src={active.video_url} controls className="w-full" />
              </div>
            )}

            <div className="lesson-body" style={{ color: "#ccc", lineHeight: 1.9 }}>
              <ReactMarkdown>{active.body ?? active.summary ?? ""}</ReactMarkdown>
            </div>

            <button
              onClick={() => toggleDone(active.id)}
              className="mt-10 w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
              style={
                done.includes(active.id)
                  ? { background: "#1a2a1a", color: "#4ade80", border: "1px solid #4ade8055" }
                  : { background: "linear-gradient(90deg,#F0B90B,#E05A20)", color: "#000" }
              }
            >
              <CheckCircle2 className="h-5 w-5" />
              {done.includes(active.id) ? "סומן כהושלם" : "סמן כהושלם"}
            </button>
          </article>
        ) : (
          <>
            <div className="mb-8">
              <h2 className={`text-2xl font-bold mb-2 ${rubik.className}`} style={{ color: "#fff" }}>
                מה תלמדו
              </h2>
              <p className="text-sm mb-4" style={{ color: "#888" }}>
                {lessons.length} שיעורים — מקריאת גרפים ועד פסיכולוגיית מסחר
              </p>
              {!!lessons.length && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#161622" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%`, background: "linear-gradient(90deg,#F0B90B,#E05A20)" }}
                    />
                  </div>
                  <span className="text-sm font-bold" style={{ color: "#F0B90B" }}>{progress}%</span>
                </div>
              )}
            </div>

            {!lessons.length && !error ? (
              <div className="text-center py-16" style={{ color: "#666" }}>עדיין אין שיעורים</div>
            ) : (
              <div className="space-y-3">
                {lessons.map((lesson, i) => (
                  <button
                    key={lesson.id}
                    onClick={() => { setActive(lesson); window.scrollTo({ top: 0 }); }}
                    className="w-full text-right p-5 rounded-2xl flex items-start gap-4 transition-colors hover:brightness-125"
                    style={{ background: "#161622", border: "1px solid #F0B90B22" }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 font-bold"
                      style={
                        done.includes(lesson.id)
                          ? { background: "#1a2a1a", color: "#4ade80" }
                          : { background: "linear-gradient(135deg,#F0B90B22,#E05A2011)", color: "#F0B90B" }
                      }
                    >
                      {done.includes(lesson.id) ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-bold mb-1 ${rubik.className}`} style={{ color: "#fff" }}>
                        {lesson.title}
                      </h3>
                      {lesson.summary && (
                        <p className="text-sm mb-2" style={{ color: "#888" }}>{lesson.summary}</p>
                      )}
                      {lesson.duration_minutes && (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#666" }}>
                          <Clock className="h-3 w-3" />{lesson.duration_minutes} דקות
                        </span>
                      )}
                    </div>
                    <BookOpen className="h-5 w-5 flex-shrink-0 mt-1" style={{ color: "#F0B90B66" }} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <style jsx global>{`
        .lesson-body h2 { font-size: 1.5rem; font-weight: 700; color: #F0B90B; margin: 2rem 0 1rem; }
        .lesson-body h3 { font-size: 1.15rem; font-weight: 700; color: #fff; margin: 1.5rem 0 .5rem; }
        .lesson-body p { margin-bottom: 1rem; }
        .lesson-body ul, .lesson-body ol { margin: 0 1.5rem 1rem 0; list-style-position: outside; }
        .lesson-body ul { list-style-type: disc; }
        .lesson-body ol { list-style-type: decimal; }
        .lesson-body li { margin-bottom: .5rem; }
        .lesson-body strong { color: #fff; }
        .lesson-body blockquote {
          border-right: 3px solid #F0B90B; padding: .75rem 1rem; margin: 1.5rem 0;
          background: #161622; border-radius: .5rem; color: #ddd;
        }
        .lesson-body code {
          background: #161622; padding: .15rem .4rem; border-radius: .25rem;
          color: #F0B90B; font-size: .9em; direction: ltr; display: inline-block;
        }
        .lesson-body pre {
          background: #161622; padding: 1rem; border-radius: .5rem; overflow-x: auto;
          margin-bottom: 1rem; direction: ltr; text-align: left;
        }
        .lesson-body pre code { background: none; padding: 0; }
      `}</style>
    </div>
  );
}
