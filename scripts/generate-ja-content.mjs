#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ALL_PROCESSES = ['wafer', 'oxidation', 'photo', 'etch', 'deposition', 'metal', 'eds', 'packaging'];
const requested = (process.env.TRANSLATION_PROCESSES ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const PROCESSES = requested.length ? requested : ALL_PROCESSES;
const unknown = PROCESSES.filter((x) => !ALL_PROCESSES.includes(x));
if (unknown.length) throw new Error(`Unknown process id: ${unknown.join(', ')}`);
const MODEL = process.env.TRANSLATION_MODEL || 'gpt-5.4-mini';
const API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY && !GEMINI_API_KEY) throw new Error('No translation API key is set');

const GLOSSARY = `
wafer=ウェーハ, oxidation=酸化, thermal oxidation=熱酸化, oxide film=酸化膜,
photolithography=フォトリソグラフィ, photoresist=フォトレジスト, exposure=露光, develop=現像,
etching=エッチング, selectivity=選択比, anisotropy=異方性, plasma=プラズマ,
deposition=成膜, ion implantation=イオン注入, ALD=ALD, CVD=CVD, PVD=PVD,
metallization=金属配線, interconnect=配線, CMP=CMP, slurry=スラリー,
electrical die sorting=EDS（ウェーハ検査）, probe card=プローブカード, yield=歩留まり,
packaging=パッケージング, wire bonding=ワイヤボンディング, underfill=アンダーフィル,
throughput=スループット, pass window=合格範囲, specification=規格, spread=ばらつき,
advanced lab=応用実習, applied lab=実践実習, basic lab=基礎実習, source=出典。`;

function shouldTranslate(key, parentKey, value) {
  if (typeof value !== 'string') return false;
  if (['title', 'text', 'caption', 'stem', 'explanation', 'intro', 'goal', 'passHint'].includes(key)) return true;
  if (['choices', 'items', 'labels'].includes(parentKey)) return true;
  return false;
}

function collect(node, out = [], key = '', parentKey = '') {
  if (typeof node === 'string') {
    if (shouldTranslate(key, parentKey, node)) out.push({ ref: out.length, text: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collect(v, out, String(i), key));
    return out;
  }
  if (node && typeof node === 'object') {
    Object.entries(node).forEach(([k, v]) => collect(v, out, k, key));
  }
  return out;
}

function replace(node, translated, cursor = { n: 0 }, key = '', parentKey = '') {
  if (typeof node === 'string') {
    if (!shouldTranslate(key, parentKey, node)) return node;
    const value = translated[cursor.n++];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing translation at ${cursor.n - 1}`);
    return value;
  }
  if (Array.isArray(node)) return node.map((v, i) => replace(v, translated, cursor, String(i), key));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, replace(v, translated, cursor, k, key)]));
  return node;
}

function placeholders(s) { return [...s.matchAll(/\{[A-Za-z0-9_]+\}/g)].map((m) => m[0]).sort().join('|'); }

async function translateBatch(batch, label, attempt = 1) {
  const schema = {
    type: 'object', additionalProperties: false,
    properties: { translations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { i: { type: 'integer' }, ja: { type: 'string' } }, required: ['i', 'ja'] } } },
    required: ['translations'],
  };
  const instruction = `Translate semiconductor training content from English to natural, technically precise Japanese. Preserve every number, unit, symbol, formula fragment, placeholder such as {count}, source id, and quoted control name. Do not summarize, omit, explain, or add claims. Use consistent Japanese engineering terminology. Glossary: ${GLOSSARY}`;
  if (GEMINI_API_KEY) {
    const geminiSchema = JSON.parse(JSON.stringify(schema, (k, v) => k === 'additionalProperties' ? undefined : v));
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(batch.map((x, i) => ({ i, text: x.text }))) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema, temperature: 0.1 },
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`${label}: ${response.status} ${JSON.stringify(body)}`);
    const raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
    if (!raw) throw new Error(`${label}: no Gemini output text`);
    const parsed = JSON.parse(raw).translations;
    if (parsed.length !== batch.length) throw new Error(`${label}: expected ${batch.length}, got ${parsed.length}`);
    parsed.sort((a, b) => a.i - b.i);
    for (let i = 0; i < batch.length; i++) {
      if (placeholders(batch[i].text) !== placeholders(parsed[i].ja)) throw new Error(`${label}: placeholder mismatch at ${i}`);
    }
    return parsed.map((x) => x.ja);
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, store: false,
      instructions: instruction,
      input: JSON.stringify(batch.map((x, i) => ({ i, text: x.text }))),
      text: { format: { type: 'json_schema', name: 'translations', strict: true, schema } },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${label}: ${response.status} ${JSON.stringify(body)}`);
  const raw = body.output_text ?? body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text;
  if (!raw) throw new Error(`${label}: no output_text`);
  const parsed = JSON.parse(raw).translations;
  if (parsed.length !== batch.length) {
    if (attempt < 3) return translateBatch(batch, label, attempt + 1);
    throw new Error(`${label}: expected ${batch.length}, got ${parsed.length}`);
  }
  parsed.sort((a, b) => a.i - b.i);
  for (let i = 0; i < batch.length; i++) {
    if (placeholders(batch[i].text) !== placeholders(parsed[i].ja)) throw new Error(`${label}: placeholder mismatch at ${i}`);
  }
  return parsed.map((x) => x.ja);
}

async function translateFile(src, dest) {
  const original = JSON.parse(await readFile(src, 'utf8'));
  const strings = collect(original);
  const translated = [];
  for (let i = 0; i < strings.length; i += 28) {
    const batch = strings.slice(i, i + 28);
    process.stdout.write(`${path.relative(ROOT, src)} ${i}/${strings.length}\n`);
    translated.push(...await translateBatch(batch, path.basename(src)));
  }
  const output = replace(original, translated);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(output, null, 2) + '\n');
}

for (const processId of PROCESSES) {
  await translateFile(path.join(ROOT, 'src/content/en', `${processId}.json`), path.join(ROOT, 'src/content/ja', `${processId}.json`));
  await translateFile(path.join(ROOT, 'src/content/en/questions', `${processId}.json`), path.join(ROOT, 'src/content/ja/questions', `${processId}.json`));
  await translateFile(path.join(ROOT, 'src/content/lab-guide/en', `${processId}.json`), path.join(ROOT, 'src/content/lab-guide/ja', `${processId}.json`));
}
