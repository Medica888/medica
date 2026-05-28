// ══════════════════════════════════════════════════════════════════════════════
// FULLSCREEN EXAM ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function startFullscreenExam(data) {
  examQ = data.questions.map(q => ({
    ...q,
    status: 'unanswered',
    marked: false,
    skipped: false,
    user_answer: null,
    _explLoaded: false,
    explanations: [],
    _integration: ''
  }));
  examIdx = 0;
  examSecs = 0;
  examMode = 'taking';

  document.getElementById('view-exam').classList.add('show');
  document.getElementById('exam-footer-wrap').style.display = '';
  document.getElementById('exam-confirm-overlay').style.display = 'none';

  startExamTimer();
  renderExamCard();
  renderExamNavigator();
}

function renderExamCard() {
  const q = examQ[examIdx];
  const n = examQ.length;
  const answered = examQ.filter(x => x.user_answer !== null).length;
  const pct = Math.round((answered / n) * 100);

  document.getElementById('exam-progress-txt').textContent = `Q ${examIdx + 1} of ${n}`;
  document.getElementById('exam-answered-txt').textContent = `${answered} answered`;
  document.getElementById('exam-hdr-bar-fill').style.width = pct + '%';

  // Prev / next state
  document.getElementById('exam-prev-btn').disabled = (examIdx === 0);
  const isLast = examIdx === n - 1;
  const nextBtn = document.getElementById('exam-next-btn');
  nextBtn.textContent = isLast ? 'Submit →' : 'Next →';
  nextBtn.onclick = isLast ? examConfirmEnd : examNext;

  // Skip visibility — hide if already answered
  document.getElementById('exam-skip-btn').style.display = q.user_answer !== null ? 'none' : '';

  const isReview = examMode === 'review';
  const mark = q.marked;
  const field = q.field || 'Anatomy';
  const tested = q.tested_concept ? ` · ${q.tested_concept}` : '';

  const optsHtml = q.options.map((opt, i) => {
    const text = opt.replace(/^[A-E]\.\s*/, '');
    let cls = 'exam-opt';
    if (isReview) {
      if (i === q.correct) cls += ' review-correct';
      else if (i === q.user_answer && i !== q.correct) cls += ' review-wrong';
      else cls += ' review-neutral';
    } else if (q.user_answer === i) {
      cls += ' selected';
    }
    const disabled = (isReview || q.user_answer !== null) ? 'disabled' : '';
    return `<button class="${cls}" ${disabled} onclick="examSelectOpt(${i})">
      <span class="exam-opt-letter">${String.fromCharCode(65 + i)}</span>
      <span class="exam-opt-text">${text}</span>
    </button>`;
  }).join('');

  document.getElementById('exam-main').innerHTML = `
    <div class="exam-card">
      <div class="exam-card-hdr">
        <div class="exam-card-meta">
          <span class="exam-card-qnum">Question ${examIdx + 1}</span>
          <span class="exam-card-field">${field}${tested}</span>
        </div>
        <button class="exam-mark-btn${mark ? ' marked' : ''}" onclick="examToggleMark()">
          <span class="exam-mark-star">${mark ? '★' : '☆'}</span>
          ${mark ? 'Marked' : 'Mark for Review'}
        </button>
      </div>
      <div class="exam-stem">${q.stem}</div>
      <div class="exam-options">${optsHtml}</div>
      ${isReview && q.user_answer !== null ? `
        <div class="exam-review-expl-area" id="exam-expl-area-${examIdx}">
          <button class="exam-expl-trigger" onclick="examStreamReviewExpl(${examIdx}, this)">
            ✦ See Explanation
          </button>
        </div>` : ''}
      ${isReview && q.user_answer === null && !q.skipped ? `
        <div style="padding:14px 0 0;font-size:12px;color:#A8BFD4;">Not answered</div>` : ''}
    </div>`;
}

