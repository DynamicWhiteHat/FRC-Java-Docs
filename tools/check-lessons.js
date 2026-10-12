// Run with:  node tools/check-lessons.js
//
// Checks every interactive block in docs/**/*.md so a broken exercise never
// reaches students:
//   playground  - the starter code must compile and run; for graded challenges
//                 the starter must FAIL the check and the //@@ solution must PASS it
//                 (and satisfy every //@ require rule).
//   quiz        - every "?" question must have 2+ options and at least one "+".
//                 (The page silently drops malformed questions, so we catch them here.)
//
// The grading rules mirror docs/javascripts/playground.js (parseBlock / doCheck).

const fs = require('fs');
const path = require('path');
const MiniJava = require('../docs/javascripts/minijava.js');
require('../docs/javascripts/wpilib-prelude.js');

const DOCS = path.join(__dirname, '..', 'docs');

/* ---------- same helpers the page uses ---------- */
function trimBlank(lines) {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b).join('\n');
}
function norm(s) {
  return String(s).replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/^\n+|\n+$/g, '');
}
function parseBlock(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const meta = {}, secs = { code: [], harness: [], expect: [], solution: [], explain: [], setup: [] }, hints = [];
  let cur = 'code', curHint = null, inHeader = true;
  lines.forEach((line) => {
    const m = /^\/\/@@\s*([a-z]+)\s*$/.exec(line);
    if (m) {
      cur = m[1];
      if (cur === 'hint') { curHint = []; hints.push(curHint); }
      else if (!secs[cur]) secs[cur] = [];
      return;
    }
    if (cur === 'code' && inHeader) {
      const hm = /^\/\/@\s*([a-z-]+)\s*:\s*(.*)$/.exec(line);
      if (hm) {
        if (hm[1] === 'require') (meta.require = meta.require || []).push(hm[2]);
        else meta[hm[1]] = hm[2];
        return;
      }
      if (line.trim()) inHeader = false;
      else if (!secs.code.length) return;
    }
    if (cur === 'hint') curHint.push(line); else secs[cur].push(line);
  });
  const out = { meta, hints: hints.map(trimBlank) };
  Object.keys(secs).forEach((k) => { out[k] = trimBlank(secs[k]); });
  return out;
}

/* ---------- find fenced blocks, even when indented inside tabs/admonitions ---------- */
function findBlocks(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)```(playground|quiz)\b/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const body = [];
    let j = i + 1;
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) {
      body.push(lines[j].slice(0, indent).trim() === '' ? lines[j].slice(indent) : lines[j]);
      j++;
    }
    if (j >= lines.length) blocks.push({ file, line: i + 1, kind: m[2], text: '', unterminated: true });
    else blocks.push({ file, line: i + 1, kind: m[2], text: body.join('\n') });
    i = j;
  }
  return blocks;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
}

/* ---------- checks ---------- */
const problems = [];
let nPlay = 0, nQuiz = 0, nQuestions = 0;
const rel = (f) => path.relative(path.join(__dirname, '..'), f);
function bad(b, msg) { problems.push(`✗ ${rel(b.file)}:${b.line}  ${msg}`); }

function runCheck(d, code, prelude) {
  // returns { ok, why }
  const reqs = d.meta.require || [];
  for (const r of reqs) {
    const parts = r.split(' | ');
    let re = null;
    try { re = new RegExp(parts[0]); } catch (e) { return { ok: false, why: `bad //@ require regex "${parts[0]}"` }; }
    if (!re.test(code.replace(/\/\/.*$/gm, ''))) return { ok: false, why: `missing requirement: ${parts[1] || parts[0]}` };
  }
  const r = MiniJava.run(code, { prelude, harness: d.harness, userLines: code.split('\n').length });
  if (r.error) return { ok: false, why: `${r.error.kind} error line ${r.error.line}: ${String(r.error.message).split('\n')[0]}` };
  if (norm(r.output) === norm(d.expect)) return { ok: true };
  return { ok: false, why: `output differs\n      expected: ${JSON.stringify(norm(d.expect))}\n      got:      ${JSON.stringify(norm(r.output))}` };
}

