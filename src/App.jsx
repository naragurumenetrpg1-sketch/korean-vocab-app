import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, X, Trash2, Layers, BookMarked, RotateCcw } from "lucide-react";

const STORAGE_KEY = "korean-vocab-words";
const TRANSITION_MS = 520;

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

export default function KoreanVocabApp() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("cards"); // 'cards' | 'list'

  // carousel state: three settled slots + optional transient exit/enter cards
  const [topCard, setTopCard] = useState(null);
  const [midCard, setMidCard] = useState(null);
  const [bottomCard, setBottomCard] = useState(null);
  const [exitCard, setExitCard] = useState(null);
  const [enteringId, setEnteringId] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const [sessionKnow, setSessionKnow] = useState(0);
  const [sessionAgain, setSessionAgain] = useState(0);
  const [stamp, setStamp] = useState(null); // 'know' | 'again' | null

  const [showForm, setShowForm] = useState(false);
  const [formHangul, setFormHangul] = useState("");
  const [formRoman, setFormRoman] = useState("");
  const [formMeaning, setFormMeaning] = useState("");
  const [formError, setFormError] = useState("");

  const exitTimeoutRef = useRef(null);
  const enterRafRef = useRef(null);
  const stampTimeoutRef = useRef(null);

  // ---- load on mount ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setWords(Array.isArray(list) ? list : []);
    } catch (e) {
      setWords([]);
    } finally {
      setLoading(false);
    }
    return () => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      if (stampTimeoutRef.current) clearTimeout(stampTimeoutRef.current);
      if (enterRafRef.current) cancelAnimationFrame(enterRafRef.current);
    };
  }, []);

  const persist = useCallback((list) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // saving failed silently; keep working in-memory
    }
  }, []);

  // set up the initial 3-card carousel whenever words become available
  useEffect(() => {
    if (loading) return;
    if (words.length === 0) {
      setTopCard(null);
      setMidCard(null);
      setBottomCard(null);
      setExitCard(null);
      return;
    }
    if (!midCard) {
      const w1 = pickRandomExcluding(words, []);
      const w2 = pickRandomExcluding(words, [w1.id]);
      const w3 = pickRandomExcluding(words, [w1.id, w2.id]);
      setTopCard(makeSlotCard(w1, true));
      setMidCard(makeSlotCard(w2, false));
      setBottomCard(makeSlotCard(w3, false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, words]);

  const advance = useCallback(() => {
    if (isAnimating || !midCard || !bottomCard || words.length === 0) return;
    setIsAnimating(true);

    const excludeIds = [midCard.word.id, bottomCard.word.id];
    const newWord = pickRandomExcluding(words, excludeIds);

    // old top exits upward & fades
    setExitCard({ ...topCard, renderId: topCard.renderId });
    // mid flips (Japanese) and moves up to become the new top
    setTopCard({ ...midCard, flipped: true });
    // bottom (already Korean) moves up to become the new mid
    setMidCard({ ...bottomCard, flipped: false });
    // a fresh card enters from below into the bottom slot
    const entering = makeSlotCard(newWord, false);
    setBottomCard(entering);
    setEnteringId(entering.renderId);

    // next tick: release from "entering" position so CSS transitions it into place
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
  }, [isAnimating, midCard, bottomCard, topCard, words]);

  const handleMark = (type) => {
    if (isAnimating || !midCard) return;
    if (type === "know") setSessionKnow((n) => n + 1);
    else setSessionAgain((n) => n + 1);
    setStamp(type);
    if (stampTimeoutRef.current) clearTimeout(stampTimeoutRef.current);
    stampTimeoutRef.current = setTimeout(() => setStamp(null), 550);
    advance();
  };

  const resetSession = () => {
    setSessionKnow(0);
    setSessionAgain(0);
  };

  const handleAddWord = async (e) => {
    e.preventDefault();
    const hangul = formHangul.trim();
    const meaning = formMeaning.trim();
    const roman = formRoman.trim();
    if (!hangul || !meaning) {
      setFormError("단어와 의미는 꼭 입력해 주세요. (単語と意味は必ず入力してください)");
      return;
    }
    const entry = { id: uid(), hangul, roman, meaning, createdAt: Date.now() };
    const newList = [...words, entry];
    setWords(newList);
    await persist(newList);
    setFormHangul("");
    setFormRoman("");
    setFormMeaning("");
    setFormError("");
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    const newList = words.filter((w) => w.id !== id);
    setWords(newList);
    await persist(newList);
    // if the deleted word is currently showing anywhere, force a fresh carousel
    const showing = [topCard, midCard, bottomCard].some((c) => c && c.word.id === id);
    if (showing) {
      setTopCard(null);
      setMidCard(null);
      setBottomCard(null);
      setExitCard(null);
    }
  };

  const slotClass = (base, card) => {
    if (!card) return `${base} slot-hidden`;
    if (card.renderId === enteringId) return `${base} slot-enter`;
    return base;
  };

  return (
    <div className="app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap');

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

        .app-root {
          font-family: 'Noto Sans KR', system-ui, sans-serif;
          background: var(--hanji);
          color: var(--ink);
          min-height: 100vh;
          display: flex;
          justify-content: center;
        }

        .shell {
          width: 100%;
          max-width: 430px;
          min-height: 100vh;
          background: var(--hanji);
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .header { padding: 22px 20px 14px; }
        .eyebrow {
          font-size: 12px;
          letter-spacing: 0.12em;
          color: var(--ink-soft);
          text-transform: uppercase;
          margin: 0 0 4px;
        }
        .title {
          font-family: 'Noto Serif KR', serif;
          font-weight: 700;
          font-size: 26px;
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

        .main { flex: 1; padding: 10px 20px 20px; display: flex; flex-direction: column; }

        /* ---- rotating carousel ---- */
        .carousel-wrap {
          position: relative;
          flex: 1;
          min-height: 340px;
          display: flex;
          align-items: center;
          justify-content: center;
          perspective: 1400px;
        }
        .carousel-stage {
          position: relative;
          width: 100%;
          height: 300px;
        }
        .card-slot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 88%;
          max-width: 340px;
          height: 128px;
          transform-style: preserve-3d;
          transition: transform ${TRANSITION_MS}ms cubic-bezier(0.22, 0.8, 0.32, 1),
            opacity ${TRANSITION_MS}ms ease;
        }
        .slot-top {
          transform: translate(-50%, calc(-50% - 96px)) scale(0.8) rotateX(8deg);
          opacity: 0.55;
          z-index: 1;
        }
        .slot-mid {
          transform: translate(-50%, -50%) scale(1) rotateX(0deg);
          opacity: 1;
          z-index: 3;
        }
        .slot-bottom {
          transform: translate(-50%, calc(-50% + 96px)) scale(0.8) rotateX(-8deg);
          opacity: 0.55;
          z-index: 1;
        }
        .slot-exit {
          transform: translate(-50%, calc(-50% - 170px)) scale(0.6) rotateX(14deg);
          opacity: 0;
          z-index: 0;
        }
        .slot-enter {
          transform: translate(-50%, calc(-50% + 170px)) scale(0.6) rotateX(-14deg) !important;
          opacity: 0 !important;
          transition: none !important;
        }
        .slot-hidden { opacity: 0; pointer-events: none; }

        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform ${TRANSITION_MS}ms cubic-bezier(0.22, 0.8, 0.32, 1);
        }
        .card-inner.flipped { transform: rotateY(180deg); }

        .card-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          border-radius: 18px;
          background: var(--paper);
          border: 1px solid var(--line);
          box-shadow: 0 10px 22px -12px rgba(33, 43, 32, 0.28);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 10px 20px;
          text-align: center;
        }
        .card-face.back { transform: rotateY(180deg); }

        .card-slot.slot-mid .card-face { cursor: pointer; }
        .card-slot.slot-mid .card-face:active { transform: rotateY(0deg) scale(0.985); }

        .hangul {
          font-family: 'Noto Serif KR', serif;
          font-weight: 700;
          font-size: 30px;
          line-height: 1.15;
          margin: 0 0 4px;
          word-break: keep-all;
        }
        .roman { font-size: 12.5px; color: var(--gold); letter-spacing: 0.03em; font-weight: 500; margin: 0; }
        .meaning {
          font-family: 'Noto Serif KR', serif;
          font-size: 22px;
          font-weight: 700;
          color: var(--jade-dark);
        }
        .meaning-tag {
          font-size: 10.5px;
          letter-spacing: 0.08em;
          color: var(--ink-soft);
          text-transform: uppercase;
          margin-top: 6px;
        }

        .tap-hint {
          text-align: center;
          font-size: 11px;
          color: var(--ink-soft);
          letter-spacing: 0.04em;
          margin: 8px 0 0;
        }

        .stamp {
          position: absolute;
          top: 42%;
          left: 50%;
          width: 92px;
          height: 92px;
          border-radius: 50%;
          border: 4px solid var(--danchae);
          color: var(--danchae);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Noto Serif KR', serif;
          font-size: 32px;
          font-weight: 700;
          transform: translate(-50%, -50%) rotate(-16deg) scale(0);
          animation: stampIn 550ms cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
          pointer-events: none;
          z-index: 10;
        }
        .stamp.again { border-color: var(--ink-soft); color: var(--ink-soft); }
        @keyframes stampIn {
          0% { transform: translate(-50%, -50%) rotate(-16deg) scale(0); opacity: 0; }
          55% { transform: translate(-50%, -50%) rotate(-16deg) scale(1.15); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(-16deg) scale(1); opacity: 1; }
        }

        .empty-state {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 40px 24px; color: var(--ink-soft);
        }
        .empty-state .title2 {
          font-family: 'Noto Serif KR', serif; font-size: 19px; color: var(--ink); margin: 14px 0 6px; font-weight: 600;
        }

        .action-row { display: flex; gap: 12px; justify-content: center; margin-top: 4px; }
        .btn {
          border: none; border-radius: 14px; padding: 13px 22px; font-size: 14px; font-weight: 700;
          font-family: 'Noto Sans KR', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 6px;
          transition: transform 120ms ease, opacity 120ms ease;
        }
        .btn:active { transform: scale(0.96); }
        .btn:disabled { opacity: 0.5; }
        .btn-again { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-soft); }
        .btn-know { background: var(--jade); color: #fff; }
        .btn-primary { background: var(--danchae); color: #fff; }
        .btn-ghost { background: transparent; color: var(--ink-soft); border: 1.5px solid var(--line); }

        .bottom-nav {
          display: flex; border-top: 1px solid var(--line); background: var(--paper); position: sticky; bottom: 0;
        }
        .nav-btn {
          flex: 1; border: none; background: transparent; padding: 12px 4px 14px; display: flex;
          flex-direction: column; align-items: center; gap: 3px; font-size: 10.5px; line-height: 1.3;
          text-align: center; color: var(--ink-soft); cursor: pointer; font-family: 'Noto Sans KR', sans-serif;
        }
        .nav-btn.active { color: var(--jade-dark); font-weight: 700; }

        .list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .list-header h2 { font-family: 'Noto Serif KR', serif; font-size: 18px; margin: 0; }
        .add-fab {
          background: var(--danchae); color: #fff; border: none; border-radius: 12px; width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .word-item {
          background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px;
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
        }
        .word-item .wi-hangul { font-family: 'Noto Serif KR', serif; font-weight: 700; font-size: 17px; }
        .word-item .wi-roman { font-size: 12px; color: var(--gold); margin-left: 8px; }
        .word-item .wi-meaning { font-size: 13px; color: var(--ink-soft); margin-top: 2px; }
        .del-btn { border: none; background: transparent; color: var(--ink-soft); cursor: pointer; padding: 6px; }
        .del-btn:hover { color: var(--danchae); }
        .empty-list { text-align: center; color: var(--ink-soft); font-size: 13px; padding: 30px 10px; }

        .modal-overlay {
          position: fixed; inset: 0; background: rgba(33, 43, 32, 0.4); display: flex;
          align-items: flex-end; justify-content: center; z-index: 50;
        }
        .modal-sheet { width: 100%; max-width: 430px; background: var(--paper); border-radius: 20px 20px 0 0; padding: 22px 20px 26px; }
        .modal-sheet h3 {
          font-family: 'Noto Serif KR', serif; margin: 0 0 16px; font-size: 18px; display: flex;
          justify-content: space-between; align-items: center;
        }
        .close-x { background: transparent; border: none; color: var(--ink-soft); cursor: pointer; }
        .field { margin-bottom: 12px; }
        .field label { display: block; font-size: 12px; color: var(--ink-soft); margin-bottom: 5px; }
        .field input {
          width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 10px; border: 1.5px solid var(--line);
          font-size: 15px; font-family: 'Noto Sans KR', sans-serif; background: #fff; color: var(--ink);
        }
        .field input:focus { outline: 2px solid var(--jade); outline-offset: 1px; }
        .form-error { color: var(--danchae); font-size: 12px; margin: -4px 0 10px; }
        .modal-actions { display: flex; gap: 10px; margin-top: 6px; }
        .modal-actions .btn { flex: 1; justify-content: center; }

        @media (prefers-reduced-motion: reduce) {
          .card-slot, .card-inner { transition: none !important; }
          .stamp { animation: none; opacity: 1; transform: translate(-50%, -50%) rotate(-16deg) scale(1); }
        }
      `}</style>

      <div className="shell">
        <div className="header">
          <p className="eyebrow">한국어 단어장 (韓国語単語帳)</p>
          <h1 className="title">
            오늘의 <span className="accent">단어</span> (今日の単語)
          </h1>
          <div className="stats-row">
            <span className="stat-pill">
              <span className="stat-dot" style={{ background: "#3f6e52" }} />
              등록 {words.length}개 (登録{words.length}個)
            </span>
            {(sessionKnow > 0 || sessionAgain > 0) && (
              <span className="stat-pill">
                알아요 {sessionKnow} · 다시 {sessionAgain} (わかった{sessionKnow}・もう一度{sessionAgain})
              </span>
            )}
          </div>
        </div>

        <div className="main">
          {tab === "cards" ? (
            loading ? (
              <div className="empty-state">불러오는 중... (読み込み中)</div>
            ) : words.length === 0 ? (
              <div className="empty-state">
                <Layers size={34} strokeWidth={1.5} />
                <p className="title2">아직 등록된 단어가 없어요 (まだ登録された単語がありません)</p>
                <p style={{ fontSize: 13, margin: "0 0 18px" }}>
                  단어장 탭에서 첫 단어를 추가해 보세요. (単語帳タブで最初の単語を追加してみましょう)
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setTab("list");
                    setShowForm(true);
                  }}
                >
                  <Plus size={16} /> 단어 추가하기 (単語を追加する)
                </button>
              </div>
            ) : (
              <>
                <div className="carousel-wrap">
                  <div className="carousel-stage">
                    {topCard && (
                      <div key={topCard.renderId} className={slotClass("card-slot slot-top", topCard)}>
                        <div className={`card-inner ${topCard.flipped ? "flipped" : ""}`}>
                          <div className="card-face front">
                            <p className="hangul">{topCard.word.hangul}</p>
                            {topCard.word.roman && <p className="roman">{topCard.word.roman}</p>}
                          </div>
                          <div className="card-face back">
                            <p className="meaning">{topCard.word.meaning}</p>
                            <p className="meaning-tag">일본어 (日本語)</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {midCard && (
                      <div key={midCard.renderId} className={slotClass("card-slot slot-mid", midCard)}>
                        <div className={`card-inner ${midCard.flipped ? "flipped" : ""}`}>
                          <div className="card-face front" onClick={advance}>
                            <p className="hangul">{midCard.word.hangul}</p>
                            {midCard.word.roman && <p className="roman">{midCard.word.roman}</p>}
                          </div>
                          <div className="card-face back">
                            <p className="meaning">{midCard.word.meaning}</p>
                            <p className="meaning-tag">일본어 (日本語)</p>
                          </div>
                        </div>
                        {stamp && (
                          <div className={`stamp ${stamp === "again" ? "again" : ""}`}>
                            {stamp === "know" ? "인" : "又"}
                          </div>
                        )}
                      </div>
                    )}

                    {bottomCard && (
                      <div key={bottomCard.renderId} className={slotClass("card-slot slot-bottom", bottomCard)}>
                        <div className={`card-inner ${bottomCard.flipped ? "flipped" : ""}`}>
                          <div className="card-face front">
                            <p className="hangul">{bottomCard.word.hangul}</p>
                            {bottomCard.word.roman && <p className="roman">{bottomCard.word.roman}</p>}
                          </div>
                          <div className="card-face back">
                            <p className="meaning">{bottomCard.word.meaning}</p>
                            <p className="meaning-tag">일본어 (日本語)</p>
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
                          </div>
                          <div className="card-face back">
                            <p className="meaning">{exitCard.word.meaning}</p>
                            <p className="meaning-tag">일본어 (日本語)</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <p className="tap-hint">가운데 카드를 탭하면 의미를 보며 다음으로 넘어가요 (中央のカードをタップすると意味を見ながら次に進みます)</p>
                <div className="action-row">
                  <button className="btn btn-again" onClick={() => handleMark("again")} disabled={isAnimating}>
                    다시 볼게요 (もう一度)
                  </button>
                  <button className="btn btn-know" onClick={() => handleMark("know")} disabled={isAnimating}>
                    알아요 (わかった)
                  </button>
                </div>
              </>
            )
          ) : (
            <>
              <div className="list-header">
                <h2>단어장 ({words.length}) (単語帳)</h2>
                <button className="add-fab" onClick={() => setShowForm(true)} aria-label="단어 추가">
                  <Plus size={18} />
                </button>
              </div>
              {words.length === 0 ? (
                <p className="empty-list">
                  등록된 단어가 없어요. + 를 눌러 추가해 보세요. (登録された単語がありません。+を押して追加してみましょう)
                </p>
              ) : (
                [...words].reverse().map((w) => (
                  <div className="word-item" key={w.id}>
                    <div>
                      <div>
                        <span className="wi-hangul">{w.hangul}</span>
                        {w.roman && <span className="wi-roman">{w.roman}</span>}
                      </div>
                      <div className="wi-meaning">{w.meaning}</div>
                    </div>
                    <button className="del-btn" onClick={() => handleDelete(w.id)} aria-label="삭제">
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              )}
              {sessionKnow + sessionAgain > 0 && (
                <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={resetSession}>
                  <RotateCcw size={14} /> 학습 기록 초기화 (学習記録をリセット)
                </button>
              )}
            </>
          )}
        </div>

        <div className="bottom-nav">
          <button className={`nav-btn ${tab === "cards" ? "active" : ""}`} onClick={() => setTab("cards")}>
            <Layers size={20} />
            플래시카드 (フラッシュカード)
          </button>
          <button className={`nav-btn ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
            <BookMarked size={20} />
            단어장 (単語帳)
          </button>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <h3>
                새 단어 추가 (新しい単語を追加)
                <button className="close-x" onClick={() => setShowForm(false)} aria-label="닫기">
                  <X size={20} />
                </button>
              </h3>
              <form onSubmit={handleAddWord}>
                <div className="field">
                  <label>한국어 단어 (韓国語の単語)</label>
                  <input type="text" value={formHangul} onChange={(e) => setFormHangul(e.target.value)} placeholder="예: 사랑" autoFocus />
                </div>
                <div className="field">
                  <label>읽는 법 (読み方・任意)</label>
                  <input type="text" value={formRoman} onChange={(e) => setFormRoman(e.target.value)} placeholder="예: sarang" />
                </div>
                <div className="field">
                  <label>의미 (意味)</label>
                  <input type="text" value={formMeaning} onChange={(e) => setFormMeaning(e.target.value)} placeholder="例: 愛" />
                </div>
                {formError && <p className="form-error">{formError}</p>}
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                    취소 (キャンセル)
                  </button>
                  <button type="submit" className="btn btn-primary">
                    저장하기 (保存する)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
