// ─── ICON HELPERS ─────────────────────────────────────────────────────────────
function icon(name, size) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;stroke-width:1.6;flex-shrink:0"></i>`;
}
function skillIcon(s, size) {
  const name = SKILL_ICONS[s.id] || s.icon;
  if (name) return icon(name, size);
  return `<span style="font-size:${size}px;line-height:1">${s.emoji||'⚙️'}</span>`;
}
function catIcon(cat, size) {
  if (CAT_ICONS_SVG[cat]) return icon(CAT_ICONS_SVG[cat], size);
  return `<span style="font-size:${size * 0.85}px">${CAT_ICONS[cat]||'📁'}</span>`;
}

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
let skills = [], custom = [], activeId = null, busy = false;
let mcqData = null, mcqIdx = 0, mcqAnswers = [], mcqChosenAnswers = [], mcqTimerInterval = null, mcqQTimeLeft = 0, mcqMode = 'timed';
let mcqAdaptive = false, mcqQueue = [], mcqStep = 0, mcqAnswerDetails = [];
let saveT = null;
let s1Mode = 'timed', s1System = 'All', s1QCount = 10, s1Diff = 'Balanced';
let uaRegion = null, uaFocus = new Set(), uaDiff = 'Step 1', uaCount = 10;
let elStageIdx = -1;
let examQ = [], examIdx = 0, examSecs = 0, examTimerInt = null, examMode = 'taking';

// ─── EXAM LOADING STAGES ─────────────────────────────────────────────────────
const EL_STAGES = [
  'Selecting high-yield anatomy concepts',
  'Writing NBME-style clinical vignettes',
  'Calibrating reasoning complexity',
  'Verifying distractor quality',
  'Preparing your exam environment'
];

