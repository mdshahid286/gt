import { initCardTilt } from './interactions.js';

const API_BASE = 'http://localhost:8000';

const AGENT_META = {
    skills: { label: 'Skills', color: '#4FD1C5', borderClass: 'border-skills', accentClass: 'accent-skills' },
    experience: { label: 'Experience', color: '#9F7AEA', borderClass: 'border-experience', accentClass: 'accent-experience' },
    education: { label: 'Education', color: '#F6AD55', borderClass: 'border-education', accentClass: 'accent-education' },
    fairness: { label: 'Fairness', color: '#F687B3', borderClass: 'border-fairness', accentClass: 'accent-fairness' },
};

const els = {
    jobDescription: document.getElementById('job-description'),
    resume: document.getElementById('resume'),
    sampleSelect: document.getElementById('sample-select'),
    runBtn: document.getElementById('run-btn'),
    status: document.getElementById('status'),
    results: document.getElementById('results'),
    emptyState: document.getElementById('empty-state'),
};

let SAMPLES = { job_description: '', resumes: {} };

async function loadSamples() {
    try {
        const res = await fetch(`${API_BASE}/samples`);
        SAMPLES = await res.json();
        els.jobDescription.value = SAMPLES.job_description;
        Object.keys(SAMPLES.resumes).forEach((key) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key.replaceAll('_', ' ');
            els.sampleSelect.appendChild(opt);
        });
    } catch (e) {
        setStatus('Could not reach the backend at ' + API_BASE + ' -- is `uvicorn backend.api:app --reload` running?', true);
    }
}

els.sampleSelect.addEventListener('change', () => {
    const key = els.sampleSelect.value;
    els.resume.value = key ? SAMPLES.resumes[key] : '';
});

function setStatus(message, isError = false) {
    els.status.innerHTML = message
        ? `<span style="color:${isError ? 'var(--verdict-reject)' : 'var(--text-muted)'}">${message}</span>`
        : '';
}

function deliberatingHTML() {
    return `
    <div class="deliberating">
      <div class="dot-pulse"><span></span><span></span><span></span><span></span></div>
      Four agents deliberating...
    </div>`;
}

function agentCardHTML(key, output) {
    const meta = AGENT_META[key];
    const pct = Math.max(0, Math.min(1, output.utility)) * 100;
    const flags = (output.flags || [])
        .map((f) => `<span class="flag-pill">&#9873; ${escapeHTML(f)}</span>`)
        .join('');
    return `
    <div class="glass glass-tilt agent-result-card ${meta.borderClass}">
      <div class="${meta.accentClass}" style="font-weight:600;font-size:0.95rem;">${meta.label}</div>
      <div class="score-value">${output.utility.toFixed(2)}</div>
      <div class="score-track"><div class="score-fill" style="background:${meta.color}" data-target="${pct}"></div></div>
      <div style="min-height:20px">${flags}</div>
      <p style="color:var(--text-muted);font-size:0.83rem;line-height:1.5;margin-top:10px;">${escapeHTML(output.rationale)}</p>
    </div>`;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderResults(result) {
    const decision = result.decision;
    const isHire = decision === 'hire';

    const agentOrder = ['skills', 'experience', 'education', 'fairness'];
    const agentCards = agentOrder.map((k) => agentCardHTML(k, result.agent_outputs[k])).join('');

    const exp = result.shapley_explanation;
    const maxAbs = Math.max(...Object.values(exp.values).map((v) => Math.abs(v)), 0.001);
    const shapleyRows = agentOrder
        .map((k) => {
            const val = exp.values[k];
            const meta = AGENT_META[k];
            const widthPct = (Math.abs(val) / maxAbs) * 100;
            const label = exp.type === 'percentage' ? `${val.toFixed(1)}%` : val.toFixed(3);
            return `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <div style="width:90px;font-size:0.82rem;color:${meta.color}">${meta.label}</div>
          <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:4px;height:10px;overflow:hidden;">
            <div style="height:100%;width:0%;background:${meta.color};border-radius:4px;transition:width 1s cubic-bezier(0.16,1,0.3,1);" data-target="${widthPct}"></div>
          </div>
          <div class="mono" style="width:64px;text-align:right;font-size:0.82rem;">${label}</div>
        </div>`;
        })
        .join('');

    els.results.innerHTML = `
    <div class="verdict ${isHire ? 'verdict-hire' : 'verdict-reject'}">
      <span class="verdict-dot"></span>${isHire ? 'Hired' : 'Rejected'}
    </div>
    <p style="color:var(--text-muted);margin-bottom:26px;">${escapeHTML(result.nash_bargaining_detail.reason)}</p>

    <h3 style="font-size:1rem;margin-bottom:14px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;font-size:0.78rem;">Agent scores</h3>
    <div class="agent-results-grid">${agentCards}</div>

    <h3 style="font-size:1rem;margin:30px 0 14px 0;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;font-size:0.78rem;">Shapley explanation</h3>
    <div class="glass" style="padding:22px;">
      ${shapleyRows}
      <p style="color:var(--text-faint);font-size:0.78rem;margin-top:10px;">
        ${exp.type === 'percentage' ? '% contribution to the hire decision.' : exp.note}
      </p>
    </div>

    <details style="margin-top:20px;">
      <summary style="cursor:pointer;color:var(--text-muted);font-size:0.85rem;">Raw Nash bargaining detail</summary>
      <pre class="mono" style="background:rgba(255,255,255,0.03);padding:14px;border-radius:8px;overflow-x:auto;font-size:0.78rem;margin-top:10px;">${escapeHTML(JSON.stringify(result.nash_bargaining_detail, null, 2))}</pre>
    </details>
  `;

    els.emptyState.style.display = 'none';
    els.results.style.display = 'block';

    // trigger bar-fill animations on next frame (so the transition actually plays)
    requestAnimationFrame(() => {
        els.results.querySelectorAll('[data-target]').forEach((el) => {
            el.style.width = el.dataset.target + '%';
        });
    });

    initCardTilt('.agent-result-card');
}

async function runEvaluation() {
    const resumeText = els.resume.value.trim();
    const jobDescription = els.jobDescription.value.trim();

    if (!resumeText || !jobDescription) {
        setStatus('Please provide both a job description and a resume.', true);
        return;
    }

    els.runBtn.disabled = true;
    els.emptyState.style.display = 'none';
    els.results.style.display = 'none';
    setStatus(deliberatingHTML());

    try {
        const res = await fetch(`${API_BASE}/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume_text: resumeText, job_description: jobDescription }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || 'Request failed');
        }

        const result = await res.json();
        setStatus('');
        renderResults(result);
    } catch (e) {
        setStatus(`Evaluation failed: ${e.message}`, true);
        els.emptyState.style.display = 'block';
    } finally {
        els.runBtn.disabled = false;
    }
}

els.runBtn.addEventListener('click', runEvaluation);
loadSamples();