/**
 * batch.js — Batch candidate evaluation
 *
 * Handles: multi-file queue, sequential extraction + evaluation API calls,
 * live progress bar, ranked leaderboard (sorted by Nash product), and a
 * slide-in drawer for drill-down detail.
 */

import { renderCandidateDetail } from './results-view.js';

const API_BASE = '';

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
const els = {
    multiDropzone:   document.getElementById('multi-dropzone'),
    multiFileInput:  document.getElementById('multi-file-input'),
    fileQueue:       document.getElementById('file-queue'),
    jobDescription:  document.getElementById('batch-job-description'),
    runBtn:          document.getElementById('batch-run-btn'),
    status:          document.getElementById('batch-status'),
    progressWrap:    document.getElementById('progress-wrap'),
    progressText:    document.getElementById('progress-text'),
    progressPct:     document.getElementById('progress-pct'),
    progressFill:    document.getElementById('progress-fill'),
    leaderboard:     document.getElementById('leaderboard'),
    leaderboardHdr:  document.getElementById('leaderboard-header'),
    emptyState:      document.getElementById('batch-empty-state'),
    summaryBar:      document.getElementById('batch-summary'),
    summaryTotal:    document.getElementById('summary-total'),
    summaryHire:     document.getElementById('summary-hire'),
    summaryReject:   document.getElementById('summary-reject'),
    drawerOverlay:   document.getElementById('drawer-overlay'),
    drawer:          document.getElementById('detail-drawer'),
    drawerClose:     document.getElementById('drawer-close'),
    drawerContent:   document.getElementById('drawer-content'),
    drawerName:      document.getElementById('drawer-candidate-name'),
    drawerSubtitle:  document.getElementById('drawer-candidate-subtitle'),
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let fileQueue  = [];   // { id, file, status: 'pending'|'running'|'done'|'error', result?, error? }
let isRunning  = false;
let nextId     = 0;

// ---------------------------------------------------------------------------
// Load samples job description on page load
// ---------------------------------------------------------------------------
(async () => {
    try {
        const res = await fetch(`${API_BASE}/samples`);
        if (res.ok) {
            const data = await res.json();
            els.jobDescription.value = data.job_description;
        }
    } catch { /* non-fatal */ }
})();

// ---------------------------------------------------------------------------
// Dropzone: click + drag-and-drop
// ---------------------------------------------------------------------------
els.multiDropzone.addEventListener('click', () => els.multiFileInput.click());
els.multiDropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') els.multiFileInput.click();
});