function renderExamNavigator() {
  const strip = document.getElementById('exam-nav-scroll');
  strip.innerHTML = examQ.map((q, i) => {
    let cls = 'exam-nav-bubble';
    if (i === examIdx) cls += ' current';
    else if (q.user_answer !== null && q.marked) cls += ' answered marked';
    else if (q.user_answer !== null) cls += ' answered';
    else if (q.marked) cls += ' marked';
    else if (q.skipped) cls += ' skipped';
    return `<button class="${cls}" onclick="examJumpTo(${i})" title="Q${i + 1}">${i + 1}</button>`;
  }).join('');
  // Scroll current bubble into view
  const current = strip.querySelector('.current');
  if (current) current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function examSelectOpt(i) {
  const q = examQ[examIdx];
  if (examMode === 'review' || q.user_answer !== null) return;
  q.user_answer = i;
  q.status = 'answered';
  q.skipped = false;
  renderExamCard();
  renderExamNavigator();
}

function examToggleMark() {
  examQ[examIdx].marked = !examQ[examIdx].marked;
  renderExamCard();
  renderExamNavigator();
}

function examNext() {
  if (examIdx < examQ.length - 1) {
    examIdx++;
    renderExamCard();
    renderExamNavigator();
    document.getElementById('exam-main').scrollTop = 0;
  }
}

function examPrev() {
  if (examIdx > 0) {
    examIdx--;
    renderExamCard();
    renderExamNavigator();
    document.getElementById('exam-main').scrollTop = 0;
  }
}

function examSkip() {
  const q = examQ[examIdx];
  if (q.user_answer !== null) return;
  q.skipped = true;
  q.status = 'skipped';
  renderExamNavigator();
  if (examIdx < examQ.length - 1) { examIdx++; renderExamCard(); }
}

function examJumpTo(idx) {
  examIdx = idx;
  renderExamCard();
  renderExamNavigator();
  document.getElementById('exam-main').scrollTop = 0;
}

function examConfirmEnd() {
  const answered = examQ.filter(q => q.user_answer !== null).length;
  const skipped  = examQ.filter(q => q.skipped && q.user_answer === null).length;
  const unanswered = examQ.length - answered;

  document.getElementById('exam-confirm-sub').textContent =
    unanswered > 0
      ? `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submitting will end your session.`
      : 'All questions answered. Ready to submit?';

  document.getElementById('exam-confirm-stats').innerHTML = `
    <div class="exam-confirm-stat csg"><div class="csv">${answered}</div><div class="csl">Answered</div></div>
    <div class="exam-confirm-stat cso"><div class="csv">${unanswered}</div><div class="csl">Unanswered</div></div>
    <div class="exam-confirm-stat"><div class="csv">${examQ.filter(q=>q.marked).length}</div><div class="csl">Marked</div></div>`;

  document.getElementById('exam-confirm-overlay').style.display = 'flex';
}

function examConfirmClose() { document.getElementById('exam-confirm-overlay').style.display = 'none'; }
function examConfirmBg(e)   { if (e.target === document.getElementById('exam-confirm-overlay')) examConfirmClose(); }

function examEnd() {
  examConfirmClose();
  stopExamTimer();
  examMode = 'review';
  document.getElementById('exam-footer-wrap').style.display = 'none';
  renderExamResults();
}

function renderExamResults() {
  const em = document.getElementById('exam-main');
  em.style.padding = '';
  em.style.alignItems = '';

  const n = examQ.length;
  const correct    = examQ.filter(q => q.user_answer === q.correct).length;
  const wrong      = examQ.filter(q => q.user_answer !== null && q.user_answer !== q.correct).length;
  const unanswered = examQ.filter(q => q.user_answer === null).length;
  const markedCnt  = examQ.filter(q => q.marked).length;
  const pct = n ? Math.round(correct / n * 100) : 0;
  const ringColor = pct >= 70 ? '#0FAD6F' : pct >= 50 ? '#E07B20' : '#CC3A3A';

  const totalMins = String(Math.floor(examSecs / 60)).padStart(2, '0');
  const totalSecs = String(examSecs % 60).padStart(2, '0');
  const avgSec    = n ? Math.round(examSecs / n) : 0;
  const avgMins   = String(Math.floor(avgSec / 60)).padStart(2, '0');
  const avgSs     = String(avgSec % 60).padStart(2, '0');

  document.getElementById('exam-hdr-bar-fill').style.width = '100%';
  document.getElementById('exam-progress-txt').textContent = 'Results';
  document.getElementById('exam-answered-txt').textContent = `${pct}% · ${correct}/${n} correct`;
  const endBtn = document.querySelector('.exam-end-btn');
  if (endBtn) { endBtn.textContent = 'Back to Home'; endBtn.onclick = examBackHome; }

  const fieldMap = {};
  examQ.forEach(q => {
    const key = q.field || 'General';
    if (!fieldMap[key]) fieldMap[key] = { total: 0, correct: 0 };
    fieldMap[key].total++;
    if (q.user_answer === q.correct) fieldMap[key].correct++;
  });
  const fields = Object.entries(fieldMap).sort((a, b) =>
    (a[1].correct / a[1].total) - (b[1].correct / b[1].total)
  );
  const fieldRowsHtml = fields.map(([name, stats]) => {
    const fp = Math.round(stats.correct / stats.total * 100);
    const barColor = fp >= 70 ? '#0FAD6F' : fp >= 50 ? '#E07B20' : '#CC3A3A';
    return `
      <div class="er-field-row">
        <span class="er-field-name">${name}</span>
        <div class="er-field-bar-track"><div class="er-field-bar-fill" style="width:${fp}%;background:${barColor}"></div></div>
        <span class="er-field-score" style="color:${barColor}">${fp}%</span>
        <span class="er-field-weak">${fp < 50 ? 'Weak' : ''}</span>
      </div>`;
  }).join('');

  const perfTitle = pct >= 70 ? 'Strong Performance' : pct >= 50 ? 'Passing Range' : 'Needs Improvement';
  const perfSub   = pct >= 70
    ? 'You are tracking well. Focus on weak fields to push your score higher.'
    : pct >= 50
    ? 'Review incorrect answers and identify weak fields before your next block.'
    : 'Review the explanations carefully and revisit high-yield concepts in your weak areas.';

  em.innerHTML = `
    <div class="er-main">
      <div class="er-score-card">
        <div class="er-ring" style="border-color:${ringColor}">
          <span class="er-ring-pct" style="color:${ringColor}">${pct}%</span>
          <span class="er-ring-label" style="color:${ringColor}">${correct}/${n}</span>
        </div>
        <div class="er-score-info">
          <div class="er-score-title">${perfTitle}</div>
          <div class="er-score-sub">${perfSub}</div>
        </div>
      </div>
      <div class="er-stats-grid">
        <div class="er-stat es-correct"><div class="es-val">${correct}</div><div class="es-lbl">Correct</div></div>
        <div class="er-stat es-wrong"><div class="es-val">${wrong}</div><div class="es-lbl">Incorrect</div></div>
        <div class="er-stat es-skip"><div class="es-val">${unanswered}</div><div class="es-lbl">Unanswered</div></div>
        <div class="er-stat es-marked"><div class="es-val">${markedCnt}</div><div class="es-lbl">Marked</div></div>
      </div>
      <div class="er-time-row">
        <div class="er-time-item">
          <span class="er-time-val">${totalMins}:${totalSecs}</span>
          <span class="er-time-lbl">Total Time</span>
        </div>
        <div class="er-time-divider"></div>
        <div class="er-time-item">
          <span class="er-time-val">${avgMins}:${avgSs}</span>
          <span class="er-time-lbl">Avg / Question</span>
        </div>
        <div class="er-time-divider"></div>
        <div class="er-time-item">
          <span class="er-time-val">${n}</span>
          <span class="er-time-lbl">Questions</span>
        </div>
      </div>
      ${fields.length > 1 ? `
      <div class="er-field-card">
        <div class="er-field-title">Performance by Field</div>
        ${fieldRowsHtml}
      </div>` : ''}
      <div class="er-btns-card">
        <button class="er-review-btn" onclick="renderExamReview('all')">
          <div class="er-review-btn-icon">📋</div>
          <div class="er-review-btn-label">Review All</div>
          <div class="er-review-btn-sub">${n} question${n !== 1 ? 's' : ''}</div>
        </button>
        <button class="er-review-btn" onclick="renderExamReview('wrong')">
          <div class="er-review-btn-icon">✗</div>
          <div class="er-review-btn-label">Review Incorrect</div>
          <div class="er-review-btn-sub">${wrong} question${wrong !== 1 ? 's' : ''}</div>
        </button>
        <button class="er-review-btn" onclick="renderExamReview('marked')">
          <div class="er-review-btn-icon">⚑</div>
          <div class="er-review-btn-label">Review Marked</div>
          <div class="er-review-btn-sub">${markedCnt} question${markedCnt !== 1 ? 's' : ''}</div>
        </button>
        <button class="er-review-btn" onclick="renderExamReview('unanswered')">
          <div class="er-review-btn-icon">○</div>
          <div class="er-review-btn-label">Review Unanswered</div>
          <div class="er-review-btn-sub">${unanswered} question${unanswered !== 1 ? 's' : ''}</div>
        </button>
      </div>
      <button class="er-back-home" onclick="examBackHome()">← Back to Skills</button>
    </div>`;
}

function renderExamReview(filter) {
  const filterLabels = { all: 'All Questions', wrong: 'Incorrect', marked: 'Marked', unanswered: 'Unanswered' };

  const indexed = examQ.map((q, i) => ({ q, i }));
  let qs;
  if      (filter === 'all')        qs = indexed;
  else if (filter === 'wrong')      qs = indexed.filter(({ q }) => q.user_answer !== null && q.user_answer !== q.correct);
  else if (filter === 'marked')     qs = indexed.filter(({ q }) => q.marked);
  else if (filter === 'unanswered') qs = indexed.filter(({ q }) => q.user_answer === null);
  else qs = indexed;

  document.getElementById('exam-progress-txt').textContent = filterLabels[filter] || 'Review';
  document.getElementById('exam-answered-txt').textContent = `${qs.length} question${qs.length !== 1 ? 's' : ''}`;

  const em = document.getElementById('exam-main');
  em.style.padding = '0';
  em.style.alignItems = 'stretch';

  const reviewItems = qs.map(({ q, i }) => {
    const isCorrect = q.user_answer === q.correct;
    const isSkip    = q.user_answer === null;
    const verdictCls  = isSkip ? 'rv-skip' : isCorrect ? 'rv-correct' : 'rv-wrong';
    const verdictIcon = isSkip ? '−' : isCorrect ? '✓' : '✗';
    const optsHtml = q.options.map((opt, oi) => {
      const text = opt.replace(/^[A-E]\.\s*/, '');
      let cls = 'exam-review-opt rvo-neutral';
      if (oi === q.correct)      cls = 'exam-review-opt rvo-correct';
      else if (oi === q.user_answer) cls = 'exam-review-opt rvo-wrong';
      return `<div class="${cls}"><span class="exam-review-opt-letter">${String.fromCharCode(65 + oi)}</span>${text}</div>`;
    }).join('');
    const explArea = q._explLoaded
      ? `<div id="rv-expl-${i}"></div>`
      : `<div id="rv-expl-${i}"><button class="exam-expl-trigger" onclick="examStreamReviewExpl(${i}, this)">✦ See Explanation</button></div>`;
    return `
      <div class="exam-review-item ${verdictCls}" id="rv-item-${i}">
        <div class="exam-review-item-hdr" onclick="examToggleReviewItem(${i})">
          <div class="exam-review-verdict">${verdictIcon}</div>
          <span class="exam-review-item-qnum">Q${i + 1}</span>
          <span class="exam-review-item-stem">${q.stem.slice(0, 90)}${q.stem.length > 90 ? '…' : ''}</span>
          ${q.tested_concept ? `<span class="exam-review-item-concept">${q.tested_concept}</span>` : ''}
          <span class="exam-review-item-chevron">▾</span>
        </div>
        <div class="exam-review-item-body">
          <div class="exam-review-opts">${optsHtml}</div>
          ${explArea}
          ${q.pearl ? `<div style="margin-top:12px;background:#EEF6FF;border:1.5px solid #C8DEFA;border-radius:12px;padding:13px 16px;font-size:12.5px;color:#33516E;line-height:1.7"><strong style="color:#1769C8">Pearl:</strong> ${q.pearl}</div>` : ''}
          ${q.memory_anchor ? `<div style="margin-top:8px;font-size:11.5px;color:#7094B2;font-style:italic">🧠 ${q.memory_anchor}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const emptyMsg = qs.length === 0
    ? `<div style="text-align:center;padding:60px 20px;color:#A8BFD4;font-size:14px;font-weight:500">No questions in this category.</div>`
    : '';

  em.innerHTML = `
    <div class="exam-review-nav">
      <button class="exam-review-nav-back" onclick="renderExamResults()">← Back to Results</button>
      <span class="exam-review-nav-label">${filterLabels[filter] || 'Review'}</span>
      <button class="exam-review-nav-home" onclick="examBackHome()">Back to Home</button>
    </div>
    <div class="exam-review-list-inner">${emptyMsg}${reviewItems}</div>`;

  qs.forEach(({ q, i }) => {
    if (q._explLoaded) {
      const container = document.getElementById('rv-expl-' + i);
      if (container) renderExamExplPanel(q, i, container);
    }
  });
}

function examToggleReviewItem(i) {
  const el = document.getElementById('rv-item-' + i);
  if (el) el.classList.toggle('open');
}

async function examStreamReviewExpl(i, btn) {
  const q = examQ[i];
  const container = document.getElementById('rv-expl-' + i);
  if (!container) return;
  if (q._explLoaded) {
    renderExamExplPanel(q, i, container);
    if (btn) btn.remove();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  container.innerHTML = `<div class="mcq-expl-live-loading"><div class="expl-mini-spin"></div>Loading explanation…</div>`;
  try {
    const res = await fetch('/api/explain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stem: q.stem, options: q.options, correct: q.correct, field: q.field, pearl: q.pearl })
    });
    let raw = '', buf = '';
    const rd = res.body.getReader(), dc = new TextDecoder();
    while (true) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dc.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const ln of lines) {
        if (!ln.startsWith('data: ')) continue;
        const d = ln.slice(6).trim(); if (!d) continue;
        const ev = JSON.parse(d);
        if (ev.type === 'text') raw += ev.text;
      }
    }
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s === -1 || e === -1) throw new Error('No JSON');
    const data = JSON.parse(repairJSON(raw.slice(s, e + 1)));
    q.explanations = data.explanations || [];
    q._integration = data.integration || '';
    q._explLoaded = true;
    renderExamExplPanel(q, i, container);
  } catch (_) {
    container.innerHTML = '<p style="font-size:12px;color:#A8BFD4">Explanation unavailable.</p>';
  }
}

