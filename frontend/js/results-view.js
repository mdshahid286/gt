/**
 * results-view.js
 *
 * Renders a full evaluation result (as returned by POST /evaluate) into a
 * given DOM container. Called from both app.js (single candidate) and
 * batch.js (drawer drill-down).
 *
 * No external dependencies — pure DOM manipulation + CSS classes from style.css.
 */

const AGENT_META = {
    skills:     { label: 'Skills',     icon: '🛠️', colorVar: '--agent-skills',     glowVar: '--glow-skills' },
    experience: { label: 'Experience', icon: '📈', colorVar: '--agent-experience', glowVar: '--glow-experience' },
    education:  { label: 'Education',  icon: '🎓', colorVar: '--agent-education',  glowVar: '--glow-education' },
    fairness:   { label: 'Fairness',   icon: '⚖️', colorVar: '--agent-fairness',   glowVar: '--glow-fairness' },
};

/**
 * Render the full candidate evaluation into `container`.
 * @param {HTMLElement} container
 * @param {object}      result – the /evaluate API response
 */
export function renderCandidateDetail(container, result) {
    const { decision, nash_bargaining_detail, agent_outputs, shapley_explanation } = result;

    container.innerHTML = `
        ${buildVerdictSection(decision, nash_bargaining_detail)}
        ${buildAgentScoresSection(agent_outputs)}
        ${buildShapleySection(shapley_explanation)}
        ${buildNashDetailSection(nash_bargaining_detail)}
    `;

    // Animate score bars in the next frame so CSS transitions fire
    requestAnimationFrame(() => {
        container.querySelectorAll('.score-fill[data-pct]').forEach(bar => {
            bar.style.width = bar.dataset.pct + '%';
        });
        container.querySelectorAll('.shapley-fill[data-pct]').forEach(bar => {
            bar.style.width = bar.dataset.pct + '%';
        });
    });
}

/* ---- Verdict ---------------------------------------------------------- */

function buildVerdictSection(decision, nashDetail) {
    const isHire  = decision === 'hire';
    const cls     = isHire ? 'verdict-hire' : 'verdict-reject';
    const icon    = isHire ? '✓' : '✕';
    const label   = isHire ? 'Hired' : 'Rejected';

    return `
        <div style="margin-bottom:18px;">
            <span class="verdict-badge ${cls}">
                <span class="verdict-dot"></span>
                ${icon} ${label}
            </span>
        </div>
        <div class="reason-card">${escHtml(nashDetail.reason)}</div>
    `;
}

/* ---- Agent scores ----------------------------------------------------- */

function buildAgentScoresSection(agentOutputs) {
    const cards = Object.entries(AGENT_META).map(([key, meta]) => {
        const out = agentOutputs[key];
        if (!out) return '';
        const pct  = Math.max(0, Math.min(1, out.utility)) * 100;
        const color = `var(${meta.colorVar})`;
        const flags = (out.flags || []).map(f => `<span class="flag-pill">⚑ ${escHtml(f)}</span>`).join('');

        return `
            <div class="card agent-result-card border-${key}">
                <div class="agent-header">
                    <span>${meta.icon}</span>
                    <span class="agent-name accent-${key}">${meta.label}</span>
                </div>
                <div class="score-value" style="color:${color};">${out.utility.toFixed(2)}</div>
                <div class="score-track">
                    <div class="score-fill" style="background:${color};" data-pct="${pct.toFixed(1)}"></div>
                </div>
                ${flags}
                <div class="rationale">${escHtml(out.rationale)}</div>
            </div>
        `;
    }).join('');

    return `
        <div style="margin-top:22px;">
            <div class="eyebrow" style="margin-bottom:14px;letter-spacing:0.1em;">Agent scores</div>
            <div class="agent-results-grid">${cards}</div>
        </div>
    `;
}

/* ---- Shapley chart ----------------------------------------------------- */

function buildShapleySection(shapleyExp) {
    const vals    = shapleyExp.values;
    const isPercent = shapleyExp.type === 'percentage';

    // Find the max absolute value to normalise bar widths
    const maxAbs = Math.max(...Object.values(vals).map(Math.abs), 0.001);

    const rows = Object.entries(AGENT_META).map(([key, meta]) => {
        const raw  = vals[key] ?? 0;
        const pct  = (Math.abs(raw) / maxAbs) * 100;
        const color = raw >= 0 ? `var(${meta.colorVar})` : 'var(--verdict-reject)';
        const displayVal = isPercent
            ? `${raw.toFixed(1)}%`
            : (raw >= 0 ? `+${raw.toFixed(3)}` : raw.toFixed(3));

        return `
            <div class="shapley-bar-row">
                <div class="shapley-label">${meta.label}</div>
                <div class="shapley-track">
                    <div class="shapley-fill" style="background:${color};" data-pct="${pct.toFixed(1)}"></div>
                </div>
                <div class="shapley-value" style="color:${color};">${displayVal}</div>
            </div>
        `;
    }).join('');

    const subtitle = isPercent
        ? '% contribution to the hire decision (exact Shapley, 2⁴ = 16 coalition subsets)'
        : (shapleyExp.note || 'Raw Shapley values — more positive = stronger pull toward hire');

    return `
        <div class="shapley-section" style="margin-top:26px;">
            <div class="eyebrow" style="margin-bottom:14px;letter-spacing:0.1em;">Shapley attribution</div>
            ${rows}
            <div style="font-size:0.75rem;color:var(--text-faint);margin-top:12px;font-family:var(--font-mono);line-height:1.55;">${escHtml(subtitle)}</div>
        </div>
    `;
}

/* ---- Nash bargaining detail ------------------------------------------- */

function buildNashDetailSection(nashDetail) {
    const gains     = nashDetail.gains || {};
    const nashProd  = nashDetail.nash_product;

    const rows = Object.entries(gains).map(([agent, gain]) => {
        const meta     = AGENT_META[agent] || { label: agent, colorVar: '--text-muted' };
        const gainCls  = gain > 0 ? 'gain-positive' : 'gain-negative';
        const gainStr  = (gain >= 0 ? '+' : '') + gain.toFixed(4);
        return `
            <tr>
                <td>${meta.label}</td>
                <td class="${gainCls}">${gainStr}</td>
                <td>${(gains[agent] > 0) ? '✓ above floor' : '✕ at/below floor'}</td>
            </tr>
        `;
    }).join('');

    const nashProductRow = nashProd != null
        ? `<tr><td style="color:var(--text-faint);font-size:0.75rem;padding-top:14px;">Nash product</td><td colspan="2" style="font-family:var(--font-mono);color:var(--text-muted);padding-top:14px;">${nashProd.toFixed(6)}</td></tr>`
        : '';

    return `
        <div class="nash-detail" style="margin-top:8px;">
            <details>
                <summary>Nash bargaining detail</summary>
                <table class="gains-table">
                    <thead>
                        <tr>
                            <th>Agent</th>
                            <th>Gain (utility − floor)</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        ${nashProductRow}
                    </tbody>
                </table>
            </details>
        </div>
    `;
}

/* ---- Utilities --------------------------------------------------------- */

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
