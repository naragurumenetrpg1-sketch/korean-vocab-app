import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, X, Trash2, Layers, BookMarked } from "lucide-react";

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
  const enterRafRef = useRef(null);

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

  // set up the initial 5-card carousel whenever words become available
  useEffect(() => {
    if (loading) return;
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
  }, [loading, words]);

  const advance = useCallback(() => {
    if (isAnimating || !midCard || !top1Card || !bottom1Card || !bottom2Card || words.length === 0) return;
    setIsAnimating(true);

    const excludeIds = [top1Card.word.id, midCard.word.id, bottom1Card.word.id, bottom2Card.word.id];
    const newWord = pickRandomExcluding(words, excludeIds);

    // old top2 exits upward & fades
    setExitCard({ ...top2Card, renderId: top2Card.renderId });
    // old top1 (already Japanese) moves up to become the new top2
    setTop2Card({ ...top1Card, flipped: true });
    // mid flips (Japanese) and moves up to become the new top1
    setTop1Card({ ...midCard, flipped: true });
    // bottom1 (already Korean) moves up to become the new mid
    setMidCard({ ...bottom1Card, flipped: false });
    // bottom2 (already Korean) moves up to become the new bottom1
    setBottom1Card({ ...bottom2Card, flipped: false });
    // a fresh card enters from below into the bottom2 slot
    const entering = makeSlotCard(newWord, false);
    setBottom2Card(entering);
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
  }, [isAnimating, midCard, top1Card, bottom1Card, bottom2Card, top2Card, words]);

  const handleAddWord = async (e) => {
    e.preventDefault();
    const hangul = formHangul.trim();
    const meaning = formMeaning.trim();
    const roman = formRoman.trim();
    const conjugation = formConjugation.trim();
    if (!hangul || !meaning) {
      setFormError("단어와 의미는 꼭 입력해 주세요. (単語と意味は必ず入力してください)");
      return;
    }
    const entry = { id: uid(), hangul, roman, meaning, conjugation, createdAt: Date.now() };
    const newList = [...words, entry];
    setWords(newList);
    await persist(newList);
    setFormHangul("");
    setFormRoman("");
    setFormMeaning("");
    setFormConjugation("");
    setFormError("");
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    const newList = words.filter((w) => w.id !== id);
    setWords(newList);
    await persist(newList);
    // if the deleted word is currently showing anywhere, force a fresh carousel
    const showing = [top2Card, top1Card, midCard, bottom1Card, bottom2Card].some(
      (c) => c && c.word.id === id
    );
    if (showing) {
      setTop2Card(null);
      setTop1Card(null);
      setMidCard(null);
      setBottom1Card(null);
      setBottom2Card(null);
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
          min-height: 440px;
          display: flex;
          align-items: center;
          justify-content: center;
          perspective: 1400px;
        }
        .carousel-stage {
          position: relative;
          width: 100%;
          height: 400px;
        }
        .card-slot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 88%;
          max-width: 340px;
          height: 118px;
          transform-style: preserve-3d;
          transition: transform ${TRANSITION_MS}ms cubic-bezier(0.22, 0.8, 0.32, 1),
            opacity ${TRANSITION_MS}ms ease;
        }
        .slot-top2 {
          transform: translate(-50%, calc(-50% - 176px)) scale(0.64) rotateX(10deg);
          opacity: 0.28;
          z-index: 1;
        }
        .slot-top1 {
          transform: translate(-50%, calc(-50% - 92px)) scale(0.82) rotateX(8deg);
          opacity: 0.6;
          z-index: 2;
        }
        .slot-mid {
          transform: translate(-50%, -50%) scale(1.08) rotateX(0deg);
          opacity: 1;
          z-index: 4;
        }
        .slot-bottom1 {
          transform: translate(-50%, calc(-50% + 92px)) scale(0.82) rotateX(-8deg);
          opacity: 0.6;
          z-index: 2;
        }
        .slot-bottom2 {
          transform: translate(-50%, calc(-50% + 176px)) scale(0.64) rotateX(-10deg);
          opacity: 0.28;
          z-index: 1;
        }
        .slot-exit {
          transform: translate(-50%, calc(-50% - 250px)) scale(0.5) rotateX(14deg);
          opacity: 0;
          z-index: 0;
        }
        .slot-enter {
          transform: translate(-50%, calc(-50% + 250px)) scale(0.5) rotateX(-14deg) !important;
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
        .slot-mid .card-face {
          box-shadow: 0 16px 32px -14px rgba(33, 43, 32, 0.4);
          border-color: var(--gold);
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
        .conj {
          font-size: 12px;
          color: var(--jade-dark);
          background: rgba(63, 110, 82, 0.1);
          border-radius: 8px;
          padding: 2px 9px;
          margin: 6px 0 0;
          display: inline-block;
        }
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

        .empty-state {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 40px 24px; color: var(--ink-soft);
        }
        .empty-state .title2 {
          font-family: 'Noto Serif KR', serif; font-size: 19px; color: var(--ink); margin: 14px 0 6px; font-weight: 600;
        }

        .btn {
          border: none; border-radius: 14px; padding: 13px 22px; font-size: 14px; font-weight: 700;
          font-family: 'Noto Sans KR', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 6px;
          transition: transform 120ms ease, opacity 120ms ease;
        }
        .btn:active { transform: scale(0.96); }
        .btn:disabled { opacity: 0.5; }
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
                            <p className="meaning-tag">일본어 (日本語)</p>
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
                            {midCard.word.conjugation && <p className="conj">{midCard.word.conjugation}</p>}
                          </div>
                          <div className="card-face back">
                            <p className="meaning">{midCard.word.meaning}</p>
                            <p className="meaning-tag">일본어 (日本語)</p>
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
                            <p className="meaning-tag">일본어 (日本語)</p>
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
                            {exitCard.word.conjugation && <p className="conj">{exitCard.word.conjugation}</p>}
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
                      {w.conjugation && <div className="wi-conj">{w.conjugation}</div>}
                    </div>
                    <button className="del-btn" onClick={() => handleDelete(w.id)} aria-label="삭제">
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
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
                <div className="field">
                  <label>활용 (活用・任意)</label>
                  <input type="text" value={formConjugation} onChange={(e) => setFormConjugation(e.target.value)} placeholder="예: 사랑해요 (해요체)" />
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