['dragenter', 'dragover'].forEach(evt =>
    els.multiDropzone.addEventListener(evt, e => { e.preventDefault(); els.multiDropzone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach(evt =>
    els.multiDropzone.addEventListener(evt, e => { e.preventDefault(); els.multiDropzone.classList.remove('drag-over'); })
);

els.multiDropzone.addEventListener('drop', e => {
    addFiles([...e.dataTransfer.files]);
});

els.multiFileInput.addEventListener('change', e => {
    addFiles([...e.target.files]);
    e.target.value = ''; // reset so same file can be re-added if needed
});

// ---------------------------------------------------------------------------
// File queue management
// ---------------------------------------------------------------------------
function addFiles(files) {
    const valid = files.filter(f => /\.(pdf|docx|txt)$/i.test(f.name));
    const invalid = files.length - valid.length;
    if (invalid > 0) setStatus(`${invalid} file(s) skipped — only .pdf, .docx, .txt are supported.`, false);

    valid.forEach(file => {
        fileQueue.push({ id: nextId++, file, status: 'pending', result: null, error: null });
    });

    renderQueue();
    updateRunBtn();
}

function removeFile(id) {
    fileQueue = fileQueue.filter(item => item.id !== id);
    renderQueue();
    updateRunBtn();
}

function renderQueue() {
    if (fileQueue.length === 0) {
        els.fileQueue.innerHTML = '';
        return;
    }

    els.fileQueue.innerHTML = fileQueue.map(item => {
        const statusLabel = { pending: 'pending', running: 'running', done: item.result?.decision ?? 'done', error: 'error' }[item.status];
        const statusClass = item.status === 'done'
            ? (item.result?.decision === 'hire' ? 'done-hire' : 'done-reject')
            : item.status;

        return `
            <div class="file-row" id="file-row-${item.id}">
                <span class="file-name" title="${escHtml(item.file.name)}">${escHtml(item.file.name)}</span>
                <span class="file-status ${statusClass}">${statusLabel}</span>
                ${!isRunning ? `<button class="file-remove" data-id="${item.id}" aria-label="Remove ${escHtml(item.file.name)}">✕</button>` : ''}
            </div>
        `;
    }).join('');

    // Bind remove buttons
    els.fileQueue.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', () => removeFile(Number(btn.dataset.id)));
    });
}

function updateFileStatus(id, status) {
    const item = fileQueue.find(i => i.id === id);
    if (item) item.status = status;
    const row = document.getElementById(`file-row-${id}`);
    if (!row) return;
    const statusLabel = { pending: 'pending', running: 'running', done: item?.result?.decision ?? 'done', error: 'error' }[status];
    const statusClass = status === 'done'
        ? (item?.result?.decision === 'hire' ? 'done-hire' : 'done-reject')
        : status;
    const badge = row.querySelector('.file-status');
    if (badge) {
        badge.textContent = statusLabel;
        badge.className = `file-status ${statusClass}`;
    }
}

function updateRunBtn() {
    els.runBtn.disabled = fileQueue.length === 0 || isRunning;
}

// ---------------------------------------------------------------------------
// Status helper
// ---------------------------------------------------------------------------
function setStatus(html, isError = false) {
    els.status.innerHTML = html
        ? `<span style="color:${isError ? 'var(--verdict-reject)' : 'var(--text-muted)'}">${html}</span>`
        : '';
}

// ---------------------------------------------------------------------------
// Run batch evaluation
// ---------------------------------------------------------------------------
els.runBtn.addEventListener('click', runBatch);

async function runBatch() {
    const jobDescription = els.jobDescription.value.trim();
    if (!jobDescription) {
        setStatus('Please provide a job description.', true);
        return;
    }
    if (fileQueue.length === 0) {
        setStatus('Add at least one resume file first.', true);
        return;
    }

    isRunning = true;
    updateRunBtn();

    // Reset all statuses
    fileQueue.forEach(item => {
        item.status = 'pending';
        item.result = null;
        item.error  = null;
    });

    els.progressWrap.style.display = 'block';
    els.emptyState.style.display   = 'none';
    setStatus('');
    updateLeaderboard([]);
    setProgress(0, fileQueue.length);

    const total = fileQueue.length;
    let done    = 0;

    for (const item of fileQueue) {
        updateFileStatus(item.id, 'running');
        renderQueue();

        try {
            // Step 1: extract text
            const extractedText = await extractFile(item.file);

            // Step 2: evaluate
            const res = await fetch(`${API_BASE}/evaluate`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ resume_text: extractedText, job_description: jobDescription }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'Evaluation failed');
            }

            item.result = await res.json();
            item.status = 'done';
        } catch (e) {
            item.error  = e.message;
            item.status = 'error';
        }

        done++;
        updateFileStatus(item.id, item.status);
        setProgress(done, total);
        updateLeaderboard(fileQueue.filter(i => i.status === 'done' && i.result));
        renderQueue();
    }

    isRunning = false;
    updateRunBtn();

    const errors = fileQueue.filter(i => i.status === 'error').length;
    if (errors > 0) setStatus(`${errors} file(s) failed to evaluate. See individual rows above.`, true);
}