function checkPlayground(b) {
  nPlay++;
  const d = parseBlock(b.text);
  const prelude = (d.meta.prelude || '').split(',').map((s) => s.trim()).filter(Boolean);
  const panel = d.meta.panel === 'robot';
  if (panel && !prelude.includes('wpilib')) prelude.push('wpilib');
  const mode = d.meta.mode === 'predict' ? 'predict' : 'run';
  const graded = !!d.expect && mode === 'run';
  const label = d.meta.title ? `"${d.meta.title}"` : '(untitled)';

  if (!d.code.trim()) return bad(b, `${label}: no starter code`);

  if (mode === 'predict') {
    const r = MiniJava.run(d.code, { prelude, userLines: d.code.split('\n').length });
    if (r.error) bad(b, `${label}: predict code errors: ${r.error.message.split('\n')[0]}`);
    else if (!norm(r.output)) bad(b, `${label}: predict code prints nothing`);
    return;
  }

  if (panel) {
    const s = MiniJava.createSession(d.code, { prelude });
    if (s.error) return bad(b, `${label}: robot code does not compile: ${s.error.message.split('\n')[0]}`);
    const names = s.classNames || [];
    let setup = d.setup;
    if (!setup) {
      if (names.includes('Robot')) setup = 'Sim.start(new Robot());';
      else if (names.includes('RobotContainer')) setup = 'RobotContainer container = new RobotContainer();';
      else return bad(b, `${label}: robot panel needs a class named Robot or RobotContainer`);
    }
    const r = s.exec(`${setup} Sim.setMode("teleop"); Sim.loops(5);`);
    if (r.error) bad(b, `${label}: robot code fails when started: ${String(r.error.message).split('\n')[0]}`);
  } else if (!graded) {
    const r = MiniJava.run(d.code, { prelude, userLines: d.code.split('\n').length });
    if (r.error) bad(b, `${label}: starter code errors: ${String(r.error.message).split('\n')[0]}`);
  }

  if (graded || (panel && d.harness)) {
    if (!d.expect) return bad(b, `${label}: has a harness but no //@@ expect`);
    if (!d.solution) return bad(b, `${label}: graded challenge has no //@@ solution`);
    if (d.hints.length === 0) problems.push(`! ${rel(b.file)}:${b.line}  ${label}: challenge has no hints (not an error)`);
    const starter = runCheck(d, d.code, prelude);
    if (starter.ok) bad(b, `${label}: the starter code already passes the check, so the challenge is already "solved"`);
    const sol = runCheck(d, d.solution, prelude);
    if (!sol.ok) bad(b, `${label}: the //@@ solution does NOT pass: ${sol.why}`);
  }
}

function parseQuiz(text) {
  const items = [];
  let cur = null, declared = 0;
  text.replace(/\r/g, '').split('\n').forEach((line) => {
    if (/^@\s*[a-z]+\s*:/.test(line)) return;
    if (/^\?\s/.test(line)) { declared++; cur = { q: line.slice(2).trim(), opts: [] }; items.push(cur); return; }
    if (!cur) return;
    if (/^[-+]\s/.test(line)) cur.opts.push({ ok: line.charAt(0) === '+' });
  });
  return { items, declared };
}

function checkQuiz(b) {
  nQuiz++;
  const { items } = parseQuiz(b.text);
  if (!items.length) bad(b, 'quiz has no questions');
  items.forEach((it, i) => {
    nQuestions++;
    const n = it.opts.length, ok = it.opts.filter((o) => o.ok).length;
    if (n < 2) bad(b, `question ${i + 1} ("${it.q.slice(0, 40)}") has fewer than 2 options, the page would drop it`);
    else if (ok === 0) bad(b, `question ${i + 1} ("${it.q.slice(0, 40)}") has no correct answer marked with +`);
    else if (ok === n) bad(b, `question ${i + 1} ("${it.q.slice(0, 40)}") has every option marked correct`);
  });
}

for (const file of walk(DOCS)) {
  for (const b of findBlocks(file)) {
    if (b.unterminated) { bad(b, `${b.kind} block is never closed`); continue; }
    if (b.kind === 'playground') checkPlayground(b); else checkQuiz(b);
  }
}

const hard = problems.filter((p) => p.startsWith('✗'));
const notes = problems.filter((p) => p.startsWith('!'));
console.log(`${nPlay} playground blocks, ${nQuiz} quizzes (${nQuestions} questions) checked`);
if (notes.length) console.log('\n' + notes.join('\n'));
if (hard.length) { console.log('\n' + hard.join('\n')); console.log(`\n${hard.length} problem(s)`); process.exit(1); }
console.log('all good');
