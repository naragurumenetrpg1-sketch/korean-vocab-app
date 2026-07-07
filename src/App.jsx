import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, X, Trash2, Layers, BookMarked, Download, Upload, ArrowLeft, FileUp, CalendarDays, ChevronLeft, ChevronRight, ThumbsUp, Undo2, Volume2, VolumeX } from "lucide-react";

const STORAGE_KEY = "korean-vocab-words";
const STAMPS_KEY = "vocab-app-login-stamps";
const SOUND_KEY = "vocab-app-sound-on";
const TRANSITION_MS = 170;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pickRandomExcluding(pool, excludeIds = []) {
  if (pool.length === 0) return null;
  const filtered = pool.filter((w) => !excludeIds.includes(w.id));
  const usable = filtered.length > 0 ? filtered : pool;
  return usable[Math.floor(Math.random() * usable.length)];
}

function makeSlotCard(word, flipped) {
  return { renderId: uid(), word, flipped };
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}


export default function VocabApp() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);

  // screen: 'start' | 'menu' | 'cards' | 'list'
  const [screen, setScreen] = useState("start");

  // carousel state: five settled slots + optional transient exit/enter cards
  const [top2Card, setTop2Card] = useState(null);
  const [top1Card, setTop1Card] = useState(null);
  const [midCard, setMidCard] = useState(null);
  const [bottom1Card, setBottom1Card] = useState(null);
  const [bottom2Card, setBottom2Card] = useState(null);
  const [exitCard, setExitCard] = useState(null);
  const [enteringId, setEnteringId] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formHangul, setFormHangul] = useState("");
  const [formRoman, setFormRoman] = useState("");
  const [formMeaning, setFormMeaning] = useState("");
  const [formConjugation, setFormConjugation] = useState("");
  const [formError, setFormError] = useState("");

  const exitTimeoutRef = useRef(null);
  const historyRef = useRef([]);
  const enterRafRef = useRef(null);
  const fileInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState("");

  const [stamps, setStamps] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const todayNow = todayParts();
  const [viewYear, setViewYear] = useState(todayNow.y);

  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const audioCtxRef = useRef(null);
  const lastActionRef = useRef(Date.now());
  const tickIntervalRef = useRef(null);
  const [viewMonth, setViewMonth] = useState(todayNow.m);

  // ---- load on mount ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (!mounted) return;
        const list = res ? JSON.parse(res.value) : [];
        setWords(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!mounted) return;
        setWords([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    (async () => {
      try {
        const res = await window.storage.get(STAMPS_KEY, false);
        if (!mounted) return;
        const list = res ? JSON.parse(res.value) : [];
        setStamps(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!mounted) return;
        setStamps([]);
      }
    })();
    (async () => {
      try {
        const res = await window.storage.get(SOUND_KEY, false);
        if (!mounted) return;
        const value = res ? res.value === "true" : true;
        setSoundOn(value);
        soundOnRef.current = value;
      } catch (e) {
        // keep default (on)
      }
    })();
    return () => {
      mounted = false;
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      if (enterRafRef.current) cancelAnimationFrame(enterRafRef.current);
    };
  }, []);

  const persist = useCallback(async (list) => {
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(list), false);
    } catch (e) {
      // saving failed silently; keep working in-memory
    }
  }, []);

  const persistStamps = useCallback(async (list) => {
    try {
      await window.storage.set(STAMPS_KEY, JSON.stringify(list), false);
    } catch (e) {
      // saving failed silently; keep working in-memory
    }
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    soundOnRef.current = next;
    setSoundOn(next);
    window.storage.set(SOUND_KEY, String(next), false).catch(() => {});
    if (next) {
      try {
        getAudioCtx();
      } catch (e) {
        // ignore; ticking sound will just stay silent if this fails
      }
    }
  };

  const getAudioCtx = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch (e) {
      return null;
    }
  };

  // "チッ…" - a single soft, quiet clock-tick click
  const playTickSound = () => {
    if (!soundOnRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1800, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.025, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    } catch (e) {
      // ignore audio errors
    }
  };

  // set up the 5-card carousel whenever the cards screen needs one
  useEffect(() => {
    if (loading || screen !== "cards") return;
    if (words.length === 0) {
      setTop2Card(null);
      setTop1Card(null);
      setMidCard(null);
      setBottom1Card(null);
      setBottom2Card(null);
      setExitCard(null);
      return;
    }
    if (!midCard) {
      const w1 = pickRandomExcluding(words, []);
      const w2 = pickRandomExcluding(words, [w1.id]);
      const w3 = pickRandomExcluding(words, [w1.id, w2.id]);
      const w4 = pickRandomExcluding(words, [w1.id, w2.id, w3.id]);
      const w5 = pickRandomExcluding(words, [w1.id, w2.id, w3.id, w4.id]);
      setTop2Card(makeSlotCard(w1, true));
      setTop1Card(makeSlotCard(w2, true));
      setMidCard(makeSlotCard(w3, false));
      setBottom1Card(makeSlotCard(w4, false));
      setBottom2Card(makeSlotCard(w5, false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, screen, words]);

  const advance = useCallback(() => {
    if (isAnimating || !midCard || !top1Card || !bottom1Card || !bottom2Card || words.length === 0) return;
    setIsAnimating(true);
    lastActionRef.current = Date.now();

    historyRef.current.push({ top2Card, top1Card, midCard, bottom1Card, bottom2Card });
    if (historyRef.current.length > 50) historyRef.current.shift();

    const excludeIds = [top1Card.word.id, midCard.word.id, bottom1Card.word.id, bottom2Card.word.id];
    const newWord = pickRandomExcluding(words, excludeIds);

    setExitCard({ ...top2Card, renderId: top2Card.renderId });
    setTop2Card({ ...top1Card, flipped: true });
    setTop1Card({ ...midCard, flipped: true });
    setMidCard({ ...bottom1Card, flipped: false });
    setBottom1Card({ ...bottom2Card, flipped: false });
    const entering = makeSlotCard(newWord, false);
    setBottom2Card(entering);
    setEnteringId(entering.renderId);

    enterRafRef.current = requestAnimationFrame(() => {
      enterRafRef.current = requestAnimationFrame(() => {
        setEnteringId(null);
      });
    });

    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    exitTimeoutRef.current = setTimeout(() => {
      setExitCard(null);
      setIsAnimating(false);
    }, TRANSITION_MS);
  }, [isAnimating, midCard, top1Card, bottom1Card, bottom2Card, top2Card, words]);

  const goBack = useCallback(() => {
    if (isAnimating || historyRef.current.length === 0) return;
    const prev = historyRef.current.pop();
    setIsAnimating(true);
    lastActionRef.current = Date.now();
    setEnteringId(null);
    setExitCard(null);
    setTop2Card(prev.top2Card);
    setTop1Card(prev.top1Card);
    setMidCard(prev.midCard);
    setBottom1Card(prev.bottom1Card);
    setBottom2Card(prev.bottom2Card);

    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    exitTimeoutRef.current = setTimeout(() => {
      setIsAnimating(false);
    }, TRANSITION_MS);
  }, [isAnimating]);

  const handleCardsTap = () => {
    try {
      getAudioCtx();
    } catch (e) {
      // ignore; ticking sound will just stay silent if this fails
    }
    advance();
  };

  // continuous "ticking clock" sound while on the cards screen
  useEffect(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (screen !== "cards") return undefined;

    tickIntervalRef.current = setInterval(() => {
      if (!soundOnRef.current) return;
      playTickSound();
    }, 1000);

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [screen]);

  const resetCarousel = () => {
    setTop2Card(null);
    setTop1Card(null);
    setMidCard(null);
    setBottom1Card(null);
    setBottom2Card(null);
    setExitCard(null);
    historyRef.current = [];
  };

  const exportWords = () => {
    try {
      const blob = new Blob([JSON.stringify(words, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `vocab-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setImportMessage("書き出しに失敗しました");
    }
  };

  const triggerImport = () => {
    setImportMessage("");
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      const cleaned = parsed
        .filter((w) => w && typeof w.hangul === "string" && typeof w.meaning === "string")
        .map((w) => ({
          id: typeof w.id === "string" ? w.id : uid(),
          hangul: w.hangul,
          roman: typeof w.roman === "string" ? w.roman : "",
          meaning: w.meaning,
          conjugation: typeof w.conjugation === "string" ? w.conjugation : "",
          createdAt: typeof w.createdAt === "number" ? w.createdAt : Date.now(),
        }));
      if (cleaned.length === 0) {
        setImportMessage("読み込める単語がありませんでした");
        return;
      }

      // 読み込んだファイルの単語セットにそのまま入れ替える
      setWords(cleaned);
      persist(cleaned);
      resetCarousel();
      setImportMessage(`${cleaned.length}語を読み込みました`);
      setScreen("menu");
    } catch (err) {
      setImportMessage("ファイルを読み込めませんでした。形式を確認してください");
    } finally {
      e.target.value = "";
    }
  };

  const handleAddWord = (e) => {
    e.preventDefault();
    const hangul = formHangul.trim();
    const meaning = formMeaning.trim();
    const roman = formRoman.trim();
    const conjugation = formConjugation.trim();
    if (!hangul || !meaning) {
      setFormError("単語と意味は必ず入力してください");
      return;
    }
    const entry = { id: uid(), hangul, roman, meaning, conjugation, createdAt: Date.now() };
    const newList = [...words, entry];
    setWords(newList);
    persist(newList);
    setFormHangul("");
    setFormRoman("");
    setFormMeaning("");
    setFormConjugation("");
    setFormError("");
    setShowForm(false);
    // 登録ボタンの位置(リスト最上部)に戻る
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleDelete = (id) => {
    const newList = words.filter((w) => w.id !== id);
    setWords(newList);
    persist(newList);
    const showing = [top2Card, top1Card, midCard, bottom1Card, bottom2Card].some(
      (c) => c && c.word.id === id
    );
    if (showing) resetCarousel();
  };

  const slotClass = (base, card) => {
    if (!card) return `${base} slot-hidden`;
    if (card.renderId === enteringId) return `${base} slot-enter`;
    return base;
  };

  const goToMenu = () => setScreen("menu");

  const handleLoginTap = () => {
    const { y, m, d } = todayParts();
    const key = dateKey(y, m, d);
    if (!stamps.includes(key)) {
      const next = [...stamps, key];
      setStamps(next);
      persistStamps(next);
    }
    setViewYear(y);
    setViewMonth(m);
    setShowCalendar(true);
  };

  const changeMonth = (delta) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const stampSet = new Set(stamps);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const todayKeyStr = dateKey(todayNow.y, todayNow.m, todayNow.d);
  const calendarCells = [];
  for (let i = 0; i < firstWeekday; i++) calendarCells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(viewYear, viewMonth, d);
    calendarCells.push({ day: d, stamped: stampSet.has(key), isToday: key === todayKeyStr });
  }

  let streakDays = 0;
  {
    const cursor = new Date(todayNow.y, todayNow.m, todayNow.d);
    while (stampSet.has(dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()))) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  return (
    <div className="app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');

        :root {
          --hanji: #eaf0e6;
          --paper: #f8faf3;
          --ink: #212b20;
          --ink-soft: #5b6657;
          --jade: #3f6e52;
          --jade-dark: #2f5540;
          --danchae: #c23b22;
          --gold: #c1953f;
          --line: #d7dfcd;
        }

        html, body {
          margin: 0;
          height: 100%;
          overscroll-behavior: none;
        }

        .app-root {
          font-family: 'Noto Sans JP', system-ui, sans-serif;
          background: var(--hanji);
          color: var(--ink);
          height: 100vh;
          overflow: hidden;
          display: flex;
          justify-content: center;
          touch-action: pan-y;
          overscroll-behavior: none;
        }

        .shell {
          width: 100%;
          max-width: 430px;
          height: 100vh;
          background: var(--hanji);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .header { padding: 22px 56px 14px 20px; }
        .header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .header-titles { display: flex; align-items: center; gap: 8px; }
        .back-btn {
          background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-soft);
          border-radius: 12px; width: 36px; height: 36px; display: flex; align-items: center;
          justify-content: center; cursor: pointer; flex-shrink: 0;
        }
        .back-btn:hover { color: var(--jade-dark); border-color: var(--jade); }
        .eyebrow {
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--ink-soft);
          margin: 0 0 4px;
        }
        .title {
          font-family: 'Noto Serif JP', serif;
          font-weight: 700;
          font-size: 24px;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .title .accent { color: var(--danchae); }

        .stats-row { display: flex; gap: 14px; margin-top: 12px; flex-wrap: wrap; }
        .stat-pill {
          font-size: 12px;
          padding: 5px 10px;
          border-radius: 20px;
          background: var(--paper);
          border: 1px solid var(--line);
          color: var(--ink-soft);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .stat-dot { width: 6px; height: 6px; border-radius: 50%; }

        .main { flex: 1; padding: 10px 20px 20px; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }

        /* ---- start screen ---- */
        .start-screen {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 20px 6px;
        }
        .start-icon {
          width: 72px; height: 72px; border-radius: 20px; background: var(--danchae); color: #fff;
          display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
        }
        .start-screen h1 {
          font-family: 'Noto Serif JP', serif; font-size: 24px; margin: 0 0 8px; font-weight: 700;
        }
        .start-screen p {
          font-size: 13.5px; color: var(--ink-soft); line-height: 1.6; margin: 0 0 26px; max-width: 300px;
        }
        .start-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 300px; }
        .saved-note {
          font-size: 12.5px; color: var(--jade-dark); background: rgba(63, 110, 82, 0.1);
          border-radius: 10px; padding: 8px 12px; margin: 0 0 14px;
        }

        /* ---- menu screen ---- */
        .menu-screen { flex: 1; display: flex; flex-direction: column; padding-top: 6px; gap: 14px; }
        .menu-card {
          background: var(--paper); border: 1.5px solid var(--line); border-radius: 20px; padding: 22px 20px;
          display: flex; align-items: center; gap: 16px; cursor: pointer; text-align: left;
          transition: transform 120ms ease;
        }
        .menu-card:active { transform: scale(0.98); }
        .menu-card-icon {
          width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .menu-card.cards .menu-card-icon { background: rgba(194, 59, 34, 0.12); color: var(--danchae); }
        .menu-card.list .menu-card-icon { background: rgba(63, 110, 82, 0.12); color: var(--jade-dark); }
        .menu-card h3 {
          font-family: 'Noto Serif JP', serif; font-size: 17px; margin: 0 0 4px; font-weight: 700;
        }
        .menu-card p { font-size: 12.5px; color: var(--ink-soft); margin: 0; line-height: 1.5; }
        .menu-footer { margin-top: auto; text-align: center; }
        .link-btn {
          background: none; border: none; color: var(--ink-soft); font-size: 12.5px; cursor: pointer;
          text-decoration: underline; padding: 10px;
        }

        /* ---- rotating carousel ---- */
        .carousel-wrap {
          position: relative;
          flex: 1;
          min-height: 440px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 128px;
          perspective: 1400px;
          cursor: pointer;
        }
        .carousel-stage { position: relative; width: 100%; height: 400px; }
        .card-slot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 88%;
          max-width: 340px;
          height: 118px;
          transform-style: preserve-3d;
          transition: transform ${TRANSITION_MS}ms cubic-bezier(0.3, 0.9, 0.4, 1),
            opacity ${TRANSITION_MS}ms ease;
        }
        .slot-top2 {
          transform: translate(-50%, calc(-50% - 176px)) scale(0.64) rotateX(10deg);
          opacity: 0.28; z-index: 1;
        }
        .slot-top1 {
          transform: translate(-50%, calc(-50% - 92px)) scale(0.82) rotateX(8deg);
          opacity: 0.6; z-index: 2;
        }
        .slot-mid {
          transform: translate(-50%, -50%) scale(1.08) rotateX(0deg);
          opacity: 1; z-index: 4;
        }
        .slot-bottom1 {
          transform: translate(-50%, calc(-50% + 92px)) scale(0.82) rotateX(-8deg);
          opacity: 0.6; z-index: 2;
        }
        .slot-bottom2 {
          transform: translate(-50%, calc(-50% + 176px)) scale(0.64) rotateX(-10deg);
          opacity: 0.28; z-index: 1;
        }
        .slot-exit {
          transform: translate(-50%, calc(-50% - 250px)) scale(0.5) rotateX(14deg);
          opacity: 0; z-index: 0;
        }
        .slot-enter {
          transform: translate(-50%, calc(-50% + 250px)) scale(0.5) rotateX(-14deg) !important;
          opacity: 0 !important;
          transition: none !important;
        }
        .slot-hidden { opacity: 0; pointer-events: none; }

        .card-inner {
          position: relative; width: 100%; height: 100%; transform-style: preserve-3d;
          transition: transform ${TRANSITION_MS}ms cubic-bezier(0.3, 0.9, 0.4, 1);
        }
        .card-inner.flipped { transform: rotateY(180deg); }

        .card-face {
          position: absolute; inset: 0; backface-visibility: hidden; border-radius: 18px;
          background: var(--paper); border: 1px solid var(--line);
          box-shadow: 0 10px 22px -12px rgba(33, 43, 32, 0.28);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 10px 20px; text-align: center;
        }
        .slot-mid .card-face { box-shadow: 0 16px 32px -14px rgba(33, 43, 32, 0.4); border-color: var(--gold); }
        .card-face.back { transform: rotateY(180deg); }

        .card-slot.slot-mid .card-face { cursor: pointer; }
        .card-slot.slot-mid .card-face:active { transform: rotateY(0deg) scale(0.985); }

        .hangul {
          font-family: 'Noto Serif JP', serif; font-weight: 700; font-size: 28px; line-height: 1.2;
          margin: 0 0 4px; word-break: keep-all;
        }
        .roman { font-size: 12.5px; color: var(--gold); letter-spacing: 0.03em; font-weight: 500; margin: 0; }
        .conj {
          font-size: 12px; color: var(--jade-dark); background: rgba(63, 110, 82, 0.1);
          border-radius: 8px; padding: 2px 9px; margin: 6px 0 0; display: inline-block;
        }
        .meaning {
          font-family: 'Noto Serif JP', serif; font-size: 21px; font-weight: 700; color: var(--jade-dark);
        }
        .meaning-tag {
          font-size: 10.5px; letter-spacing: 0.08em; color: var(--ink-soft); margin-top: 6px;
        }

        .tap-hint { text-align: center; font-size: 11.5px; color: var(--ink-soft); margin: 8px 0 0; }
        .back-fab {
          position: absolute; right: 20px; bottom: 20px; width: 48px; height: 48px; border-radius: 50%;
          background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-soft);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          box-shadow: 0 6px 16px -8px rgba(33, 43, 32, 0.35); z-index: 5;
        }
        .back-fab:active { transform: scale(0.94); }
        .back-fab:disabled { opacity: 0.35; cursor: default; }
        .sound-toggle {
          position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border-radius: 50%;
          background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-soft);
          display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 20;
        }
        .sound-toggle:active { transform: scale(0.92); }

        .empty-state {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 40px 24px; color: var(--ink-soft);
        }
        .empty-state .title2 {
          font-family: 'Noto Serif JP', serif; font-size: 18px; color: var(--ink); margin: 14px 0 6px; font-weight: 600;
        }

        .btn {
          border: none; border-radius: 14px; padding: 13px 22px; font-size: 14px; font-weight: 700;
          font-family: 'Noto Sans JP', sans-serif; cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 6px; transition: transform 120ms ease, opacity 120ms ease;
        }
        .btn:active { transform: scale(0.96); }
        .btn:disabled { opacity: 0.5; }
        .btn-primary { background: var(--danchae); color: #fff; }
        .btn-ghost { background: var(--paper); color: var(--ink-soft); border: 1.5px solid var(--line); }
        .btn-login {
          background: var(--gold); color: #fff; justify-content: center; width: 100%;
          max-width: 300px; margin-top: 18px;
        }
        .streak-note {
          font-size: 13px; color: var(--gold); font-weight: 700; margin: 8px 0 0;
        }

        .calendar-sheet { max-width: 380px; margin: 0 auto; }
        .cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .cal-month-label { font-family: 'Noto Serif JP', serif; font-weight: 700; font-size: 15px; }
        .cal-weekdays {
          display: grid; grid-template-columns: repeat(7, 1fr); text-align: center;
          font-size: 11px; color: var(--ink-soft); margin-bottom: 6px;
        }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
        .cal-cell {
          position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
          border-radius: 10px; background: var(--paper); border: 1px solid var(--line); font-size: 12.5px;
          color: var(--ink-soft);
        }
        .cal-cell.empty { background: transparent; border: none; }
        .cal-cell.today { border-color: var(--gold); border-width: 2px; color: var(--ink); font-weight: 700; }
        .cal-stamp {
          position: absolute; bottom: -4px; right: -4px; width: 18px; height: 18px; border-radius: 50%;
          background: var(--danchae); color: #fff; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 5px rgba(194, 59, 34, 0.4);
        }
        .cal-streak {
          text-align: center; font-size: 13px; color: var(--jade-dark); margin: 14px 0 0;
          font-weight: 600;
        }
        .action-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 4px; }

        .list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .list-header h2 { font-family: 'Noto Serif JP', serif; font-size: 17px; margin: 0; }
        .header-actions { display: flex; align-items: center; gap: 8px; }
        .icon-btn {
          background: var(--paper); color: var(--ink-soft); border: 1.5px solid var(--line); border-radius: 12px;
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .icon-btn:hover { color: var(--jade-dark); border-color: var(--jade); }
        .add-fab {
          background: var(--danchae); color: #fff; border: none; border-radius: 12px; width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
        }
        .import-message {
          font-size: 12.5px; color: var(--jade-dark); background: rgba(63, 110, 82, 0.1);
          border-radius: 10px; padding: 8px 12px; margin: 0 0 12px;
        }
        .word-item {
          background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px;
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
        }
        .word-item .wi-hangul { font-family: 'Noto Serif JP', serif; font-weight: 700; font-size: 16px; }
        .word-item .wi-roman { font-size: 12px; color: var(--gold); margin-left: 8px; }
        .word-item .wi-meaning { font-size: 13px; color: var(--ink-soft); margin-top: 2px; }
        .word-item .wi-conj { font-size: 11.5px; color: var(--jade-dark); margin-top: 3px; }
        .del-btn { border: none; background: transparent; color: var(--ink-soft); cursor: pointer; padding: 6px; }
        .del-btn:hover { color: var(--danchae); }
        .empty-list { text-align: center; color: var(--ink-soft); font-size: 13px; padding: 30px 10px; }

        .modal-overlay {
          position: fixed; inset: 0; background: rgba(33, 43, 32, 0.4); display: flex;
          align-items: flex-end; justify-content: center; z-index: 50;
        }
        .modal-sheet { width: 100%; max-width: 430px; background: var(--paper); border-radius: 20px 20px 0 0; padding: 22px 20px 26px; }
        .modal-sheet h3 {
          font-family: 'Noto Serif JP', serif; margin: 0 0 16px; font-size: 17px; display: flex;
          justify-content: space-between; align-items: center;
        }
        .close-x { background: transparent; border: none; color: var(--ink-soft); cursor: pointer; }
        .field { margin-bottom: 12px; }
        .field label { display: block; font-size: 12px; color: var(--ink-soft); margin-bottom: 5px; }
        .field input {
          width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 10px; border: 1.5px solid var(--line);
          font-size: 15px; font-family: 'Noto Sans JP', sans-serif; background: #fff; color: var(--ink);
        }
        .field input:focus { outline: 2px solid var(--jade); outline-offset: 1px; }
        .form-error { color: var(--danchae); font-size: 12px; margin: -4px 0 10px; }
        .modal-actions { display: flex; gap: 10px; margin-top: 6px; }
        .modal-actions .btn { flex: 1; justify-content: center; }

        @media (prefers-reduced-motion: reduce) {
          .card-slot, .card-inner { transition: none !important; }
        }
      `}</style>

      <div className="shell">
        <button
          className="sound-toggle"
          onClick={toggleSound}
          aria-label={soundOn ? "サウンドをオフにする" : "サウンドをオンにする"}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />

        {screen === "start" ? (
          <div className="main">
            <div className="start-screen">
              <div className="start-icon">
                <Layers size={32} />
              </div>
              <h1>暗記単語帳</h1>
              <p>単語ファイルを読み込んで学習を始めよう！<br />言語ごとにファイルを分けてれば、<br />その日の気分で切り替えて使える！</p>

              <div className="start-actions">
                {!loading && words.length > 0 && (
                  <p className="saved-note">既にファイルを読み込んでいます</p>
                )}
                <button className="btn btn-primary" onClick={triggerImport}>
                  <FileUp size={16} /> ファイルを読み込む
                </button>
                {!loading && words.length > 0 && (
                  <button className="btn btn-ghost" onClick={goToMenu}>
                    この単語で始める
                  </button>
                )}
                {!loading && words.length === 0 && (
                  <button className="btn btn-ghost" onClick={goToMenu}>
                    自分で単語を追加する
                  </button>
                )}
              </div>

              <button className="btn btn-login" onClick={handleLoginTap}>
                <CalendarDays size={16} /> 出席
              </button>
              {streakDays > 0 && <p className="streak-note">{streakDays}日継続中！</p>}
            </div>
          </div>
        ) : screen === "menu" ? (
          <>
            <div className="header">
              <div className="header-top">
                <div>
                  <p className="eyebrow">暗記単語帳</p>
                  <h1 className="title">
                    何を<span className="accent">する</span>？
                  </h1>
                </div>
                <div className="header-actions">
                  <button className="icon-btn" onClick={triggerImport} title="ファイルを読み込む">
                    <Upload size={17} />
                  </button>
                  <button className="icon-btn" onClick={exportWords} title="書き出す">
                    <Download size={17} />
                  </button>
                </div>
              </div>
              <div className="stats-row">
                <span className="stat-pill">
                  <span className="stat-dot" style={{ background: "#3f6e52" }} />
                  登録{words.length}語
                </span>
              </div>
              {importMessage && <p className="import-message" style={{ marginTop: 10 }}>{importMessage}</p>}
            </div>
            <div className="main">
              <div className="menu-screen">
                <div className="menu-card cards" onClick={() => setScreen("cards")}>
                  <div className="menu-card-icon">
                    <Layers size={26} />
                  </div>
                  <div>
                    <h3>フラッシュカード</h3>
                    <p>カードをタップして単語を覚える</p>
                  </div>
                </div>
                <div className="menu-card list" onClick={() => setScreen("list")}>
                  <div className="menu-card-icon">
                    <BookMarked size={26} />
                  </div>
                  <div>
                    <h3>単語帳</h3>
                    <p>単語の追加・削除をする</p>
                  </div>
                </div>
                <div className="menu-footer">
                  <button className="link-btn" onClick={() => setScreen("start")}>
                    最初の画面に戻る
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="header">
              <div className="header-top">
                <div className="header-titles">
                  <button className="back-btn" onClick={goToMenu} aria-label="戻る">
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <p className="eyebrow">暗記単語帳</p>
                    <h1 className="title">{screen === "cards" ? "フラッシュカード" : "単語帳"}</h1>
                  </div>
                </div>
                <div className="header-actions">
                  <button className="icon-btn" onClick={triggerImport} title="ファイルを読み込む">
                    <Upload size={17} />
                  </button>
                  <button className="icon-btn" onClick={exportWords} title="書き出す">
                    <Download size={17} />
                  </button>
                </div>
              </div>
              {screen !== "cards" && (
                <div className="stats-row">
                  <span className="stat-pill">
                    <span className="stat-dot" style={{ background: "#3f6e52" }} />
                    登録{words.length}語
                  </span>
                </div>
              )}
              {screen !== "cards" && importMessage && (
                <p className="import-message" style={{ marginTop: 10 }}>{importMessage}</p>
              )}
            </div>

            <div className="main">
              {screen === "cards" ? (
                loading ? (
                  <div className="empty-state">読み込み中...</div>
                ) : words.length === 0 ? (
                  <div className="empty-state">
                    <Layers size={34} strokeWidth={1.5} />
                    <p className="title2">まだ単語が登録されていません</p>
                    <p style={{ fontSize: 13, margin: "0 0 18px" }}>
                      単語帳から追加するか、ファイルを読み込んでみましょう。
                    </p>
                    <div className="action-row">
                      <button className="btn btn-ghost" onClick={triggerImport}>
                        <Upload size={16} /> ファイルを読み込む
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setScreen("list");
                          setShowForm(true);
                        }}
                      >
                        <Plus size={16} /> 単語を追加する
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="carousel-wrap" onClick={handleCardsTap}>
                      <div className="carousel-stage">
                        {top2Card && (
                          <div key={top2Card.renderId} className={slotClass("card-slot slot-top2", top2Card)}>
                            <div className={`card-inner ${top2Card.flipped ? "flipped" : ""}`}>
                              <div className="card-face front">
                                <p className="hangul">{top2Card.word.hangul}</p>
                                {top2Card.word.roman && <p className="roman">{top2Card.word.roman}</p>}
                                {top2Card.word.conjugation && <p className="conj">{top2Card.word.conjugation}</p>}
                              </div>
                              <div className="card-face back">
                                <p className="meaning">{top2Card.word.meaning}</p>
                                <p className="meaning-tag">意味</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {top1Card && (
                          <div key={top1Card.renderId} className={slotClass("card-slot slot-top1", top1Card)}>
                            <div className={`card-inner ${top1Card.flipped ? "flipped" : ""}`}>
                              <div className="card-face front">
                                <p className="hangul">{top1Card.word.hangul}</p>
                                {top1Card.word.roman && <p className="roman">{top1Card.word.roman}</p>}
                                {top1Card.word.conjugation && <p className="conj">{top1Card.word.conjugation}</p>}
                              </div>
                              <div className="card-face back">
                                <p className="meaning">{top1Card.word.meaning}</p>
                                <p className="meaning-tag">意味</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {midCard && (
                          <div key={midCard.renderId} className={slotClass("card-slot slot-mid", midCard)}>
                            <div className={`card-inner ${midCard.flipped ? "flipped" : ""}`}>
                              <div className="card-face front">
                                <p className="hangul">{midCard.word.hangul}</p>
                                {midCard.word.roman && <p className="roman">{midCard.word.roman}</p>}
                                {midCard.word.conjugation && <p className="conj">{midCard.word.conjugation}</p>}
                              </div>
                              <div className="card-face back">
                                <p className="meaning">{midCard.word.meaning}</p>
                                <p className="meaning-tag">意味</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {bottom1Card && (
                          <div key={bottom1Card.renderId} className={slotClass("card-slot slot-bottom1", bottom1Card)}>
                            <div className={`card-inner ${bottom1Card.flipped ? "flipped" : ""}`}>
                              <div className="card-face front">
                                <p className="hangul">{bottom1Card.word.hangul}</p>
                                {bottom1Card.word.roman && <p className="roman">{bottom1Card.word.roman}</p>}
                                {bottom1Card.word.conjugation && <p className="conj">{bottom1Card.word.conjugation}</p>}
                              </div>
                              <div className="card-face back">
                                <p className="meaning">{bottom1Card.word.meaning}</p>
                                <p className="meaning-tag">意味</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {bottom2Card && (
                          <div key={bottom2Card.renderId} className={slotClass("card-slot slot-bottom2", bottom2Card)}>
                            <div className={`card-inner ${bottom2Card.flipped ? "flipped" : ""}`}>
                              <div className="card-face front">
                                <p className="hangul">{bottom2Card.word.hangul}</p>
                                {bottom2Card.word.roman && <p className="roman">{bottom2Card.word.roman}</p>}
                                {bottom2Card.word.conjugation && <p className="conj">{bottom2Card.word.conjugation}</p>}
                              </div>
                              <div className="card-face back">
                                <p className="meaning">{bottom2Card.word.meaning}</p>
                                <p className="meaning-tag">意味</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {exitCard && (
                          <div key={exitCard.renderId} className="card-slot slot-exit">
                            <div className={`card-inner ${exitCard.flipped ? "flipped" : ""}`}>
                              <div className="card-face front">
                                <p className="hangul">{exitCard.word.hangul}</p>
                                {exitCard.word.roman && <p className="roman">{exitCard.word.roman}</p>}
                                {exitCard.word.conjugation && <p className="conj">{exitCard.word.conjugation}</p>}
                              </div>
                              <div className="card-face back">
                                <p className="meaning">{exitCard.word.meaning}</p>
                                <p className="meaning-tag">意味</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="tap-hint">タップすると次のカードに進みます</p>
                    <button
                      className="back-fab"
                      onClick={goBack}
                      disabled={isAnimating || historyRef.current.length === 0}
                      aria-label="1つ前のカードに戻る"
                    >
                      <Undo2 size={18} />
                    </button>
                  </>
                )
              ) : (
                <>
                  <div className="list-header">
                    <h2>単語帳（{words.length}語）</h2>
                    <button className="add-fab" onClick={() => setShowForm(true)} aria-label="単語を追加">
                      <Plus size={18} />
                    </button>
                  </div>
                  {words.length === 0 ? (
                    <p className="empty-list">登録された単語がありません。+ を押して追加してみましょう。</p>
                  ) : (
                    [...words].reverse().map((w) => (
                      <div className="word-item" key={w.id}>
                        <div>
                          <div>
                            <span className="wi-hangul">{w.hangul}</span>
                            {w.roman && <span className="wi-roman">{w.roman}</span>}
                          </div>
                          <div className="wi-meaning">{w.meaning}</div>
                          {w.conjugation && <div className="wi-conj">{w.conjugation}</div>}
                        </div>
                        <button className="del-btn" onClick={() => handleDelete(w.id)} aria-label="削除">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </>
        )}

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <h3>
                新しい単語を追加
                <button className="close-x" onClick={() => setShowForm(false)} aria-label="閉じる">
                  <X size={20} />
                </button>
              </h3>
              <form onSubmit={handleAddWord}>
                <div className="field">
                  <label>単語</label>
                  <input type="text" value={formHangul} onChange={(e) => setFormHangul(e.target.value)} placeholder="例: hello" autoFocus />
                </div>
                <div className="field">
                  <label>読み方（任意）</label>
                  <input type="text" value={formRoman} onChange={(e) => setFormRoman(e.target.value)} placeholder="例: ハロー" />
                </div>
                <div className="field">
                  <label>意味</label>
                  <input type="text" value={formMeaning} onChange={(e) => setFormMeaning(e.target.value)} placeholder="例: こんにちは" />
                </div>
                <div className="field">
                  <label>活用（任意）</label>
                  <input type="text" value={formConjugation} onChange={(e) => setFormConjugation(e.target.value)} placeholder="例: 過去形など" />
                </div>
                {formError && <p className="form-error">{formError}</p>}
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                    キャンセル
                  </button>
                  <button type="submit" className="btn btn-primary">
                    保存する
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showCalendar && (
          <div className="modal-overlay" onClick={() => setShowCalendar(false)}>
            <div className="modal-sheet calendar-sheet" onClick={(e) => e.stopPropagation()}>
              <h3>
                ログインスタンプ
                <button className="close-x" onClick={() => setShowCalendar(false)} aria-label="閉じる">
                  <X size={20} />
                </button>
              </h3>
              <div className="cal-nav">
                <button className="icon-btn" onClick={() => changeMonth(-1)} aria-label="前の月">
                  <ChevronLeft size={16} />
                </button>
                <span className="cal-month-label">
                  {viewYear}年{viewMonth + 1}月
                </span>
                <button className="icon-btn" onClick={() => changeMonth(1)} aria-label="次の月">
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="cal-weekdays">
                {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="cal-grid">
                {calendarCells.map((cell, i) => (
                  <div
                    key={i}
                    className={`cal-cell ${cell.day ? "" : "empty"} ${cell.isToday ? "today" : ""}`}
                  >
                    {cell.day && <span className="cal-day-num">{cell.day}</span>}
                    {cell.stamped && (
                      <span className="cal-stamp">
                        <ThumbsUp size={12} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="cal-streak">
                {streakDays > 1 ? `${streakDays}日連続でログイン中！` : "今日のログインスタンプを押しました！"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