// ─── JSON REPAIR ──────────────────────────────────────────────────────────────
function repairJSON(str) {
  // Strip markdown fences
  str = str.replace(/[\x60]{3}json\s*|[\x60]{3}/g, '');
  // Remove trailing commas before } or ]
  str = str.replace(/,(\s*[}\]])/g, '$1');
  // Stateful scan: fix literal newlines/tabs and escape embedded double quotes
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i], code = str.charCodeAt(i);
    if (esc)              { out += c; esc = false; continue; }
    if (c === '\\' && inStr) { out += c; esc = true; continue; }
    if (c === '"') {
      if (!inStr) { inStr = true; out += c; continue; }
      // Look past whitespace to decide if this " closes the string
      let j = i + 1;
      while (j < str.length && /[ \t\n\r]/.test(str[j])) j++;
      const next = j < str.length ? str[j] : '';
      if (next === ':' || next === ',' || next === '}' || next === ']' || next === '') {
        inStr = false; out += c;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (inStr) {
      if (c === '\n' || c === '\r') { out += ' '; continue; }
      if (c === '\t')               { out += ' '; continue; }
      if (code < 0x20)              { continue; }
    }
    out += c;
  }
  return out;
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function goHome() {
  activeId = null;
  stopExamTimer();
  const home = document.getElementById('view-home');
  home.style.display = '';
  home.classList.remove('view-entering');
  void home.offsetWidth; // force reflow so animation re-fires
  home.classList.add('view-entering');
  document.getElementById('view-workspace').classList.remove('show');
  document.getElementById('view-s1-setup').classList.remove('show');
  document.getElementById('view-ua-setup').classList.remove('show');
  document.getElementById('view-exam').classList.remove('show');
  renderSidebar();
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
function renderSidebar() {
  const nav = document.getElementById('sb-nav');
  nav.innerHTML = '';
  const all = allSkills(), byCat = {};
  for (const s of all) { const c = s.category||'Custom'; (byCat[c]=byCat[c]||[]).push(s); }
  const cats = [...CAT_ORDER.filter(c=>byCat[c]),...Object.keys(byCat).filter(c=>!CAT_ORDER.includes(c))];
  for (const cat of cats) {
    const g = document.createElement('div'); g.className='cat-grp';
    const l = document.createElement('div'); l.className='cat-lbl';
    l.innerHTML=`<span class="cat-lbl-ico">${catIcon(cat,11)}</span><span>${cat}</span>`;
    g.appendChild(l);
    for (const s of byCat[cat]) {
      const el = document.createElement('div');
      el.className='sb-item'+(s.id===activeId?' active':'');
      el.innerHTML=`<span class="sb-item-ico">${skillIcon(s,14)}</span><span>${s.name}</span>${s.featured?'<span class="sb-item-badge">New</span>':''}`;
      el.onclick=()=>selectSkill(s.id);
      g.appendChild(el);
    }
    nav.appendChild(g);
  }
  lucide.createIcons();
}

// ─── EXAM TIMER ───────────────────────────────────────────────────────────────
function startExamTimer() {
  clearInterval(examTimerInt);
  examTimerInt = setInterval(() => {
    examSecs++;
    const m = String(Math.floor(examSecs / 60)).padStart(2, '0');
    const s = String(examSecs % 60).padStart(2, '0');
    const el = document.getElementById('exam-timer-txt');
    if (el) el.textContent = `${m}:${s}`;
    const timerEl = document.getElementById('exam-timer');
    if (timerEl) {
      timerEl.classList.toggle('warn',   examSecs >= 900  && examSecs < 1800);
      timerEl.classList.toggle('danger', examSecs >= 1800);
    }
  }, 1000);
}

function stopExamTimer() {
  clearInterval(examTimerInt);
  examTimerInt = null;
}

// ─── EXAM LOADING SCREEN ──────────────────────────────────────────────────────
function showExamLoading() {
  const overlay = document.getElementById('exam-loading');

  // Build stage list
  document.getElementById('el-stages').innerHTML = EL_STAGES.map((s, i) => `
    <div class="el-stage el-pending" id="el-s-${i}" style="animation-delay:${.1 + i * .1}s">
      <div class="el-stage-icon" id="el-si-${i}"></div>
      <span>${s}</span>
    </div>`).join('');

  // Reset bar
  const bar = document.getElementById('el-bar-fill');
  const pct = document.getElementById('el-bar-pct');
  if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }
  if (pct) pct.textContent = '0%';
  elStageIdx = -1;

  overlay.classList.remove('el-exiting');
  overlay.classList.add('show');

  // Activate first stage after card animates in
  requestAnimationFrame(() => {
    if (bar) { bar.style.transition = ''; }
    setTimeout(() => elSetStage(0), 550);
    setTimeout(() => elSetBar(8), 700);
  });
}

function elSetStage(idx) {
  if (idx <= elStageIdx) return;
  // Mark previous done
  for (let i = 0; i < idx; i++) elMarkDone(i);
  // Activate current
  const row = document.getElementById('el-s-' + idx);
  const ico = document.getElementById('el-si-' + idx);
  if (row) row.className = 'el-stage el-active';
  if (ico) ico.innerHTML = '<div class="el-stage-spinner"></div>';
  elStageIdx = idx;
}

function elMarkDone(idx) {
  const row = document.getElementById('el-s-' + idx);
  const ico = document.getElementById('el-si-' + idx);
  if (row) row.className = 'el-stage el-done';
  if (ico) ico.innerHTML = '<span class="el-stage-check">✓</span>';
}

function elSetBar(targetPct) {
  const bar = document.getElementById('el-bar-fill');
  const pct = document.getElementById('el-bar-pct');
  if (bar) bar.style.width = targetPct + '%';
  if (pct) pct.textContent = Math.round(targetPct) + '%';

  // Derive stage from pct
  const stageMap = [[15, 0], [35, 1], [58, 2], [78, 3], [95, 4]];
  for (const [threshold, s] of stageMap) {
    if (targetPct >= threshold && s > elStageIdx) { elSetStage(s); break; }
  }
}

async function hideExamLoading() {
  // Complete all stages
  EL_STAGES.forEach((_, i) => elMarkDone(i));
  elSetBar(100);
  document.getElementById('el-headline').textContent = 'Your exam is ready';

  await new Promise(r => setTimeout(r, 800));

  const overlay = document.getElementById('exam-loading');
  overlay.classList.add('el-exiting');
  await new Promise(r => setTimeout(r, 480));
  overlay.classList.remove('show', 'el-exiting');
}
