// ─── BATCH MCQ HELPERS ────────────────────────────────────────────────────────
const MCQ_BATCH_SIZE = 5;
const MCQ_RETRIES    = 2;

function extractQuestionCount(guide) {
  const m = guide.match(/number\s+of\s+questions\s*:\s*\[?(\d+)\]?/i);
  return m ? Math.min(Math.max(parseInt(m[1]), 1), 100) : 10;
}

function buildBatchGuide(guide, batchNum, batchSize, coveredTopics) {
  let g = guide.replace(/number\s+of\s+questions\s*:\s*\[?\d+\]?/i, `Number of questions: ${batchSize}`);
  if (coveredTopics.length > 0) {
    g += `\n\nAlready generated — do NOT repeat these topics or stems: ${coveredTopics.slice(-15).join(' | ')}`;
  }
  if (batchNum > 0) {
    g += `\nThis is batch ${batchNum + 1}. Generate ${batchSize} completely fresh questions.`;
  }
  return g;
}

function validateMCQBatch(data) {
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) return false;
  return data.questions.every(q =>
    typeof q.stem === 'string' && q.stem.length > 10 &&
    Array.isArray(q.options) && q.options.length >= 4 &&
    typeof q.correct === 'number' && q.correct >= 0 && q.correct < q.options.length
  );
}