function renderExamExplPanel(q, i, container) {
  const chosen = q.user_answer;
  const isCorrect = chosen === q.correct;
  const clean = t => (t || '').replace(/^[A-E]\s*[—–-]\s*(Correct|Wrong)\s*:\s*/i, '');
  container.innerHTML = `
    <div class="mcq-expl-panel ${isCorrect ? 'is-correct' : 'is-wrong'}" style="margin-top:12px">
      <div class="mcq-expl-verdict">
        <span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;${isCorrect?'background:#C6F0DE':'background:#F5C6C6'}">${isCorrect ? '✓' : '✗'}</span>
        ${isCorrect ? 'Correct' : chosen === null ? 'Skipped' : 'Incorrect'}
      </div>
      ${!isCorrect && chosen !== null ? `<div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl">Why your answer missed</div>
        <div class="mcq-expl-block-txt">${clean(q.explanations[chosen])}</div>
      </div>` : ''}
      <div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl">${isCorrect ? 'Core reasoning' : 'Correct answer'}</div>
        <div class="mcq-expl-block-txt">${clean(q.explanations[q.correct])}</div>
      </div>
      ${q._integration ? `<div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl mcq-expl-pearl-lbl">Clinical integration</div>
        <div class="mcq-expl-block-txt">${q._integration}</div>
      </div>` : ''}
    </div>`;
}

function examBackHome() {
  stopExamTimer();
  const em = document.getElementById('exam-main');
  em.style.padding = '';
  em.style.alignItems = '';
  const endBtn = document.querySelector('.exam-end-btn');
  if (endBtn) { endBtn.textContent = 'End Session'; endBtn.onclick = examConfirmEnd; }
  document.getElementById('view-exam').classList.remove('show');
  goHome();
}
