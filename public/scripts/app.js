// Must be first — configure marked before any use
marked.use({ breaks: true });

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CAT_ORDER = ['Social Media','Events','Education','Outreach','Brand','USMLE Step 1','USMLE Step 2'];
const CAT_ICONS = { 'Social Media':'📱','Events':'🎓','Education':'🔬','Outreach':'📣','Brand':'✍️','USMLE Step 1':'🧬','USMLE Step 2':'🏥','Custom':'⚙️' };
const CAT_COLORS = {
  'Social Media': '#1769C8',
  'Events':       '#6B3FBD',
  'Education':    '#0FAD6F',
  'Outreach':     '#E07B20',
  'Brand':        '#CC3A7A',
  'USMLE Step 1': '#7B52AB',
  'USMLE Step 2': '#0E9E8A',
  'Custom':       '#5A6880',
};

const SKILL_ICONS = {
  'social-instagram':       'camera',
  'linkedin-article':       'file-text',
  'medical-explainer':      'stethoscope',
  'student-recruitment':    'target',
  'usmle-anatomy':          'bone',
  'usmle-pathology':        'microscope',
  'usmle-pharmacology':     'pill',
  'usmle-biochem-genetics': 'dna',
  'usmle-step2-clinical':   'hospital',
};
const CAT_ICONS_SVG = {
  'Social Media': 'radio',
  'Events':       'calendar-days',
  'Education':    'book-open',
  'Outreach':     'megaphone',
  'Brand':        'pen-line',
  'USMLE Step 1': 'flask-conical',
  'USMLE Step 2': 'stethoscope',
  'Custom':       'settings-2',
};

// ─── USMLE ANATOMY SETUP DATA ─────────────────────────────────────────────────
const UA_REGIONS = [
  { id:'Neuroanatomy', icon:'🧠', label:'Neuroanatomy' },
  { id:'Upper Limb',   icon:'💪', label:'Upper Limb'   },
  { id:'Lower Limb',   icon:'🦵', label:'Lower Limb'   },
  { id:'Thorax',       icon:'❤️',  label:'Thorax'       },
  { id:'Abdomen',      icon:'🫀',  label:'Abdomen'      },
  { id:'Pelvis',       icon:'🦴',  label:'Pelvis'       },
  { id:'Head & Neck',  icon:'👤',  label:'Head & Neck'  },
  { id:'Embryology',   icon:'🔬',  label:'Embryology'   },
];
const UA_FOCUS_LIST = [
  'Nerve lesions','Vessel anatomy','Surface landmarks',
  'Developmental defects','Cross-sections','Imaging correlates',
  'Brachial plexus','Cranial nerves','Lesion localization',
];
const UA_SAMPLES = {
  'Neuroanatomy': {
    stem:'A 45-year-old man is brought in after a motor vehicle collision. He cannot dorsiflex his right foot. Imaging shows an L4-L5 disc herniation compressing a single nerve root. Which root is most likely affected?',
    opts:['A. L3','B. L4','C. L5','D. S1','E. S2'], correct:2
  },
  'Upper Limb': {
    stem:'A 32-year-old woman presents with inability to abduct her thumb and thenar wasting after a wrist laceration. Which nerve is most likely damaged?',
    opts:['A. Ulnar','B. Radial','C. Median','D. Musculocutaneous','E. Axillary'], correct:2
  },
  'Lower Limb': {
    stem:'During a total hip arthroplasty, a nerve exiting the greater sciatic foramen above the piriformis is damaged. Which deficit is expected?',
    opts:['A. Foot drop','B. Loss of hip abduction','C. Knee extension weakness','D. Loss of plantar flexion','E. Medial thigh numbness'], correct:1
  },
  'Thorax': {
    stem:'A 28-year-old is stabbed between the 4th and 5th ribs in the left midaxillary line. Which structure is at greatest risk?',
    opts:['A. Left lung apex','B. Phrenic nerve','C. Thoracic duct','D. Lingula of left lung','E. Esophagus'], correct:3
  },
  'Abdomen': {
    stem:'During a Whipple procedure, the surgeon ligates a vessel passing posterior to the pancreatic neck. Which vessel was ligated?',
    opts:['A. Superior mesenteric artery','B. Portal vein','C. Inferior mesenteric vein','D. Splenic artery','E. Celiac trunk'], correct:1
  },
  'Pelvis': {
    stem:'After a difficult vaginal delivery, a woman reports inability to control urination and perineal numbness. Which nerve was most likely injured?',
    opts:['A. Ilioinguinal','B. Pudendal','C. Genitofemoral','D. Obturator','E. Inferior gluteal'], correct:1
  },
  'Head & Neck': {
    stem:'After thyroid surgery, a patient is hoarse. Laryngoscopy shows a paralyzed right vocal cord. Which nerve was most likely injured?',
    opts:['A. External laryngeal','B. Glossopharyngeal','C. Recurrent laryngeal','D. Hypoglossal','E. Vagus trunk'], correct:2
  },
  'Embryology': {
    stem:'A neonate has a midline neck mass that elevates with tongue protrusion. This structure most likely represents a remnant of which embryologic structure?',
    opts:['A. Second branchial cleft','B. Thyroglossal duct','C. Third branchial arch','D. Cervical sinus','E. First pharyngeal pouch'], correct:1
  },
};

