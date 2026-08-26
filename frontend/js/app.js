/**
 * app.js — Single-candidate evaluation panel
 *
 * Handles: tab switching, file upload (drag-and-drop + click), sample
 * loading, API calls, loading states, and result rendering via results-view.js.
 *
 * Same-origin (FastAPI serves this file directly), so API_BASE is empty.
 */

import { renderCandidateDetail } from './results-view.js';

const API_BASE = '';

const els = {
    jobDescription:  document.getElementById('job-description'),
    resume:          document.getElementById('resume'),
    sampleSelect:    document.getElementById('sample-select'),
    runBtn:          document.getElementById('run-btn'),
    status:          document.getElementById('status'),
    results:         document.getElementById('results'),
    emptyState:      document.getElementById('empty-state'),
    dropzone:        document.getElementById('dropzone'),
    fileInput:       document.getElementById('file-input'),
    filenameDisplay: document.getElementById('filename-display'),
    tabButtons:      document.querySelectorAll('.tab-btn'),
    tabUpload:       document.getElementById('tab-upload'),
    tabPaste:        document.getElementById('tab-paste'),
};

let SAMPLES = { job_description: '', resumes: {} };

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
els.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        els.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isUpload = btn.dataset.tab === 'upload';
        els.tabUpload.style.display = isUpload ? 'block' : 'none';
        els.tabPaste.style.display  = isUpload ? 'none'  : 'block';
    });
});

function switchToTab(tabName) {
    const btn = [...els.tabButtons].find(b => b.dataset.tab === tabName);
    if (btn) btn.click();
}

// ---------------------------------------------------------------------------
// File upload — click to browse, drag-and-drop
// ---------------------------------------------------------------------------
els.dropzone.addEventListener('click', () => els.fileInput.click());
els.dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') els.fileInput.click(); });

['dragenter', 'dragover'].forEach(evt =>
    els.dropzone.addEventListener(evt, e => { e.preventDefault(); els.dropzone.classList.add('drag-over'); })
);

['dragleave', 'drop'].forEach(evt =>
    els.dropzone.addEventListener(evt, e => { e.preventDefault(); els.dropzone.classList.remove('drag-over'); })
);

els.dropzone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
});

els.fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
});

async function handleFileUpload(file) {
    const validExt = /\.(pdf|docx|txt)$/i.test(file.name);
    if (!validExt) {
        setStatus('Unsupported file type — please upload a .pdf, .docx, or .txt file.', true);
        return;
    }

    setStatus(`Extracting text from <em>${escHtml(file.name)}</em>…`);
    els.filenameDisplay.textContent = '';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API_BASE}/extract-text`, { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || 'Extraction failed');
        }
        const data = await res.json();
        els.resume.value = data.text;
        els.filenameDisplay.textContent = `✓ ${data.filename} — ${data.text.length.toLocaleString()} characters extracted`;
        setStatus('');
        switchToTab('paste'); // show the extracted text
    } catch (e) {
        setStatus(`Could not read file: ${escHtml(e.message)}`, true);
    }
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------
async function loadSamples() {
    try {
        const res = await fetch(`${API_BASE}/samples`);
        if (!res.ok) throw new Error('Could not load samples');
        SAMPLES = await res.json();
        els.jobDescription.value = SAMPLES.job_description;
        Object.keys(SAMPLES.resumes).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key.replaceAll('_', ' ');
            els.sampleSelect.appendChild(opt);
        });
    } catch {
        setStatus('Could not reach the backend — make sure <code>uvicorn backend.api:app --reload</code> is running.', true);
    }
}

els.sampleSelect.addEventListener('change', () => {
    const key = els.sampleSelect.value;
    if (!key) return;
    els.resume.value = SAMPLES.resumes[key];
    els.filenameDisplay.textContent = '';
    switchToTab('paste');
});

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function setStatus(html, isError = false) {
    els.status.innerHTML = html
        ? `<span style="color:${isError ? 'var(--verdict-reject)' : 'var(--text-muted)'}">${html}</span>`
        : '';
}

function deliberatingHTML() {
    return `<span class="deliberating"><span class="dot-pulse"><span></span><span></span><span></span><span></span></span>Four agents deliberating…</span>`;
}

// ---------------------------------------------------------------------------
// Run evaluation
// ---------------------------------------------------------------------------
async function runEvaluation() {
    const resumeText     = els.resume.value.trim();
    const jobDescription = els.jobDescription.value.trim();

    if (!resumeText) {
        setStatus('Upload a resume file or paste resume text first.', true);
        return;
    }
    if (!jobDescription) {
        setStatus('Please provide a job description.', true);
        return;
    }

    els.runBtn.disabled = true;
    els.emptyState.style.display = 'none';
    els.results.style.display    = 'none';
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
        renderCandidateDetail(els.results, result);
        els.emptyState.style.display = 'none';
        els.results.style.display    = 'block';
    } catch (e) {
        setStatus(`Evaluation failed: ${escHtml(e.message)}`, true);
        els.emptyState.style.display = 'block';
    } finally {
        els.runBtn.disabled = false;
    }
}

els.runBtn.addEventListener('click', runEvaluation);
loadSamples();

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}