async function extractFile(file) {
    // Plain text: read directly without an API call
    if (/\.txt$/i.test(file.name)) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsText(file);
        });
    }

    // PDF / DOCX: send to /extract-text
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/extract-text`, { method: 'POST', body: formData });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Text extraction failed');
    }
    const data = await res.json();
    return data.text;
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
function setProgress(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = `${done} / ${total} evaluated`;
    els.progressPct.textContent  = pct + '%';
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
function updateLeaderboard(doneItems) {
    // Sort by: hired first, then by Nash product descending (rejected by gain sum)
    const sorted = [...doneItems].sort((a, b) => {
        const aHire = a.result.decision === 'hire';
        const bHire = b.result.decision === 'hire';
        if (aHire !== bHire) return bHire ? 1 : -1;

        const aScore = a.result.nash_bargaining_detail.nash_product
            ?? Object.values(a.result.nash_bargaining_detail.gains).reduce((s, g) => s + g, 0);
        const bScore = b.result.nash_bargaining_detail.nash_product
            ?? Object.values(b.result.nash_bargaining_detail.gains).reduce((s, g) => s + g, 0);
        return bScore - aScore;
    });

    if (sorted.length === 0) {
        els.leaderboard.innerHTML = '';
        els.leaderboardHdr.style.display = 'none';
        els.summaryBar.style.display     = 'none';
        return;
    }

    els.leaderboardHdr.style.display = 'grid';
    els.summaryBar.style.display     = 'flex';

    const hireCount   = sorted.filter(i => i.result.decision === 'hire').length;
    const rejectCount = sorted.length - hireCount;
    els.summaryTotal.textContent  = sorted.length;
    els.summaryHire.textContent   = hireCount;
    els.summaryReject.textContent = rejectCount;

    els.leaderboard.innerHTML = sorted.map((item, idx) => {
        const res       = item.result;
        const isHire    = res.decision === 'hire';
        const agentSummary = Object.entries(res.agent_outputs)
            .map(([k, o]) => {
                const colors = { skills: 'var(--agent-skills)', experience: 'var(--agent-experience)', education: 'var(--agent-education)', fairness: 'var(--agent-fairness)' };
                return `<span style="font-family:var(--font-mono);font-size:0.72rem;color:${colors[k]};">${o.utility.toFixed(2)}</span>`;
            }).join(' ');

        const displayName = item.file.name.replace(/\.(pdf|docx|txt)$/i, '');

        return `
            <div class="leaderboard-row" data-id="${item.id}" role="button" tabindex="0" aria-label="View details for ${escHtml(displayName)}">
                <span class="rank-num">${idx + 1}</span>
                <span class="rank-name" title="${escHtml(item.file.name)}">${escHtml(displayName)}</span>
                <span class="rank-score">${agentSummary}</span>
                <span><span class="verdict-chip ${isHire ? 'hire' : 'reject'}">${isHire ? '✓ Hire' : '✕ Reject'}</span></span>
                <span class="rank-arrow">›</span>
            </div>
        `;
    }).join('');

    // Bind click + keyboard
    els.leaderboard.querySelectorAll('.leaderboard-row').forEach(row => {
        const open = () => {
            const id   = Number(row.dataset.id);
            const item = fileQueue.find(i => i.id === id);
            if (item?.result) openDrawer(item);
        };
        row.addEventListener('click', open);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------
function openDrawer(item) {
    const name = item.file.name.replace(/\.(pdf|docx|txt)$/i, '');
    els.drawerName.textContent     = name;
    els.drawerSubtitle.textContent = item.result.decision === 'hire' ? '✓ Recommended for hire' : '✕ Not recommended';
    els.drawerSubtitle.style.color = item.result.decision === 'hire' ? 'var(--verdict-hire)' : 'var(--verdict-reject)';
    renderCandidateDetail(els.drawerContent, item.result);
    els.drawerOverlay.classList.add('open');
    els.drawer.classList.add('open');
    els.drawer.focus();
    document.body.style.overflow = 'hidden';

    // Animate score bars
    requestAnimationFrame(() => {
        els.drawer.querySelectorAll('.score-fill[data-pct]').forEach(b => { b.style.width = b.dataset.pct + '%'; });
        els.drawer.querySelectorAll('.shapley-fill[data-pct]').forEach(b => { b.style.width = b.dataset.pct + '%'; });
    });
}

function closeDrawer() {
    els.drawerOverlay.classList.remove('open');
    els.drawer.classList.remove('open');
    document.body.style.overflow = '';
}

els.drawerClose.addEventListener('click', closeDrawer);
els.drawerOverlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