// ─── ALL SKILLS ───────────────────────────────────────────────────────────────
function allSkills() { return [...skills, ...custom]; }

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDash(filter) {
  const wrap = document.getElementById('dash-grid-wrap');
  wrap.innerHTML = '';
  const all = allSkills(), byCat = {}, fl = filter.toLowerCase().trim();
  for (const s of all) {
    if (fl && !s.name.toLowerCase().includes(fl) && !s.description.toLowerCase().includes(fl)) continue;
    const c = s.category||'Custom';
    (byCat[c]=byCat[c]||[]).push(s);
  }
  const cats = [...CAT_ORDER.filter(c=>byCat[c]),...Object.keys(byCat).filter(c=>!CAT_ORDER.includes(c))];
  if (!cats.length) { wrap.innerHTML='<p style="color:var(--t4);font-size:13px;padding:20px 0">No skills match your search.</p>'; return; }
  for (const cat of cats) {
    const color = CAT_COLORS[cat]||'#5A6880';
    const lbl = document.createElement('div'); lbl.className='dash-cat-label';
    lbl.innerHTML=`${catIcon(cat,12)} ${cat}`;
    wrap.appendChild(lbl);
    const grid = document.createElement('div'); grid.className='skill-grid';
    for (const s of byCat[cat]) {
      const card = document.createElement('div');
      card.className='skill-card'+(s.featured?' featured':'');
      card.style.setProperty('--accent', color);
      card.innerHTML=`
        ${s.featured?'<div class="feat-badge">New</div>':''}
        <div class="sc-emoji">${skillIcon(s,28)}</div>
        <div class="sc-name">${s.name}</div>
        <div class="sc-desc">${s.description}</div>
        <div class="sc-footer">
          <span class="sc-tag" style="--accent:${color}">${cat}</span>
          <span class="sc-arrow">→</span>
        </div>`;
      card.onclick=()=>selectSkill(s.id);
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
  }
  lucide.createIcons();
}

function filterSkills(v) { renderDash(v); }

// ─── SELECT SKILL ─────────────────────────────────────────────────────────────
function selectSkill(id) {
  const skill = allSkills().find(s=>s.id===id);
  if (!skill) return;
  activeId = id;
  document.getElementById('view-home').style.display='none';
  const isS1 = id === 'step1-mastery';
  const isUA = id === 'usmle-anatomy';
  const setupEl = document.getElementById('view-s1-setup');
  const uaEl   = document.getElementById('view-ua-setup');
  const ws     = document.getElementById('view-workspace');
  if (isS1) {
    setupEl.classList.add('show');
    uaEl.classList.remove('show');
    ws.classList.remove('show');
    clearOut();
  } else if (isUA) {
    uaEl.classList.add('show');
    setupEl.classList.remove('show');
    ws.classList.remove('show');
    clearOut();
    uaInit();
  } else {
    setupEl.classList.remove('show');
    uaEl.classList.remove('show');
    ws.classList.add('show');
    document.getElementById('ws-ico').innerHTML=skillIcon(skill,14);
    lucide.createIcons();
    document.getElementById('ws-name').textContent=skill.name;
    document.getElementById('ws-cat').textContent=skill.category||'Custom';
    const saved = localStorage.getItem('mg_'+id)||'';
    document.getElementById('guide-ta').value=saved;
    clearOut();
    setTimeout(() => document.getElementById('guide-ta')?.focus(), 120);
  }
  renderSidebar();
}

// ─── STEP 1 MASTERY SETUP ─────────────────────────────────────────────────────
function s1SetMode(btn, mode) {
  s1Mode = mode;
  btn.closest('.s1-seg').querySelectorAll('.s1-seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function s1SetSystem(btn, system) {
  s1System = system;
  btn.closest('.s1-pills').querySelectorAll('.s1-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function s1SetQ(btn, count) {
  s1QCount = count;
  btn.closest('.s1-pills').querySelectorAll('.s1-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function s1SetDiff(btn, diff) {
  s1Diff = diff;
  btn.closest('.s1-seg').querySelectorAll('.s1-seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function s1GenerateQuiz() {
  const subject = document.getElementById('s1-subject').value;
  const topic = document.getElementById('s1-topic').value.trim();
  const guide = `Subject: ${subject}\nSystem: ${s1System}\nTopic: ${topic||'Any'}\nNumber of questions: ${s1QCount}\nDifficulty preference: ${s1Diff}`;
  document.getElementById('guide-ta').value = guide;
  const skill = allSkills().find(s=>s.id==='step1-mastery');
  if (skill) {
    document.getElementById('ws-ico').innerHTML=skillIcon(skill,14);
    document.getElementById('ws-name').textContent=skill.name;
    document.getElementById('ws-cat').textContent=skill.category||'USMLE Step 1';
  }
  document.getElementById('view-s1-setup').classList.remove('show');
  document.getElementById('view-workspace').classList.add('show');
  clearOut(); lucide.createIcons();
  startWithMode(s1Mode);
}

// ─── USMLE ANATOMY SETUP ─────────────────────────────────────────────────────
function uaInit() {
  uaRegion = null; uaFocus = new Set(); uaDiff = 'Step 1'; uaCount = 10;

  // Reset difficulty segment
  document.querySelectorAll('#ua-seg-diff .ua-seg-btn').forEach((b,i) => b.classList.toggle('active', i===0));

  // Region grid
  const grid = document.getElementById('ua-region-grid');
  grid.innerHTML = '';
  UA_REGIONS.forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'ua-region-card';
    btn.dataset.id = r.id;
    btn.innerHTML = `<div class="ua-region-icon">${r.icon}</div><div class="ua-region-label">${r.label}</div>`;
    btn.onclick = () => uaSetRegion(r.id);
    grid.appendChild(btn);
  });

  // Focus chips
  const chips = document.getElementById('ua-focus-chips');
  chips.innerHTML = '';
  UA_FOCUS_LIST.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'ua-chip';
    btn.dataset.focus = f;
    btn.innerHTML = `<span class="ua-chip-check">✓</span>${f}`;
    btn.onclick = () => uaToggleFocus(f, btn);
    chips.appendChild(btn);
  });

  // Reset stepper
  document.getElementById('ua-count-num').textContent = '10';
  document.getElementById('ua-count-time').textContent = '~13 min';
  document.getElementById('ua-count-diff-lbl').textContent = 'Standard practice';
  document.getElementById('ua-themes').value = '';

  uaUpdatePreview();
}

function uaSetRegion(id) {
  uaRegion = id;
  document.querySelectorAll('.ua-region-card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
  uaUpdatePreview();
}

function uaToggleFocus(f, chip) {
  if (uaFocus.has(f)) { uaFocus.delete(f); chip.classList.remove('active'); }
  else { uaFocus.add(f); chip.classList.add('active'); }
  uaUpdatePreview();
}

function uaSetDiff(btn, diff) {
  uaDiff = diff;
  btn.closest('.ua-seg').querySelectorAll('.ua-seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  uaUpdatePreview();
}

function uaChangeCount(delta) {
  uaCount = Math.min(Math.max(uaCount + delta, 5), 40);
  document.getElementById('ua-count-num').textContent = uaCount;
  const mins = Math.round(uaCount * 1.3);
  document.getElementById('ua-count-time').textContent = `~${mins} min`;
  const lbl = uaCount <= 5 ? 'Quick practice set' : uaCount <= 10 ? 'Standard practice' : uaCount <= 20 ? 'Full session' : 'Intensive exam block';
  document.getElementById('ua-count-diff-lbl').textContent = lbl;
  uaUpdatePreview();
}

function uaUpdatePreview() {
  const regionEl = document.getElementById('ua-prev-region');
  if (uaRegion) {
    const r = UA_REGIONS.find(x => x.id === uaRegion);
    regionEl.textContent = (r ? r.icon + ' ' + r.label : uaRegion);
    regionEl.classList.remove('empty');
  } else {
    regionEl.textContent = 'None selected';
    regionEl.classList.add('empty');
  }

  const focusEl = document.getElementById('ua-prev-focus');
  if (uaFocus.size > 0) {
    const arr = [...uaFocus];
    focusEl.textContent = arr.slice(0,2).join(', ') + (arr.length > 2 ? ` +${arr.length-2} more` : '');
    focusEl.classList.remove('empty');
  } else {
    focusEl.textContent = 'Any focus';
    focusEl.classList.add('empty');
  }

  document.getElementById('ua-prev-diff').textContent = uaDiff;
  const mins = Math.round(uaCount * 1.3);
  document.getElementById('ua-prev-time').textContent = `${uaCount} questions · ~${mins} min`;

  const sample = uaRegion ? UA_SAMPLES[uaRegion] : null;
  const stemEl = document.getElementById('ua-sample-stem');
  const optsEl = document.getElementById('ua-sample-opts');
  if (sample) {
    stemEl.textContent = sample.stem;
    optsEl.innerHTML = sample.opts.map((o,i) =>
      `<div class="ua-sample-opt${i===sample.correct?' correct':''}">${o}</div>`
    ).join('');
  } else {
    stemEl.textContent = 'Select a region above to see a representative question style for that anatomical system.';
    optsEl.innerHTML = '';
  }
}

function uaGenerate() {
  const region = uaRegion || 'All regions';
  const focus  = uaFocus.size > 0 ? [...uaFocus].join(', ') : 'Any';
  const themes = document.getElementById('ua-themes').value.trim();
  const guide  = [
    `Region / system: ${region}`,
    `Number of questions: ${uaCount}`,
    `Focus: ${focus}`,
    `Difficulty: ${uaDiff}`,
    themes ? `Clinical correlate to include: ${themes}` : null,
  ].filter(Boolean).join('\n');

  document.getElementById('guide-ta').value = guide;
  activeId = 'usmle-anatomy';
  // Hide setup, show fullscreen loading — no workspace
  document.getElementById('view-ua-setup').classList.remove('show');
  showExamLoading();
  _doGenerate(true);
}

// ─── GUIDE ────────────────────────────────────────────────────────────────────
function onInput() {
  if (!activeId) return;
  clearTimeout(saveT);
  saveT=setTimeout(()=>{
    localStorage.setItem('mg_'+activeId, document.getElementById('guide-ta').value);
    const f=document.getElementById('save-fl');
    f.classList.add('on');
    clearTimeout(f._t); f._t=setTimeout(()=>f.classList.remove('on'),1800);
  },700);
}
function clearGuide() { document.getElementById('guide-ta').value=''; if(activeId) localStorage.removeItem('mg_'+activeId); }
function loadTpl() {
  const s=allSkills().find(s=>s.id===activeId);
  if (s?.template) { document.getElementById('guide-ta').value=s.template; onInput(); }
}

// ─── MODE PICKER ──────────────────────────────────────────────────────────────
function openModePicker() { document.getElementById('mode-overlay').classList.add('open'); }
function closeModePicker() { document.getElementById('mode-overlay').classList.remove('open'); }
function modeBgClick(e) { if (e.target === document.getElementById('mode-overlay')) closeModePicker(); }
function startWithMode(mode) {
  mcqMode = mode;
  closeModePicker();
  _doGenerate(false);
}

// ─── GENERATE ─────────────────────────────────────────────────────────────────
async function generate() {
  if (busy) return;
  const guide=document.getElementById('guide-ta').value.trim();
  if (!guide) { alert('Write a guide first.'); return; }

  const skill=allSkills().find(s=>s.id===activeId);
  const isMCQ = skill?.mode === 'mcq' || skill?.mode === 'adaptive';
  if (isMCQ) { openModePicker(); return; }
  _doGenerate();
}

async function _doGenerate(fullscreenExam = false) {
  if (busy) return;
  const guide=document.getElementById('guide-ta').value.trim();
  if (!guide) return;

  busy=true;
  const btn=document.getElementById('gen-btn');
  btn.classList.add('loading'); btn.disabled=true;

  document.getElementById('out-ph').style.display='none';
  const body=document.getElementById('out-body');
  body.classList.add('on');
  document.getElementById('copy-btn').style.display='none';
  document.getElementById('clr-btn').style.display='none';

  const skill=allSkills().find(s=>s.id===activeId);
  const isMCQ = skill?.mode === 'mcq' || skill?.mode === 'adaptive';
  const isC=custom.some(s=>s.id===activeId);
  const payload={skillId:activeId,guide};
  if (isC&&skill) payload.customSkill={name:skill.name,systemPrompt:skill.systemPrompt};

  try {
    if (isMCQ) {
      const totalQ = extractQuestionCount(guide);
      const numBatches = Math.ceil(totalQ / MCQ_BATCH_SIZE);

      if (!fullscreenExam) {
        body.innerHTML = `
          <div class="ql-wrap">
            <div class="ql-card">
              <div class="ql-badge">
                <div class="ql-badge-dot"></div>
                USMLE Step 1 &nbsp;·&nbsp; Adaptive Engine
              </div>
              <div class="ql-title">Get Ready</div>
              <div class="ql-sub">Preparing your personalised Step 1 challenge</div>
              <div class="ql-steps">
                <div class="ql-step" style="animation-delay:.2s"><div class="ql-step-icon done">✓</div><span>Selecting high-yield questions</span></div>
                <div class="ql-step" style="animation-delay:.5s"><div class="ql-step-icon done">✓</div><span>Balancing difficulty levels</span></div>
                <div class="ql-step" style="animation-delay:.8s"><div class="ql-step-icon done">✓</div><span>Building clinical vignettes</span></div>
                <div class="ql-step" style="animation-delay:1.1s">
                  <div class="ql-step-icon spin"><div class="ql-mini-spin"></div></div>
                  <span style="color:var(--blue);font-weight:600">Finalising your personalised quiz…</span>
                </div>
              </div>
              <div class="ql-divider"></div>
              <div class="ql-bar-track"><div class="ql-bar-fill"></div></div>
              <div class="ql-trust">Designed to simulate real board-style thinking</div>
            </div>
          </div>`;
      }

      let doneCount = 0;
      const fetchWithRetry = async (batchIdx) => {
        const batchSize = (batchIdx === numBatches - 1)
          ? totalQ - batchIdx * MCQ_BATCH_SIZE
          : MCQ_BATCH_SIZE;
        const batchGuide = buildBatchGuide(guide, batchIdx, batchSize, []);
        const batchPayload = { ...payload, guide: batchGuide };
        let lastErr = null;
        for (let attempt = 0; attempt <= MCQ_RETRIES; attempt++) {
          try {
            const data = await fetchMCQBatch(batchPayload);
            if (validateMCQBatch(data)) {
              doneCount++;
              if (fullscreenExam) elSetBar(15 + Math.round((doneCount / numBatches) * 72));
              return data;
            }
            lastErr = new Error(`Batch ${batchIdx+1} invalid (attempt ${attempt+1})`);
          } catch(e) { lastErr = e; }
        }
        throw lastErr || new Error(`Batch ${batchIdx+1} failed after ${MCQ_RETRIES+1} attempts`);
      };

      const batchResults = await Promise.all(
        Array.from({ length: numBatches }, (_, i) => fetchWithRetry(i))
      );

      const allQuestions = batchResults
        .flatMap(d => d.questions)
        .slice(0, totalQ)
        .map((q, i) => ({ ...q, id: i + 1 }));

      mcqData = { title: batchResults[0]?.title || skill?.name || 'USMLE Step 1', questions: allQuestions };
      mcqIdx = 0; mcqAnswers = []; mcqChosenAnswers = []; mcqQTimeLeft = 0;
      mcqAdaptive = skill?.mode === 'adaptive';
      if (mcqAdaptive) {
        const firstEasy = mcqData.questions.findIndex(q => q.difficulty === 'Easy');
        mcqQueue = [firstEasy >= 0 ? firstEasy : 0];
        mcqStep = 0; mcqAnswerDetails = [];
      }
      if (!fullscreenExam) document.getElementById('clr-btn').style.display = '';
      if (fullscreenExam) {
        await hideExamLoading();
        startFullscreenExam(mcqData);
      } else {
        renderMCQQuestion();
      }
    } else {
      const isLN = activeId === 'medical-explainer';
      if (isLN) {
        body.innerHTML=`
          <div class="ql-wrap">
            <div class="ql-card">
              <div class="ql-badge"><div class="ql-badge-dot"></div>Medical Explorer</div>
              <div class="ql-title" style="font-size:28px;line-height:1.15;margin-bottom:10px">Preparing your<br>lecture note</div>
              <div class="ql-sub">Medica Medical Explorer is building a structured, high-yield explanation for you.</div>
              <div class="ql-steps">
                <div class="ql-step" style="animation-delay:.2s"><div class="ql-step-icon done">✓</div><span>Understanding the topic</span></div>
                <div class="ql-step" style="animation-delay:.55s"><div class="ql-step-icon done">✓</div><span>Organising core concepts</span></div>
                <div class="ql-step" style="animation-delay:.9s"><div class="ql-step-icon done">✓</div><span>Building clinical explanations</span></div>
                <div class="ql-step" style="animation-delay:1.25s">
                  <div class="ql-step-icon spin"><div class="ql-mini-spin"></div></div>
                  <span style="color:var(--blue);font-weight:600">Finalising your personalised lecture note…</span>
                </div>
              </div>
              <div class="ql-divider"></div>
              <div class="ql-bar-track"><div class="ql-bar-fill"></div></div>
              <div class="ql-trust">Structured for clarity. Built for mastery.</div>
            </div>
          </div>`;
      } else {
        body.innerHTML='<span class="tcur"></span>';
      }
      const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||'Server error'); }

      let raw='', buf='';
      const rd=res.body.getReader(), dc=new TextDecoder();
      while(true) {
        const {done,value}=await rd.read();
        if (done) break;
        buf+=dc.decode(value,{stream:true});
        const lines=buf.split('\n'); buf=lines.pop();
        for (const ln of lines) {
          if (!ln.startsWith('data: ')) continue;
          const d=ln.slice(6).trim(); if (!d) continue;
          const ev=JSON.parse(d);
          if (ev.type==='text') {
            raw+=ev.text;
            if (!isLN) {
              body.innerHTML=md(raw)+'<span class="tcur"></span>';
              body.parentElement.scrollTop=body.parentElement.scrollHeight;
            }
          } else if (ev.type==='done') {
            body.innerHTML=md(raw);
            document.getElementById('copy-btn').style.display='';
            document.getElementById('clr-btn').style.display='';
          } else if (ev.type==='error') throw new Error(ev.message);
        }
      }
    }
  } catch(err) {
    if (fullscreenExam) {
      // Hide loading, show error in exam header area
      document.getElementById('exam-loading').classList.remove('show', 'el-exiting');
      document.getElementById('view-workspace').classList.add('show');
      document.getElementById('out-body').classList.add('on');
      document.getElementById('out-ph').style.display = 'none';
    }
    document.getElementById('out-body').innerHTML=`<div style="color:var(--red);font-size:12.5px;padding:8px 0">⚠ ${err.message}</div>`;
  } finally {
    busy=false; btn.classList.remove('loading'); btn.disabled=false;
  }
}

// ─── MARKDOWN ─────────────────────────────────────────────────────────────────
function md(text) {
  // Normalize • bullets → markdown bullets
  return marked.parse(text.replace(/^• /gm, '- '));
}

// ─── COPY / CLEAR ─────────────────────────────────────────────────────────────
async function copyOut() {
  await navigator.clipboard.writeText(document.getElementById('out-body').innerText);
  const b=document.getElementById('copy-btn');
  b.classList.add('ok'); b.textContent='✓ Copied';
  setTimeout(()=>{b.classList.remove('ok');b.textContent='Copy All';},2000);
}
function clearOut() {
  clearInterval(mcqTimerInterval); mcqTimerInterval=null;
  const b=document.getElementById('out-body');
  b.innerHTML=''; b.classList.remove('on');
  document.getElementById('out-ph').style.display='';
  document.getElementById('copy-btn').style.display='none';
  document.getElementById('clr-btn').style.display='none';
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(){ document.getElementById('overlay').classList.add('open'); }
function closeModal(){
  document.getElementById('overlay').classList.remove('open');
  ['cs-name','cs-desc','cs-sys','cs-tpl'].forEach(id=>document.getElementById(id).value='');
}
function bgClick(e){ if(e.target===document.getElementById('overlay')) closeModal(); }

function createSkill() {
  const name=document.getElementById('cs-name').value.trim();
  const cat=document.getElementById('cs-cat').value;
  const desc=document.getElementById('cs-desc').value.trim();
  const sys=document.getElementById('cs-sys').value.trim();
  const tpl=document.getElementById('cs-tpl').value.trim();
  if (!name||!sys){alert('Name and System Prompt are required.');return;}
  const skill={id:'c_'+Date.now(),name,category:cat,emoji:CAT_ICONS[cat]||'⚙️',icon:CAT_ICONS_SVG[cat]||'settings-2',description:desc,template:tpl,systemPrompt:sys,isCustom:true};
  custom.push(skill);
  localStorage.setItem('medica_custom',JSON.stringify(custom));
  closeModal(); renderSidebar(); renderDash(document.getElementById('search-input').value);
  selectSkill(skill.id);
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
function initKeyboardShortcuts() {
  const OPT_MAP = { a:0, 1:0, b:1, 2:1, c:2, 3:2, d:3, 4:3, e:4, 5:4 };

  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select,[contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();

    // ── Fullscreen exam ──────────────────────────────────────────────────────
    if (document.getElementById('view-exam')?.classList.contains('show')) {
      if (examMode === 'taking') {
        if (OPT_MAP[key] !== undefined) {
          e.preventDefault();
          const q = examQ[examIdx];
          if (q && q.user_answer === null) examSelectOpt(OPT_MAP[key]);
          return;
        }
        if (key === 'arrowright' || key === 'n') { e.preventDefault(); examNext();        return; }
        if (key === 'arrowleft'  || key === 'p') { e.preventDefault(); examPrev();        return; }
        if (key === 'm')                          { e.preventDefault(); examToggleMark();  return; }
      }
      return;
    }

    // ── MCQ quiz (practice / coach / timed) ─────────────────────────────────
    const unansweredOpts = document.querySelectorAll('.mcq-opt:not(:disabled)');
    if (unansweredOpts.length > 0) {
      if (OPT_MAP[key] !== undefined) {
        e.preventDefault();
        const idx = OPT_MAP[key];
        if (idx < unansweredOpts.length) mcqAnswer(idx);
        return;
      }
      if (key === 'enter' || key === 'n') {
        e.preventDefault();
        const nextBtn = document.getElementById('mcq-next');
        if (nextBtn?.classList.contains('on')) mcqNext();
        return;
      }
    }
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try { const r = await fetch('/api/skills'); skills = await r.json(); } catch(e) {}
  try { custom = JSON.parse(localStorage.getItem('medica_custom')||'[]'); } catch(e) { custom = []; }
  renderSidebar();
  renderDash('');
  initKeyboardShortcuts();

  // Dark mode toggle
  const darkToggle = document.getElementById('dark-toggle');
  if (darkToggle) {
    // Apply saved preference on load
    if (localStorage.getItem('medica_dark') === '1') {
      document.documentElement.classList.add('dark');
    }
    darkToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem('medica_dark', document.documentElement.classList.contains('dark') ? '1' : '0');
    });
  }

  // Mobile sidebar toggle
  const sbToggle = document.getElementById('sb-toggle');
  if (sbToggle) {
    sbToggle.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });
  }
}

init();
