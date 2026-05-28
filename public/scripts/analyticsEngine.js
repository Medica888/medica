// ─── SCORING ENGINE ────────────────────────────────────────────────────────────
const DIFF_WEIGHTS = { Easy: 1.0, Medium: 1.3, Hard: 1.6 };

function computeMedicaScore(details) {
  const wCorrect = details.filter(d=>d.correct).reduce((s,d)=>s+(DIFF_WEIGHTS[d.difficulty]||1.0),0);
  const wMax     = details.reduce((s,d)=>s+(DIFF_WEIGHTS[d.difficulty]||1.0),0);
  if (wMax === 0) return 100;
  return Math.round(Math.min(300, Math.max(100,
    100 + 200 * Math.log10(wCorrect + 1) / Math.log10(wMax + 1)
  )));
}

function getMedicaReadiness(score) {
  if (score <= 150) return { label:'Foundational Weakness', color:'#CC3A3A', bg:'#FBE8E8' };
  if (score <= 190) return { label:'Needs Improvement',    color:'#E07B20', bg:'#FDF0E3' };
  if (score <= 220) return { label:'Passing Potential',    color:'#D4A020', bg:'#FDF6E3' };
  if (score <= 245) return { label:'Competitive',          color:'#0A7A50', bg:'#E8FBF2' };
  if (score <= 260) return { label:'Strong',               color:'#0A7A50', bg:'#E8FBF2' };
  if (score <= 280) return { label:'Elite',                color:'#1359AA', bg:'#E6F0FB' };
  return                    { label:'Exceptional',         color:'#6B3FBD', bg:'#F0EAFB' };
}

function getPercentile(score) {
  const map = [[150,5],[160,10],[170,15],[180,22],[190,30],[200,40],[210,50],[220,58],[230,66],[240,74],[250,81],[260,88],[270,93],[280,97],[300,99]];
  for (const [threshold,pct] of map) if (score<=threshold) return pct;
  return 99;
}

function getPassProbability(score) {
  if (score<150) return 4;
  if (score<165) return 10;
  if (score<180) return 20;
  if (score<195) return 35;
  if (score<210) return 52;
  if (score<225) return 67;
  if (score<240) return 80;
  if (score<255) return 90;
  if (score<270) return 95;
  return 98;
}

function getImprovedProbability(score) {
  return Math.min(99, getPassProbability(score) + Math.round(12 + Math.random()*6));
}

function detectWeaknesses(fieldMap, diffMap) {
  const critical = [], moderate = [];
  Object.entries(fieldMap).forEach(([name,fd])=>{
    if (fd.total < 2) return;
    const p = fd.correct/fd.total;
    if (p < 0.5)       critical.push({ name, pct: Math.round(p*100) });
    else if (p < 0.65) moderate.push({ name, pct: Math.round(p*100) });
  });
  const easy = diffMap['Easy'];
  if (easy && easy.total>=2 && easy.correct/easy.total < 0.7)
    moderate.push({ name:'Basic Recall Gaps (missed easy questions)', pct: Math.round(easy.correct/easy.total*100) });
  const hard = diffMap['Hard'];
  if (hard && hard.total>=2 && hard.correct/hard.total < 0.45)
    moderate.push({ name:'Complex Reasoning (advanced questions)', pct: Math.round(hard.correct/hard.total*100) });
  return { critical, moderate };
}

function buildStudyPlan(fieldMap) {
  const sorted = Object.entries(fieldMap)
    .filter(([,fd])=>fd.total>=1)
    .sort((a,b)=>(a[1].correct/a[1].total)-(b[1].correct/b[1].total));
  const rx = (pct) => {
    if (pct < 30) return 'Reread fundamentals → drill 10 vignettes';
    if (pct < 50) return 'Review mechanism → do wrong-answer analysis';
    if (pct < 65) return 'Target subtopics, use Anki + timed practice';
    return 'Review edge cases + high-yield rules';
  };
  return sorted.map(([name,fd])=>({ name, pct:Math.round(fd.correct/fd.total*100), advice:rx(Math.round(fd.correct/fd.total*100)) }));
}

function subjectLevelChip(pct) {
  if (pct < 50) return `<span class="subject-level-chip below">Below Passing</span>`;
  if (pct < 65) return `<span class="subject-level-chip border">Borderline</span>`;
  if (pct < 80) return `<span class="subject-level-chip pass">Passing</span>`;
  return               `<span class="subject-level-chip strong">Strong</span>`;
}

function subjectBarColor(pct) {
  return pct < 50 ? '#CC3A3A' : pct < 65 ? '#E07B20' : pct < 80 ? '#0FAD6F' : '#1769C8';
}