async function fetchMCQBatch(payload) {
  const res = await fetch('/api/generate', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
  if (!res.ok) { const e=await res.json(); throw new Error(e.error||'Server error'); }

  let raw='', buf='';
  const rd=res.body.getReader(), dc=new TextDecoder();
  while(true) {
    const {done,value}=await rd.read(); if(done) break;
    buf+=dc.decode(value,{stream:true});
    const lines=buf.split('\n'); buf=lines.pop();
    for(const ln of lines) {
      if(!ln.startsWith('data: ')) continue;
      const d=ln.slice(6).trim(); if(!d) continue;
      const ev=JSON.parse(d);
      if(ev.type==='text') raw+=ev.text;
      else if(ev.type==='error') throw new Error(ev.message);
    }
  }

  const s=raw.indexOf('{'), e=raw.lastIndexOf('}');
  if(s===-1||e===-1) throw new Error('No JSON in response');
  let js=repairJSON(raw.slice(s,e+1));
  try { return JSON.parse(js); }
  catch(_) {
    js=js.replace(/[\x00-\x1F\x7F]/g, c=>(c==='\t'?' ':''));
    return JSON.parse(js);
  }
}

// ─── MCQ TIMER ────────────────────────────────────────────────────────────────
function mcqStartQuestionTimer() {
  if (mcqMode !== 'timed') return;
  if ((mcqAdaptive ? mcqStep : mcqIdx) !== 0) return; // timer already running from question 1
  clearInterval(mcqTimerInterval);
  mcqQTimeLeft = mcqData.questions.length * 60;
  mcqTimerInterval = setInterval(() => {
    mcqQTimeLeft = Math.max(0, mcqQTimeLeft - 1);
    const el = document.getElementById('mcq-timer');
    if (el) {
      const m = String(Math.floor(mcqQTimeLeft / 60)).padStart(2, '0');
      const s = String(mcqQTimeLeft % 60).padStart(2, '0');
      el.textContent = `${m}:${s}`;
      el.className = 'mcq-timer-chip' + (mcqQTimeLeft <= 60 ? ' danger' : mcqQTimeLeft <= 120 ? ' warn' : '');
    }
    if (mcqQTimeLeft <= 0) {
      clearInterval(mcqTimerInterval); mcqTimerInterval = null;
      while (mcqAnswers.length < mcqData.questions.length) mcqAnswers.push(false);
      while (mcqChosenAnswers.length < mcqData.questions.length) mcqChosenAnswers.push(-1);
      mcqIdx = mcqData.questions.length;
      renderMCQStats();
    }
  }, 1000);
}

// ─── MCQ RENDER ───────────────────────────────────────────────────────────────
function renderMCQQuestion() {
  const qIdx = mcqAdaptive ? mcqQueue[mcqStep] : mcqIdx;
  const total = mcqData.questions.length;
  const stepsDone = mcqAdaptive ? mcqStep : mcqIdx;
  if (stepsDone >= total) { renderMCQStats(); return; }
  mcqStartQuestionTimer();

  const body=document.getElementById('out-body');
  const q=mcqData.questions[qIdx];
  const n=total;
  const nAnswered=mcqAdaptive ? mcqStep : mcqAnswers.length;
  const nCorrect=mcqAdaptive ? mcqAnswerDetails.filter(d=>d.correct).length : mcqAnswers.filter(Boolean).length;
  const barPct=Math.round((nAnswered/n)*100);
  const qNum = mcqAdaptive ? mcqStep+1 : (q.id||mcqIdx+1);
  const qLabel = q.subject ? `${q.subject}${q.topic?' · '+q.topic:''}` : (q.field||'USMLE Step 1');

  body.innerHTML=`
    <div class="mcq-wrap">
      <div class="mcq-progress-row">
        <span class="mcq-progress-label">${Math.round(barPct)}% complete</span>
        <div class="mcq-bar-track"><div class="mcq-bar-fill" style="width:${barPct}%"></div></div>
        ${mcqMode==='timed'
          ? `<span class="mcq-timer-chip${mcqQTimeLeft<=60?' danger':mcqQTimeLeft<=120?' warn':''}" id="mcq-timer">${String(Math.floor(mcqQTimeLeft/60)).padStart(2,'0')}:${String(mcqQTimeLeft%60).padStart(2,'0')}</span>`
          : `<span class="mcq-score-chip">${nCorrect}/${nAnswered} ✓</span>`}
      </div>
      <div class="mcq-q-card">
        <div class="mcq-q-num">
          <span class="mcq-q-num-badge">Q${qNum} of ${n}</span>
          <span class="mcq-q-field-badge">${qLabel}</span>
          ${q.difficulty ? `<span class="mcq-diff-badge diff-${(q.difficulty||'medium').toLowerCase()}">${q.difficulty}</span>` : ''}
        </div>
        <div class="mcq-q-stem">${q.stem}</div>
      </div>
      <div class="mcq-options" id="mcq-opts">
        ${q.options.map((opt,i)=>`
          <button class="mcq-opt" onclick="mcqAnswer(${i})">
            <span class="mcq-opt-letter">${String.fromCharCode(65+i)}</span>
            <div class="mcq-opt-body">
              <div class="mcq-opt-text">${opt.replace(/^[A-E]\.\s*/,'')}</div>
              <div class="mcq-expl">${(q.explanations||[])[i]||''}</div>
            </div>
          </button>`).join('')}
      </div>
      <div class="mcq-pearl" id="mcq-pearl">🔑 <strong>High-Yield Pearl:</strong> ${q.pearl||''}</div>
      <div class="mcq-ref" id="mcq-ref">📚 ${q.reference||''}</div>
      ${(q.clinical_clue||q.trap||q.memory_anchor)?`
      <div class="mcq-insight" id="mcq-insight">
        ${q.clinical_clue?`<div class="mcq-insight-row"><span class="mcq-insight-lbl">🎯 Key clue in stem</span><span class="mcq-insight-val">${q.clinical_clue}</span></div>`:''}
        ${q.trap?`<div class="mcq-insight-row"><span class="mcq-insight-lbl">⚠ Trap</span><span class="mcq-insight-val">${q.trap}</span></div>`:''}
        ${q.memory_anchor?`<div class="mcq-insight-row"><span class="mcq-insight-lbl">🧠 Memory anchor</span><span class="mcq-insight-val">${q.memory_anchor}</span></div>`:''}
      </div>`:''}

      <button class="btn-gen btn-mcq-next" id="mcq-next" onclick="mcqNext()">
        <span>${stepsDone+1<n?'Next Question':'See Results'}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7h9M8.5 3.5L12 7l-3.5 3.5" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  body.parentElement.scrollTop=0;
}

function mcqAnswer(chosen) {
  const qIdx = mcqAdaptive ? mcqQueue[mcqStep] : mcqIdx;
  const q=mcqData.questions[qIdx];
  const isCorrect = chosen === q.correct;

  if (mcqMode === 'timed') {
    // Exam mode — blind: disable options but show no colours, no feedback
    document.querySelectorAll('.mcq-opt').forEach(btn => { btn.disabled = true; btn.classList.add('exam-answered'); });
    document.getElementById('mcq-next').classList.add('on');
  } else if (mcqMode === 'explanatory') {
    document.querySelectorAll('.mcq-opt').forEach((btn,i)=>{
      btn.disabled=true;
      if (i===q.correct)   btn.classList.add('correct');
      else if (i===chosen) btn.classList.add('wrong');
      else                 btn.classList.add('neutral');
    });
    const liveEl = document.createElement('div');
    liveEl.className = 'mcq-expl-live';
    document.getElementById('mcq-opts').after(liveEl);
    document.getElementById('mcq-next').classList.add('on');
    streamExplanation(q, chosen, liveEl);
  } else {
    // Practice mode
    document.querySelectorAll('.mcq-opt').forEach((btn,i)=>{
      btn.disabled=true;
      if (i===q.correct)   btn.classList.add('correct');
      else if (i===chosen) btn.classList.add('wrong');
      else                 btn.classList.add('neutral');
    });
    document.getElementById('mcq-pearl').classList.add('on');
    document.getElementById('mcq-ref').classList.add('on');
    const ins = document.getElementById('mcq-insight');
    if (ins) ins.classList.add('on');
    const liveEl = document.createElement('div');
    liveEl.className = 'mcq-expl-live';
    document.getElementById('mcq-next').before(liveEl);
    document.getElementById('mcq-next').classList.add('on');
    streamExplanation(q, chosen, liveEl);
  }
  mcqChosenAnswers[mcqAdaptive ? mcqStep : mcqIdx] = chosen;
  if (mcqAdaptive) {
    mcqAnswerDetails.push({
      correct: isCorrect,
      chosenIdx: chosen,
      difficulty: q.difficulty || 'Medium',
      subject: q.subject || q.field || 'General',
      system: q.system || 'General',
      topic: q.topic || '',
      points: q.points || (q.difficulty==='Hard'?3:q.difficulty==='Medium'?2:1)
    });
  } else {
    mcqAnswers.push(isCorrect);
  }
  document.getElementById('out-body').parentElement.scrollTop=
    document.getElementById('out-body').parentElement.scrollHeight;
}

// ─── ON-DEMAND EXPLANATION ────────────────────────────────────────────────────
async function streamExplanation(q, chosen, containerEl) {
  if (q._explLoaded) { renderExplanationPanel(q, chosen, containerEl); return; }

  containerEl.innerHTML = `
    <div class="mcq-expl-live-loading">
      <div class="expl-mini-spin"></div>
      Loading explanation…
    </div>`;

  try {
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stem: q.stem, options: q.options, correct: q.correct,
        field: q.field || 'Anatomy', pearl: q.pearl || ''
      })
    });
    if (!res.ok) throw new Error('Explanation request failed');

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
    renderExplanationPanel(q, chosen, containerEl);
  } catch (_) {
    containerEl.innerHTML = q.pearl
      ? `<div class="mcq-pearl on" style="display:block">🔑 <strong>Pearl:</strong> ${q.pearl}</div>`
      : '';
  }
}

function renderExplanationPanel(q, chosen, containerEl) {
  const isCorrect = chosen === q.correct;
  const clean = (txt) => (txt || '').replace(/^[A-E]\s*[—–-]\s*(Correct|Wrong)\s*:\s*/i, '');
  containerEl.innerHTML = `
    <div class="mcq-expl-panel ${isCorrect ? 'is-correct' : 'is-wrong'}">
      <div class="mcq-expl-verdict">
        <span style="width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;${isCorrect?'background:#C6F0DE;':'background:#F5C6C6;'}">${isCorrect ? '✓' : '✗'}</span>
        ${isCorrect ? 'Correct — well done!' : 'Not quite — here\'s the reasoning'}
      </div>
      ${!isCorrect ? `<div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl">Why your answer missed</div>
        <div class="mcq-expl-block-txt">${clean(q.explanations[chosen])}</div>
      </div>` : ''}
      <div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl">${isCorrect ? 'Core reasoning' : 'Correct — ' + q.options[q.correct].replace(/^[A-E]\.\s*/, '')}</div>
        <div class="mcq-expl-block-txt">${clean(q.explanations[q.correct])}</div>
      </div>
      ${q._integration ? `<div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl mcq-expl-pearl-lbl">Clinical integration</div>
        <div class="mcq-expl-block-txt">${q._integration}</div>
      </div>` : ''}
      ${q.pearl ? `<div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl mcq-expl-pearl-lbl">High-yield pearl</div>
        <div class="mcq-expl-block-txt">${q.pearl}</div>
      </div>` : ''}
      ${q.memory_anchor ? `<div class="mcq-expl-block">
        <div class="mcq-expl-block-lbl" style="color:var(--purple)">Memory anchor</div>
        <div class="mcq-expl-block-txt">${q.memory_anchor}</div>
      </div>` : ''}
    </div>`;
  containerEl.parentElement?.scrollTo({ top: containerEl.parentElement.scrollHeight, behavior: 'smooth' });
}

function mcqNext() {
  if (mcqAdaptive) {
    if (mcqStep + 1 < mcqData.questions.length) {
      const last = mcqAnswerDetails[mcqAnswerDetails.length - 1];
      const nextIdx = pickNextAdaptiveQuestion(last.difficulty, last.correct);
      if (nextIdx >= 0) mcqQueue.push(nextIdx);
    }
    mcqStep++;
  } else {
    mcqIdx++;
  }
  renderMCQQuestion();
}

function pickNextAdaptiveQuestion(lastDiff, wasCorrect) {
  const r = Math.random();
  let targetDiff;
  if      (lastDiff==='Easy'   && wasCorrect)  targetDiff = r<0.7?'Medium':'Hard';
  else if (lastDiff==='Medium' && wasCorrect)  targetDiff = r<0.7?'Hard':'Medium';
  else if (lastDiff==='Hard'   && wasCorrect)  targetDiff = r<0.5?'Hard':'Medium';
  else if (lastDiff==='Hard'   && !wasCorrect) targetDiff = r<0.7?'Medium':'Easy';
  else if (lastDiff==='Medium' && !wasCorrect) targetDiff = r<0.7?'Easy':'Medium';
  else                                         targetDiff = 'Easy';

  const answered = new Set(mcqQueue);
  const pool = mcqData.questions.map((q,i)=>({q,i})).filter(({i})=>!answered.has(i));
  const byDiff = pool.filter(({q})=>q.difficulty===targetDiff);
  if (byDiff.length) return byDiff[Math.floor(Math.random()*byDiff.length)].i;
  if (pool.length)   return pool[Math.floor(Math.random()*pool.length)].i;
  return -1;
}

// ─── STATS ─────────────────────────────────────────────────────────────────────
function renderMCQStats() {
  clearInterval(mcqTimerInterval); mcqTimerInterval=null;
  const body=document.getElementById('out-body');

  // Adaptive vs standard stats
  const n = mcqAdaptive ? mcqAnswerDetails.length : mcqData.questions.length;
  const nCorrect = mcqAdaptive ? mcqAnswerDetails.filter(d=>d.correct).length : mcqAnswers.filter(Boolean).length;
  const nWrong=n-nCorrect;
  const pct=Math.round((nCorrect/n)*100);
  const grade=pct>=80?'🏆 Excellent':pct>=60?'👍 Good':'📚 Keep Studying';
  const usedSecs = mcqMode === 'timed' ? (mcqData.questions.length * 60 - mcqQTimeLeft) : 0;
  const timeStr = mcqMode === 'timed'
    ? `${String(Math.floor(usedSecs/60)).padStart(2,'0')}:${String(usedSecs%60).padStart(2,'0')}`
    : '—';

  // Weighted score (adaptive only)
  const weightedEarned = mcqAdaptive ? mcqAnswerDetails.filter(d=>d.correct).reduce((s,d)=>s+d.points,0) : 0;
  const weightedTotal  = mcqAdaptive ? mcqAnswerDetails.reduce((s,d)=>s+d.points,0) : 0;

  // Build field map
  const fieldMap={};
  if (mcqAdaptive) {
    mcqAnswerDetails.forEach((d,i)=>{
      const f = d.subject||'General';
      if(!fieldMap[f]) fieldMap[f]={total:0,correct:0,wrong:[]};
      fieldMap[f].total++;
      if(d.correct) fieldMap[f].correct++;
      else { const q=mcqData.questions[mcqQueue[i]]; fieldMap[f].wrong.push({qid:i+1,stem:(q?.stem||'').slice(0,80)}); }
    });
  } else {
    mcqData.questions.forEach((q,i)=>{
      const f=q.field||'General Anatomy';
      if(!fieldMap[f]) fieldMap[f]={total:0,correct:0,wrong:[]};
      fieldMap[f].total++;
      if(mcqAnswers[i]) fieldMap[f].correct++;
      else fieldMap[f].wrong.push({qid:q.id,stem:q.stem.slice(0,80)});
    });
  }
  const fields=Object.entries(fieldMap).sort((a,b)=>(a[1].correct/a[1].total)-(b[1].correct/b[1].total));

  // Difficulty breakdown (adaptive only)
  const diffMap={};
  const sysMap={};
  if (mcqAdaptive) {
    mcqAnswerDetails.forEach(d=>{
      ['Easy','Medium','Hard'].includes(d.difficulty)&&(diffMap[d.difficulty]=diffMap[d.difficulty]||{total:0,correct:0});
      diffMap[d.difficulty].total++;
      if(d.correct) diffMap[d.difficulty].correct++;
      sysMap[d.system]=sysMap[d.system]||{total:0,correct:0};
      sysMap[d.system].total++;
      if(d.correct) sysMap[d.system].correct++;
    });
  }

  function fieldTagHtml(fp){
    if(fp>=.8) return '<span class="mcq-field-tag strong">✓ Strong</span>';
    if(fp>=.5) return '<span class="mcq-field-tag review">↗ Review</span>';
    return '<span class="mcq-field-tag improve">✗ Improve</span>';
  }
  function fieldBarColor(fp){
    return fp>=.8?'#0FAD6F':fp>=.5?'#E07B20':'#CC3A3A';
  }

  const breakdownRows = mcqAdaptive
    ? mcqAnswerDetails.map((d,i)=>{ const q=mcqData.questions[mcqQueue[i]]; return `
        <div class="mcq-br-row">
          <span class="mcq-br-ico">${d.correct?'✅':'❌'}</span>
          <div class="mcq-br-info">
            <span class="mcq-br-qnum">Q${i+1} · ${d.subject||'General'}</span>
            <span class="mcq-br-answer">${d.correct?'Correct':'Wrong — '+(q?.options[q?.correct]||'')}</span><br>
            <span class="mcq-br-stem">${(q?.stem||'').slice(0,110)}…</span>
          </div>
        </div>`;}).join('')
    : mcqData.questions.map((q,i)=>`
        <div class="mcq-br-row">
          <span class="mcq-br-ico">${mcqAnswers[i]?'✅':'❌'}</span>
          <div class="mcq-br-info">
            <span class="mcq-br-qnum">Q${i+1} · ${q.field||'Anatomy'}</span>
            <span class="mcq-br-answer">${mcqAnswers[i]?'Correct':'Wrong — '+q.options[q.correct]}</span><br>
            <span class="mcq-br-stem">${q.stem.slice(0,110)}…</span>
          </div>
        </div>`).join('');

  const hasWrong = mcqAdaptive ? mcqAnswerDetails.some(d=>!d.correct) : mcqData.questions.some((_,i)=>!mcqAnswers[i]);

  // ── Compute premium score metrics ─────────────────────────────────────────
  const medicaScore = mcqAdaptive
    ? computeMedicaScore(mcqAnswerDetails)
    : (()=>{ const wC=nCorrect*1.3,wM=n*1.3; return Math.round(Math.min(300,Math.max(100,wM>0?100+200*Math.log10(wC+1)/Math.log10(wM+1):100))); })();
  const readiness = getMedicaReadiness(medicaScore);
  const percentile = getPercentile(medicaScore);
  const passPct = getPassProbability(medicaScore);
  const improvedPct = getImprovedProbability(medicaScore);
  const { critical, moderate } = detectWeaknesses(fieldMap, diffMap);
  const studyPlan = buildStudyPlan(fieldMap);
  const gaugeLeft = Math.round((medicaScore-100)/200*100);
  const avgSec = mcqMode==='timed' && n>0 ? Math.round(usedSecs/n) : null;
  const speedLabel = avgSec===null ? null : avgSec<35?'Fast ⚡':avgSec<50?'Efficient':'Careful';
  const scoreInterpretation = getScoreInterpretation(medicaScore, pct, diffMap);
  const mistakes = diagnoseMistakes(mcqAdaptive?mcqAnswerDetails:[], diffMap, fieldMap);
  const strengths = detectStrengthZones(fieldMap);
  const forecast = getImprovementForecast(medicaScore, critical, moderate);
  const scoreClass = medicaScore >= 245 ? 'score-strong' : medicaScore >= 190 ? 'score-mid' : 'score-weak';

  // ── Exam post-review HTML (only in Exam mode) ─────────────────────────────
  const examReviewHtml = mcqMode === 'timed' ? (() => {
    const cards = mcqData.questions.map((q, i) => {
      const chosen = mcqAdaptive ? (mcqAnswerDetails[i]?.chosenIdx ?? -1) : mcqChosenAnswers[i];
      const wasCorrect = mcqAdaptive ? (mcqAnswerDetails[i]?.correct ?? false) : mcqAnswers[i];
      const optsHtml = q.options.map((opt, oi) => {
        let cls = 'opt-neutral';
        if (oi === q.correct) cls = 'opt-correct';
        else if (oi === chosen && !wasCorrect) cls = 'opt-chosen';
        return `<div class="exam-review-opt ${cls}">
          <span class="exam-review-opt-letter">${String.fromCharCode(65+oi)}</span>
          <span>${opt.replace(/^[A-E]\.\s*/,'')}</span>
        </div>`;
      }).join('');
      return `
        <div class="exam-review-card" id="er-card-${i}">
          <div class="exam-review-header" onclick="toggleExamReview(${i})">
            <span class="exam-review-qnum">Q${i+1}</span>
            <div class="exam-review-verdict ${wasCorrect?'v-correct':'v-wrong'}">${wasCorrect?'✓':'✗'}</div>
            <span class="exam-review-stem">${q.stem.slice(0,100)}${q.stem.length>100?'…':''}</span>
            <span class="exam-review-chevron">▼</span>
          </div>
          <div class="exam-review-body">
            <div class="exam-review-opts">${optsHtml}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div>
        <div class="mcq-section-ttl">Exam Review — Full Answer Key</div>
        <div class="exam-review-wrap">${cards}</div>
      </div>`;
  })() : '';

  // ── Study prescription HTML ────────────────────────────────────────────────
  const rxP1 = studyPlan.slice(0,2);
  const rxP2 = studyPlan.slice(2,4);
  const rxP3 = studyPlan.slice(4,6).filter(s=>s.pct>=65);
  const studyRxHtml = studyPlan.length ? `
    <div class="study-rx">
      <div class="study-rx-hdr">
        <div class="study-rx-eyebrow">Medica Step 1</div>
        <div class="study-rx-title">Your Study Prescription</div>
      </div>
      <div class="study-rx-body">
        ${rxP1.length?`<div class="study-rx-block study-rx-p1">
          <div class="study-rx-p-lbl study-rx-p1-lbl">Priority 1 — Fix First</div>
          ${rxP1.map(s=>`<div class="study-rx-item"><span class="study-rx-pct-badge">${s.pct}%</span><div><strong>${s.name}</strong><div class="study-rx-advice">${s.advice}</div></div></div>`).join('')}
        </div>`:''}
        ${rxP2.length?`<div class="study-rx-block study-rx-p2">
          <div class="study-rx-p-lbl study-rx-p2-lbl">Priority 2 — Reinforce</div>
          ${rxP2.map(s=>`<div class="study-rx-item"><span class="study-rx-pct-badge">${s.pct}%</span><div><strong>${s.name}</strong><div class="study-rx-advice">${s.advice}</div></div></div>`).join('')}
        </div>`:''}
        ${rxP3.length?`<div class="study-rx-block study-rx-p3">
          <div class="study-rx-p-lbl study-rx-p3-lbl">Priority 3 — Maintain</div>
          ${rxP3.map(s=>`<div class="study-rx-item"><span class="study-rx-pct-badge">${s.pct}%</span><div><strong>${s.name}</strong><div class="study-rx-advice">${s.advice}</div></div></div>`).join('')}
        </div>`:''}
      </div>
    </div>` : '';

  // ── Mistake diagnosis HTML ─────────────────────────────────────────────────
  const mistakeDiagHtml = mistakes.length ? `
    <div>
      <div class="mcq-section-ttl">Error Pattern Analysis</div>
      <div class="mistake-card">
        <div class="mistake-hdr">What the mistakes reveal</div>
        ${mistakes.map(m=>`
          <div class="mistake-item">
            <div class="mistake-dot" style="background:${m.color}"></div>
            <div class="mistake-meta">
              <div class="mistake-type-name" style="color:${m.color}">${m.type}</div>
              <div class="mistake-type-desc">${m.desc}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  // ── Strength zones HTML ─────────────────────────────────────────────────────
  const strengthZonesHtml = strengths.length ? `
    <div>
      <div class="mcq-section-ttl">Your Strength Zones</div>
      <div class="strength-list">
        ${strengths.map(s=>`
          <div class="strength-zone">
            <span class="strength-zone-name">${s.name}</span>
            <div class="strength-zone-right">
              <div class="strength-zone-bar"><div class="strength-zone-fill" style="width:${s.pct}%"></div></div>
              <span class="strength-zone-pct">${s.pct}%</span>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  // ── Improvement forecast HTML ───────────────────────────────────────────────
  const forecastHtml = `
    <div>
      <div class="mcq-section-ttl">Improvement Forecast</div>
      <div class="forecast-card">
        <div class="forecast-left">
          <div class="forecast-gain">${forecast.gain}</div>
          <div class="forecast-gain-lbl">Points<br>Possible</div>
        </div>
        <div class="forecast-right">
          <div class="forecast-note">${forecast.note}</div>
          <div class="forecast-week">Realistic timeframe: ${forecast.weeks} week${forecast.weeks==='1'?'':'s'}</div>
        </div>
      </div>
    </div>`;

  // ── Weakness detector HTML ──────────────────────────────────────────────────
  const weaknessHtml = (critical.length || moderate.length) ? `
    <div>
      <div class="mcq-section-ttl">Weakness Detector</div>
      <div class="weakness-detector">
        ${critical.length?`<div class="weakness-group critical">
          <div class="weakness-group-hdr">⚠ Critical — needs immediate focus</div>
          ${critical.map(w=>`<div class="weakness-item"><span>${w.name}</span><span class="weakness-pct-crit">${w.pct}%</span></div>`).join('')}
        </div>`:''}
        ${moderate.length?`<div class="weakness-group moderate">
          <div class="weakness-group-hdr">↗ Moderate — review this week</div>
          ${moderate.map(w=>`<div class="weakness-item"><span>${w.name}</span><span class="weakness-pct-mod">${w.pct}%</span></div>`).join('')}
        </div>`:''}
      </div>
    </div>` : '';

  // ── Subject cards HTML ──────────────────────────────────────────────────────
  const subjectCardsHtml = fields.length ? `
    <div>
      <div class="mcq-section-ttl">Subject Performance</div>
      <div class="subject-card-grid">
        ${fields.map(([fname,fd])=>{
          const fpct=Math.round(fd.correct/fd.total*100);
          const perf=fpct>=80?'perf-strong':fpct>=65?'perf-pass':fpct>=50?'perf-border':'perf-below';
          return `<div class="subject-card ${perf}">
            <div class="subject-card-top">
              <span class="subject-card-name">${fname}</span>
              ${subjectLevelChip(fpct)}
            </div>
            <div class="subject-bar-row">
              <div class="subject-bar-track">
                <div class="subject-bar-fill" data-pct="${fpct}" style="background:${subjectBarColor(fpct)}"></div>
              </div>
              <span class="subject-pct" style="color:${subjectBarColor(fpct)}">${fpct}%</span>
            </div>
          </div>`;}).join('')}
      </div>
    </div>` : '';

  // ── Difficulty breakdown HTML ───────────────────────────────────────────────
  const diffBreakdownHtml = mcqAdaptive && Object.keys(diffMap).length ? `
    <div>
      <div class="mcq-section-ttl">Performance by Question Tier</div>
      <div class="mcq-field-chart">
        ${['Easy','Medium','Hard'].filter(d=>diffMap[d]).map(d=>{
          const fd=diffMap[d]; const fp=fd.correct/fd.total; const fpct=Math.round(fp*100);
          const label = d==='Easy'?'Tier 1':d==='Medium'?'Tier 2':'Tier 3';
          return `<div class="mcq-field-row">
            <div class="mcq-field-header">
              <span class="mcq-field-name">${label}</span>
              <div class="mcq-field-right"><span class="mcq-field-score">${fd.correct}/${fd.total} &middot; ${fpct}%</span>${fieldTagHtml(fp)}</div>
            </div>
            <div class="mcq-field-bar-track"><div class="mcq-field-bar-fill" data-pct="${fpct}" style="background:${fieldBarColor(fp)}"></div></div>
          </div>`;}).join('')}
      </div>
    </div>` : '';

  // ── System chart HTML ───────────────────────────────────────────────────────
  const sysChartHtml = mcqAdaptive && Object.keys(sysMap).length > 1 ? `
    <div>
      <div class="mcq-section-ttl">Performance by System</div>
      <div class="mcq-field-chart">
        ${Object.entries(sysMap).sort((a,b)=>(a[1].correct/a[1].total)-(b[1].correct/b[1].total)).map(([sname,fd])=>{
          const fp=fd.correct/fd.total; const fpct=Math.round(fp*100);
          return `<div class="mcq-field-row">
            <div class="mcq-field-header">
              <span class="mcq-field-name">${sname}</span>
              <div class="mcq-field-right"><span class="mcq-field-score">${fd.correct}/${fd.total} &middot; ${fpct}%</span>${fieldTagHtml(fp)}</div>
            </div>
            <div class="mcq-field-bar-track"><div class="mcq-field-bar-fill" data-pct="${fpct}" style="background:${fieldBarColor(fp)}"></div></div>
          </div>`;}).join('')}
      </div>
    </div>` : '';

  body.innerHTML=`
    <div class="mcq-wrap">

      <!-- MEDICA SCORE CARD -->
      <div class="medica-score-card ${scoreClass}" style="border-top:3px solid ${readiness.color}">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <div class="mcq-stats-topic">${mcqData.title||'USMLE Step 1'}</div>
          <span style="font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:20px;background:var(--blue-10);color:var(--blue)">${mcqMode==='timed'?'Exam':mcqMode==='unlimited'?'Practice':'Coach'}</span>
        </div>
        <div class="medica-score-num" style="color:${readiness.color}">${medicaScore}</div>
        <div class="medica-score-range">Medica Score &nbsp;/&nbsp; 100–300 scale</div>
        <span class="medica-readiness-chip" style="color:${readiness.color};background:${readiness.bg}">${readiness.label}</span>
        <div class="medica-score-interp">${scoreInterpretation}</div>
        <div class="medica-bar-wrap">
          <div class="medica-bar-track">
            <div class="medica-bar-marker" style="left:${gaugeLeft}%"></div>
          </div>
          <div class="medica-bar-labels">
            <span>100</span><span>150</span><span>190</span><span>220</span><span>245</span><span>260</span><span>280</span><span>300</span>
          </div>
        </div>
        <div class="medica-pills-row">
          <div class="medica-pill"><span class="medica-pill-val">${pct}%</span><span class="medica-pill-lbl">Accuracy</span></div>
          <div class="medica-pill"><span class="medica-pill-val">Top ${100-percentile}%</span><span class="medica-pill-lbl">Percentile</span></div>
          ${avgSec!==null?`<div class="medica-pill"><span class="medica-pill-val">${avgSec}s</span><span class="medica-pill-lbl">Avg/Q · ${speedLabel}</span></div>`:''}
          <div class="medica-pill"><span class="medica-pill-val">${timeStr!=='—'?timeStr:n+'Q'}</span><span class="medica-pill-lbl">${timeStr!=='—'?'Time Used':'Questions'}</span></div>
        </div>
      </div>

      <!-- QUICK STATS -->
      <div class="mcq-stat-row">
        <div class="mcq-stat-box s-green"><div class="s-val">${nCorrect}</div><div class="s-lbl">Correct</div></div>
        <div class="mcq-stat-box s-red">  <div class="s-val">${nWrong}</div>  <div class="s-lbl">Wrong</div></div>
        <div class="mcq-stat-box">        <div class="s-val">${n}</div>        <div class="s-lbl">Questions</div></div>
        <div class="mcq-stat-box">        <div class="s-val" style="font-size:16px">${timeStr}</div><div class="s-lbl">Time</div></div>
      </div>

      <!-- ERROR PATTERN ANALYSIS (Practice / Coach only) -->
      ${mcqMode !== 'timed' ? mistakeDiagHtml : ''}

      <!-- WEAKNESS DETECTOR (Practice / Coach only) -->
      ${mcqMode !== 'timed' ? weaknessHtml : ''}

      <!-- SUBJECT PERFORMANCE -->
      ${subjectCardsHtml}

      <!-- STRENGTH ZONES (Practice / Coach only) -->
      ${mcqMode !== 'timed' ? strengthZonesHtml : ''}

      <!-- DIFFICULTY TIERS -->
      ${diffBreakdownHtml}

      <!-- SYSTEM BREAKDOWN -->
      ${sysChartHtml}

      <!-- STEP 1 PREDICTION -->
      <div class="prediction-card">
        <div class="prediction-eyebrow">Step 1 Readiness Estimate</div>
        <div class="prediction-prob-row">
          <div>
            <div class="prediction-prob-num">${passPct}%</div>
            <div class="prediction-prob-sub">Pass probability</div>
          </div>
          <div class="prediction-divider"></div>
          <div class="prediction-improved">
            <div class="prediction-improved-val">${improvedPct}%</div>
            <div class="prediction-improved-lbl">After targeted<br>review</div>
          </div>
        </div>
      </div>

      <!-- IMPROVEMENT FORECAST (Practice / Coach only) -->
      ${mcqMode !== 'timed' ? forecastHtml : ''}

      <!-- STUDY PRESCRIPTION (Practice / Coach only) -->
      ${mcqMode !== 'timed' ? studyRxHtml : ''}

      <!-- CTA (Exam mode only) -->
      ${mcqMode === 'timed' ? `
      <div style="margin-top:8px">
        <button class="btn-rescue" onclick="mcqRetry()" style="background:var(--t1);box-shadow:0 4px 18px rgba(11,29,51,.25)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 1 0 1-3" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M2 2v3h3" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Retake Exam
        </button>
      </div>` : ''}

      <!-- AI PERFORMANCE COACH (Practice / Coach only) -->
      ${mcqMode !== 'timed' ? `
      <div class="ai-coach-card">

        <div class="ai-coach-hdr">
          <div class="ai-coach-hdr-l">
            <div class="ai-coach-icon">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <circle cx="8.5" cy="8.5" r="6.5" stroke="var(--blue)" stroke-width="1.4"/>
                <path d="M8.5 5.5v3.2l2.1 1.3" stroke="var(--blue)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <div class="ai-coach-title">AI Performance Coach</div>
              <div class="ai-coach-sub">Diagnosis · Recovery · Next Action</div>
            </div>
          </div>
          <div class="ai-coach-mode-pill">${mcqMode === 'explanatory' ? 'Coach' : 'Practice'}</div>
        </div>

        <div id="ai-coach-body" class="ai-coach-body">
          <div class="ai-coach-loading">
            <div class="sp" style="display:block;border-color:rgba(11,29,51,.1);border-top-color:var(--blue)"></div>
            ⏳ Finalising your personalised expert review…
          </div>
        </div>

        <div class="ai-coach-actions" id="ai-coach-actions" style="display:none">
          ${hasWrong ? `
          <button class="ai-coach-btn-primary" id="btn-recovery" onclick="startWeakSpotRecovery()">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3.22 3.22l1.41 1.41M9.37 9.37l1.41 1.41M3.22 10.78l1.41-1.41M9.37 4.63l1.41-1.41" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
            Start Weak Spot Recovery
          </button>
          <div class="ai-coach-btn-row">
            <button class="ai-coach-btn-sec" onclick="mcqRetry()">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 1 0 1-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2 2v3h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Retest Weak Areas
            </button>
            ${mcqMode !== 'explanatory' ? `<button class="ai-coach-btn-sec" onclick="buildRescuePlan()">📅 7-Day Rescue Plan</button>` : ''}
          </div>
          ${mcqMode === 'explanatory' ? `
          <button class="btn-fc" id="btn-gen-fc" onclick="generateFlashcards()">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="7.5" rx="1.5" stroke="white" stroke-width="1.4"/><path d="M4 11.5h6M7 9.5v2" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg>
            Generate Flashcards from Wrong Answers
          </button>` : ''}` : `
          <div class="ai-coach-perfect">
            <span class="ai-coach-perfect-ico">✦</span>
            <span>Excellent performance. Next step: increase difficulty or try a timed exam block.</span>
          </div>`}
          <button class="ai-coach-btn-sec ai-coach-retry-btn" onclick="mcqRetry()">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 1 0 1-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2 2v3h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Retry This Quiz
          </button>
        </div>

        <div id="ai-coach-recovery" style="display:none">
          <div class="ai-coach-recovery-slot">
            <div class="ai-coach-recovery-hdr">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3.22 3.22l1.41 1.41M9.37 9.37l1.41 1.41M3.22 10.78l1.41-1.41M9.37 4.63l1.41-1.41" stroke="var(--blue)" stroke-width="1.5" stroke-linecap="round"/></svg>
              Weak Spot Recovery
            </div>
            <div id="ai-coach-recovery-body" class="ai-coach-recovery-body"></div>
          </div>
        </div>

        <div id="rescue-plan-section" style="display:none">
          <div class="ai-coach-recovery-slot">
            <div class="ai-coach-recovery-hdr">📅 7-Day Rescue Plan</div>
            <div class="rescue-plan-body" id="rescue-plan-body"></div>
          </div>
        </div>

        ${mcqMode === 'explanatory' && hasWrong ? `
        <div id="fc-section" style="display:none;padding:0 20px 20px"></div>` : ''}

      </div>` : ''}

      <!-- EXAM REVIEW (Exam mode only) -->
      ${examReviewHtml}

      <!-- QUESTION BREAKDOWN (Practice / Coach only) -->
      ${mcqMode !== 'timed' ? `<div>
        <div class="mcq-breakdown-ttl">Question Breakdown</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">
          ${breakdownRows}
        </div>
      </div>` : ''}

    </div>`;

  body.parentElement.scrollTop=0;

  // Animate bars after paint
  requestAnimationFrame(()=>{
    document.querySelectorAll('.mcq-field-bar-fill, .subject-bar-fill').forEach(el=>{
      el.style.width=el.dataset.pct+'%';
    });
  });

  // Stream AI feedback — Practice and Coach only
  if (mcqMode !== 'timed') {
    streamMCQFeedback(fieldMap, nCorrect, n, medicaScore, readiness, passPct);
  }
}

async function buildRescuePlan() {
  const planSection = document.getElementById('rescue-plan-section');
  const planEl = document.getElementById('rescue-plan-body');
  if (!planSection || !planEl) return;
  planSection.style.display = '';
  planEl.innerHTML = `<div class="ai-coach-loading"><div class="sp" style="display:block;border-color:rgba(11,29,51,.1);border-top-color:var(--blue)"></div>⏳ Building your 7-day rescue plan…</div>`;
  planSection.scrollIntoView({ behavior:'smooth', block:'start' });

  const n = mcqAdaptive ? mcqAnswerDetails.length : mcqData.questions.length;
  const nC = mcqAdaptive ? mcqAnswerDetails.filter(d=>d.correct).length : mcqAnswers.filter(Boolean).length;
  const pct = Math.round(nC/n*100);
  const wm = {};
  if (mcqAdaptive) {
    mcqAnswerDetails.forEach(d=>{ if(!d.correct){ wm[d.subject]=wm[d.subject]||{total:0,wrong:0}; wm[d.subject].total++; wm[d.subject].wrong++; } else { wm[d.subject]=wm[d.subject]||{total:0,wrong:0}; wm[d.subject].total++; } });
  }
  const weakList = Object.entries(wm).filter(([,v])=>v.wrong/v.total>=0.4).map(([s])=>s).join(', ') || 'reviewed subjects';
  const ms = mcqAdaptive ? computeMedicaScore(mcqAnswerDetails) : Math.round(100+200*(pct/100));

  const guide = `Student: Medica Score ${ms}/300, ${pct}% accuracy. Weak areas: ${weakList}. Topic: ${mcqData.title||'USMLE Step 1'}.`;
  const systemPrompt = `You are a USMLE Step 1 study strategist at MEDICA. Build a precise 7-Day Rescue Plan.

Format each day as:
### Day [N] — [Subject / Topic]
**Focus:** [specific concept]
**Resources:** [First Aid/Pathoma/Sketchy/BnB + chapter]
**Action:** [what to do, e.g. read + 10 vignettes + flashcard 5 rules]
**Time:** [1.5–3 hours]

After Day 7 add:
### End-of-Week Check
How to self-assess readiness before the next quiz.

Rules:
- Days 1–2: hardest weak areas first (highest ROI)
- Days 3–5: medium weak areas + targeted drilling
- Day 6: mixed review from all weak areas
- Day 7: timed mini-block + self-assessment
- Be specific with resource names and chapter references
- Keep each day achievable (under 3 hours)
- Medica tone: direct, expert, encouraging`;

  try {
    const res = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({skillId:null,guide,customSkill:{name:'7-Day Rescue Plan',systemPrompt}}) });
    let raw='',buf='';
    planEl.innerHTML='<span class="tcur"></span>';
    const rd=res.body.getReader(), dc=new TextDecoder();
    while(true){
      const{done,value}=await rd.read(); if(done) break;
      buf+=dc.decode(value,{stream:true});
      const lines=buf.split('\n'); buf=lines.pop();
      for(const ln of lines){
        if(!ln.startsWith('data: ')) continue;
        const d=ln.slice(6).trim(); if(!d) continue;
        const ev=JSON.parse(d);
        if(ev.type==='text'){ raw+=ev.text; planEl.innerHTML=md(raw)+'<span class="tcur"></span>'; planSection.scrollIntoView({behavior:'smooth',block:'nearest'}); }
        else if(ev.type==='done'){ planEl.innerHTML=md(raw); }
        else if(ev.type==='error'){ planEl.innerHTML=`<p style="color:var(--red)">⚠ ${ev.message}</p>`; }
      }
    }
  } catch(e) { planEl.innerHTML='<p style="color:var(--t4);font-size:12px">Plan generation unavailable.</p>'; }
}

// ─── FLASHCARD GENERATION ──────────────────────────────────────────────────────
async function generateFlashcards() {
  const btn = document.getElementById('btn-gen-fc');
  const fcSection = document.getElementById('fc-section');
  if (!btn || !fcSection) return;

  const wrongQs = mcqAdaptive
    ? mcqAnswerDetails.map((d,i)=>({d,q:mcqData.questions[mcqQueue[i]]})).filter(({d})=>!d.correct).map(({q})=>q).filter(Boolean)
    : mcqData.questions.filter((_,i)=>!mcqAnswers[i]);
  if (!wrongQs.length) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="sp" style="display:block;border-color:rgba(255,255,255,.25);border-top-color:#fff;width:13px;height:13px"></div> Building memory cards…`;

  fcSection.style.display = '';
  fcSection.innerHTML = `<div class="fc-loading"><div class="sp" style="display:block;border-color:rgba(11,29,51,.1);border-top-color:var(--blue)"></div>⏳ Building memory cards from your missed concepts…</div>`;
  fcSection.scrollIntoView({ behavior:'smooth', block:'start' });

  const wrongSummary = wrongQs.map((q,i) => `Question id:${i+1}\nField:${q.field||'General'} | System:${q.system||''} | Subject:${q.subject||q.field||''}\nStem: ${q.stem}\nCorrect: ${q.options[q.correct]}\nPearl: ${q.pearl||''}`).join('\n---\n');
  const guide = `Generate flashcards for ${wrongQs.length} missed USMLE question(s).\n\n${wrongSummary}`;

  const systemPrompt = `You are a USMLE Step 1 flashcard generator for Medica.

For each missed question, generate exactly 5 flashcards:
1. cardType "recall" — basic recall of the core fact
2. cardType "vignette" — mini clinical scenario testing the same concept
3. cardType "compare" — compare/contrast with a related concept
4. cardType "high_yield" — one high-yield rule or pattern
5. cardType "trap" — a common misconception or exam trap to avoid

Return ONLY a valid JSON object in this exact shape — no markdown fences, no commentary:
{
  "flashcards": [
    {
      "front": "Question prompt shown to the student.",
      "back": "Clear answer with concise explanation.",
      "subject": "Anatomy",
      "system": "Musculoskeletal",
      "topic": "Nerve Lesions",
      "subtopic": "Radial Nerve",
      "sourceQuestionId": 1,
      "difficulty": "Easy",
      "cardType": "recall"
    }
  ]
}

Rules:
- front is a question, never a statement
- back is a direct answer with brief clinical reason, under 80 words
- sourceQuestionId is the integer id of the missed question (1, 2, 3…)
- difficulty is one of: Easy | Medium | Hard
- cardType is one of: recall | vignette | compare | high_yield | trap
- Keep language at USMLE Step 1 level
- Focus on the exact missed concept, not general topic review`;

  try {
    const res = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({skillId:null, guide, customSkill:{name:'Flashcard Generator', systemPrompt}}) });
    if (!res.ok) throw new Error('Generation failed');

    let raw='', buf='';
    const rd=res.body.getReader(), dc=new TextDecoder();
    while(true) {
      const{done,value}=await rd.read(); if(done) break;
      buf+=dc.decode(value,{stream:true});
      const lines=buf.split('\n'); buf=lines.pop();
      for(const ln of lines) {
        if(!ln.startsWith('data: ')) continue;
        const d=ln.slice(6).trim(); if(!d) continue;
        const ev=JSON.parse(d);
        if(ev.type==='text') raw+=ev.text;
        else if(ev.type==='done') {
          try {
            const jsonStr = repairJSON(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'').trim());
            const parsed = JSON.parse(jsonStr);
            const cards = Array.isArray(parsed) ? parsed : (parsed.flashcards || []);
            if (!cards.length) throw new Error('Empty flashcard set');
            renderFlashcards(cards, fcSection);
          } catch(e) {
            fcSection.innerHTML = '<p style="color:var(--red);font-size:12px;">⚠ Could not parse flashcards. Please try again.</p>';
          }
          btn.style.display = 'none';
        }
        else if(ev.type==='error') throw new Error(ev.message);
      }
    }
  } catch(e) {
    fcSection.innerHTML = `<p style="color:var(--red);font-size:12px;">⚠ ${e.message}</p>`;
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="7.5" rx="1.5" stroke="white" stroke-width="1.4"/><path d="M4 11.5h6M7 9.5v2" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg> Generate Flashcards from Wrong Answers`;
  }
}

function renderFlashcards(cards, container) {
  const typeLabel = {recall:'Recall',vignette:'Vignette',compare:'Compare',high_yield:'High-Yield',trap:'Trap'};
  const grouped = {};
  cards.forEach(c => {
    const k = c.sourceQuestionId != null ? String(c.sourceQuestionId) : '?';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(c);
  });

  const sectionsHtml = Object.entries(grouped)
    .sort((a,b) => Number(a[0]) - Number(b[0]))
    .map(([qid, qcards]) => `
    <div>
      <div class="mcq-section-ttl" style="margin-bottom:8px">Missed Question ${qid}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${qcards.map((c,i) => {
          const safeId = 'fc-q'+qid+'-'+i;
          const diffColor = c.difficulty==='Hard'?'#CC3A3A':c.difficulty==='Medium'?'#E07B20':'#0FAD6F';
          return `<div class="fc-card" id="${safeId}" onclick="toggleFC('${safeId}')">
            <div class="fc-card-front">
              <div class="fc-card-meta">
                <span class="fc-type-badge fc-type-${c.cardType}">${typeLabel[c.cardType]||c.cardType}</span>
                <span class="fc-subject">${c.subject||''}${c.system?' · '+c.system:''}</span>
                ${c.difficulty?`<span style="margin-left:auto;font-size:9px;font-weight:700;color:${diffColor}">${c.difficulty}</span>`:''}
              </div>
              <div class="fc-q">${c.front}</div>
              <div class="fc-flip-hint">Tap to reveal answer ▼</div>
            </div>
            <div class="fc-card-back">
              <div class="fc-a">${c.back}</div>
              ${c.topic?`<div style="font-size:10px;color:var(--t4);margin-top:8px">${c.topic}${c.subtopic?' · '+c.subtopic:''}</div>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');

  container.innerHTML = `<div class="fc-section">
    <div class="mcq-section-ttl">Flashcards from Missed Concepts &nbsp;·&nbsp; ${cards.length} cards</div>
    ${sectionsHtml}
  </div>`;
}

function toggleFC(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

async function startWeakSpotRecovery() {
  const wrongQs = mcqAdaptive
    ? mcqAnswerDetails.map((d,i)=>({d,q:mcqData.questions[mcqQueue[i]]})).filter(({d})=>!d.correct).map(({q})=>q).filter(Boolean)
    : mcqData.questions.filter((_, i) => !mcqAnswers[i]);
  if (!wrongQs.length) return;

  const recoverySection = document.getElementById('ai-coach-recovery');
  const recoveryEl = document.getElementById('ai-coach-recovery-body');
  const btn = document.getElementById('btn-recovery');
  if (!recoverySection || !recoveryEl) return;

  if (btn) { btn.disabled = true; btn.innerHTML = `<div class="sp" style="display:block;border-color:rgba(255,255,255,.25);border-top-color:#fff;width:13px;height:13px"></div> Building recovery plan…`; }

  recoverySection.style.display = '';
  recoveryEl.innerHTML = `<div class="ai-coach-loading"><div class="sp" style="display:block;border-color:rgba(11,29,51,.1);border-top-color:var(--blue)"></div>⏳ Building your weak spot recovery plan…</div>`;
  recoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const wrongSummary = wrongQs.map(q =>
    `Field: ${q.field||'General'}\nStem: ${q.stem.slice(0,120)}\nCorrect: ${q.options[q.correct]}\nPearl: ${q.pearl||''}`
  ).join('\n\n');

  const guide = `Student missed ${wrongQs.length} question(s) in: ${mcqData.title||'USMLE Step 1'}\n\n${wrongSummary}`;

  const systemPrompt = `You are a Medica AI clinical coach delivering a Weak Spot Recovery session.

For each missed concept, write exactly:

### [Field / Topic]

**What to fix first:** One sentence — the exact concept gap, not the subject name.

**Why this weakness matters:** One sentence on Step 1 or clinical relevance.

**Focused explanation:** 5–7 sentences, mechanism first. Pathophysiology → clinical presentation → exam angle. Make it memorable, not a textbook paragraph.

**High-yield rule:** One bold rule that makes this stick.

**3 targeted micro-drills:**
1. [Concrete study task — name exact resource + action + time]
2. [Concrete study task]
3. [Concrete study task]

**Retest recommendation:** One sentence — when and how to confirm the gap is closed.

---

End with:

## Recovery Priority Order

Numbered list ranking the missed concepts from highest to lowest exam ROI. One line each.

Rules:
- Specific and personal — reference actual stems and fields.
- No generic advice.
- No motivational fluff.
- Medica standard: elite, precise, actionable.`;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: null, guide, customSkill: { name: 'Weak Spot Recovery', systemPrompt } })
    });
    if (!res.ok) throw new Error('Recovery unavailable');

    let raw = '', buf = '';
    const rd = res.body.getReader(), dc = new TextDecoder();
    while (true) {
      const { done, value } = await rd.read();
      if (done) break;
      buf += dc.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const ln of lines) {
        if (!ln.startsWith('data: ')) continue;
        const d = ln.slice(6).trim(); if (!d) continue;
        const ev = JSON.parse(d);
        if (ev.type === 'text') { raw += ev.text; }
        else if (ev.type === 'done') {
          recoveryEl.innerHTML = md(raw);
          recoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        else if (ev.type === 'error') { recoveryEl.innerHTML = `<p style="color:var(--red)">⚠ ${ev.message}</p>`; }
      }
    }
  } catch(e) {
    recoveryEl.innerHTML = '<p style="color:var(--t4);font-size:12px">Recovery unavailable.</p>';
    if (btn) { btn.disabled = false; btn.innerHTML = 'Start Weak Spot Recovery'; }
  }
}

async function streamMCQFeedback(fieldMap, nCorrect, n, medicaScoreArg, readinessArg, passPctArg) {
  const pct=Math.round((nCorrect/n)*100);
  const ms = medicaScoreArg || Math.round(100+200*(pct/100));
  const rl = readinessArg?.label || '';
  const pp = passPctArg || pct;
  const subject = mcqData.metadata?.subject || mcqData.title || 'Medical';
  const fieldLines=Object.entries(fieldMap).map(([fname,fd])=>{
    const fpct=Math.round((fd.correct/fd.total)*100);
    const wrongNote=fd.wrong.length
      ?` — missed Q${fd.wrong.map(w=>w.qid).join(', Q')}. Context: ${fd.wrong.map(w=>w.stem).join(' | ')}`
      :' — all correct';
    return `- ${fname}: ${fd.correct}/${fd.total} (${fpct}%)${wrongNote}`;
  }).join('\n');

  const guide=`Student completed ${subject} at MEDICA Step 1 Platform.
Medica Score: ${ms}/300 — ${rl}
Overall: ${nCorrect}/${n} (${pct}%) | Pass probability: ${pp}%
Topic: ${mcqData.title||subject}

Field breakdown:
${fieldLines}`;

  const systemPrompt=`You are a senior USMLE Step 1 performance coach at MEDICA Medical Education Centre. Think private professor meets elite exam strategist.

The student scored ${ms}/300 (${rl}), ${pct}% accuracy, pass probability ${pp}%.

Your analysis must feel like a private coach — not a report generator. Use the field breakdown data to make every insight specific and personal.

Structure (use markdown, keep each section tight):

---
## Executive Summary
2–3 sentences. Diagnose the performance pattern — not just the score. What does ${ms}/300 reveal about where they actually are? Be direct and specific.

---
## What Your Mistakes Are Telling You
Analyze the error pattern across subjects. Are mistakes clustered or scattered? Knowledge gaps vs concept confusion vs reasoning errors? Name the specific mechanism or concept that is failing — not just the subject.

---
## Deep Dive: Weak Areas
For each subject below 75% accuracy only:

**[Subject Name]** — [X]% accuracy
*Root cause:* The specific concept/mechanism that is failing (not generic).
*Why it matters:* Its exact clinical or exam relevance on Step 1.
*Fix it:* Exact action + resource + time estimate. E.g.: 'Rewatch Pathoma Ch.4 glycogen storage diseases (45 min), then do 8 RTA vignettes with timed review.'

---
## What You Already Own
Acknowledge the strongest subject(s) in one sentence. Make the student feel good about what is working.

---
## Improvement Forecast
One specific, honest sentence: 'If you fix [specific area] in the next [X] weeks, your Medica Score could realistically reach [range].'

---
## Today's #1 Priority
ONE thing. The single highest-ROI concept to study in the next 2 hours. Be precise — not 'study pharmacology' but 'Master autonomic receptor pharmacology: alpha vs beta mechanisms, 5 drug examples, then do 5 vignettes.'

---
Style rules:
- Expert, warm, direct. Never robotic.
- Reference actual subjects and scores.
- Convert every weakness into hope — these are fixable.
- Each section under 120 words. High signal only.
- No filler phrases. No 'great job' padding.
- Medica standard: elite, precise, personal.`;

  const coachBody=document.getElementById('ai-coach-body');
  if(!coachBody) return;

  try {
    const res=await fetch('/api/generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({skillId:null,guide,customSkill:{name:'MCQ Feedback',systemPrompt}})
    });
    if(!res.ok){coachBody.innerHTML='<p style="color:var(--t4);font-size:12px">Analysis unavailable.</p>';return;}

    let raw='',buf='';
    const rd=res.body.getReader(),dc=new TextDecoder();
    while(true){
      const{done,value}=await rd.read();
      if(done) break;
      buf+=dc.decode(value,{stream:true});
      const lines=buf.split('\n');buf=lines.pop();
      for(const ln of lines){
        if(!ln.startsWith('data: ')) continue;
        const d=ln.slice(6).trim();if(!d) continue;
        const ev=JSON.parse(d);
        if(ev.type==='text'){
          raw+=ev.text;
        } else if(ev.type==='done'){
          coachBody.innerHTML=md(raw);
          const actionsEl=document.getElementById('ai-coach-actions');
          if(actionsEl) actionsEl.style.display='';
        } else if(ev.type==='error'){
          coachBody.innerHTML=`<p style="color:var(--red);font-size:12px">⚠ ${ev.message}</p>`;
        }
      }
    }
  } catch(e){
    coachBody.innerHTML='<p style="color:var(--t4);font-size:12px">Analysis unavailable.</p>';
  }
}

function toggleExamReview(i) {
  const card = document.getElementById('er-card-'+i);
  if (card) card.classList.toggle('open');
}

function mcqRetry() {
  clearInterval(mcqTimerInterval); mcqTimerInterval=null;
  mcqIdx=0; mcqAnswers=[]; mcqChosenAnswers=[]; mcqQTimeLeft=0;
  if (mcqAdaptive) {
    const firstEasy = mcqData.questions.findIndex(q=>q.difficulty==='Easy');
    mcqQueue=[firstEasy>=0?firstEasy:0]; mcqStep=0; mcqAnswerDetails=[];
  }
  renderMCQQuestion();
}