function getScoreInterpretation(score, pct, diffMap) {
  const easy = diffMap['Easy'], hard = diffMap['Hard'];
  const ep = easy ? Math.round(easy.correct/easy.total*100) : null;
  const hp = hard ? Math.round(hard.correct/hard.total*100) : null;
  if (ep!==null && hp!==null) {
    if (ep>=80 && hp<45) return 'Solid foundational recall, but advanced multi-step integration is limiting your ceiling. A targeted push on complex reasoning is the next unlock.';
    if (ep<60) return 'Core concept gaps are your primary bottleneck right now. Reinforcing fundamentals will have the highest return — this is the most strategic place to invest your next sessions.';
    if (hp>=60) return 'Strong performance across question tiers. You are operating in competitive territory — focus now on eliminating the narrow gaps that remain.';
  }
  if (pct>=80) return 'Excellent command of tested material. Your score reflects genuine mastery, not guessing. Push harder questions to reach elite territory.';
  if (pct>=65) return 'Solid performance overall. Your knowledge foundation is building well — a focused 1–2 week push on weak areas is what stands between you and the next tier.';
  if (pct>=50) return 'You have the foundation, but exam-level application needs work. The gap between knowing and applying is what to close next.';
  return 'The data shows specific, fixable gaps. Every single weak area identified here is addressable with the right strategy.';
}

function diagnoseMistakes(answerDetails, diffMap, fieldMap) {
  const diagnoses = [];
  const eW = diffMap['Easy']   ? diffMap['Easy'].total   - diffMap['Easy'].correct   : 0;
  const mW = diffMap['Medium'] ? diffMap['Medium'].total - diffMap['Medium'].correct : 0;
  const hW = diffMap['Hard']   ? diffMap['Hard'].total   - diffMap['Hard'].correct   : 0;
  const wf = Object.entries(fieldMap).filter(([,fd])=>fd.total>=1 && fd.correct/fd.total<0.5);
  if (eW>0) diagnoses.push({ type:'Knowledge Gap', color:'#CC3A3A', desc:`${eW} foundational question${eW>1?'s were':' was'} missed — these reveal baseline recall gaps and are the highest-ROI area to fix first.` });
  if (mW>0 && wf.length<=2) diagnoses.push({ type:'Concept Confusion', color:'#E07B20', desc:`Integration errors clustered around ${wf.length>0?wf.slice(0,2).map(([n])=>n).join(' and '):'overlapping mechanisms'}. A comparison-table review (not re-reading) fixes this fastest.` });
  if (hW>0) diagnoses.push({ type:'Advanced Reasoning', color:'#6B3FBD', desc:'Complex vignettes revealed a gap between understanding a concept and applying it under exam conditions — a normal and very fixable stage of Step 1 prep.' });
  if (wf.length>=3) diagnoses.push({ type:'Broad Foundation Gap', color:'#CC3A3A', desc:'Errors distributed across 3+ subjects suggest systematic foundation review before intensive subject drilling.' });
  if (diagnoses.length===0 && (eW+mW+hW)>0) diagnoses.push({ type:'Distractor Traps', color:'#E07B20', desc:'Your knowledge was there — wrong answers appear to be distractor-driven. Vignette reading strategy and eliminating "almost right" traps is the fix.' });
  return diagnoses;
}

function detectStrengthZones(fieldMap) {
  return Object.entries(fieldMap)
    .filter(([,fd])=>fd.total>=1 && fd.correct/fd.total>=0.75)
    .sort((a,b)=>(b[1].correct/b[1].total)-(a[1].correct/a[1].total))
    .map(([name,fd])=>({ name, pct:Math.round(fd.correct/fd.total*100) }));
}

function getImprovementForecast(medicaScore, critical, moderate) {
  const total = critical.length + moderate.length;
  const top = critical[0]?.name || moderate[0]?.name || null;
  if (total===0) return { gain:'+10–20', weeks:'1–2', note:'You are already performing well. Pushing into harder questions and mixed blocks is the next lever to pull.' };
  if (total<=2) return { gain:'+15–25', weeks:'2', note:`Fixing ${top||'your critical area'} with targeted practice — not passive re-reading — could realistically add 15–25 points in 2 weeks.` };
  if (total<=4) return { gain:'+25–40', weeks:'3–4', note:'Your weaknesses are concentrated enough that a focused 3-week plan is realistic for a meaningful score jump. Each subject fixed adds compounding gains.' };
  return { gain:'+30–50', weeks:'4–6', note:'Broad gaps identified — but none are permanent. A systematic foundation review over 4–6 weeks will compound into a significant score shift.' };
}
