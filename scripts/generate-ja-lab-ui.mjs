#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const LAB_DIR = path.join(ROOT, 'src/models/labs');
const OUT = path.join(ROOT, 'src/locales/ja-labs.json');
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error('OPENAI_API_KEY is not set');
const MODEL = process.env.TRANSLATION_MODEL || 'gpt-5.4-mini';
const RE = /(['"])((?:\\.|(?!\1).)*)\1/g;

function decode(raw, quote) {
  if (quote === '`' && raw.includes('${')) return null;
  try { return Function(`"use strict";return ${quote}${raw}${quote}`)(); }
  catch { return null; }
}

const values = new Set();
for (const file of (await readdir(LAB_DIR)).filter((x) => x.endsWith('.ts') && x !== 'spec.ts')) {
  const source = await readFile(path.join(LAB_DIR, file), 'utf8');
  for (const match of source.matchAll(RE)) {
    const value = decode(match[2], match[1]);
    if (value && /[A-Za-z]{3,}(?:\s|\()/i.test(value)) values.add(value);
  }
}

const sourceStrings = [...values].sort();
const translated = {};
const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    translations: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { i: { type: 'integer' }, ja: { type: 'string' } },
        required: ['i', 'ja'],
      },
    },
  },
  required: ['translations'],
};
const instructions = `Translate semiconductor simulator UI strings from English to natural technical Japanese. Preserve every number, unit, formula, variable, symbol, source id, and abbreviation such as V/G, O_i, ALD, CMP, EDS, WebGL and Ar. Translate ordinary labels, explanations, warnings, chart titles, axes, feedback and trade-off prose. Do not summarize or omit. Return exactly one translation for every input index.`;

for (let start = 0; start < sourceStrings.length; start += 24) {
  const batch = sourceStrings.slice(start, start + 24);
  process.stdout.write(`${start}/${sourceStrings.length}\n`);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, store: false, instructions,
      input: JSON.stringify(batch.map((text, i) => ({ i, text }))),
      text: { format: { type: 'json_schema', name: 'translations', strict: true, schema } },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  const raw = body.output_text ?? body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text;
  const rows = JSON.parse(raw).translations.sort((a, b) => a.i - b.i);
  if (rows.length !== batch.length) throw new Error(`Expected ${batch.length}, got ${rows.length}`);
  rows.forEach((row, i) => { translated[batch[i]] = row.ja; });
}

await writeFile(OUT, JSON.stringify(translated, null, 2) + '\n');
console.log(`wrote ${sourceStrings.length} strings to ${path.relative(ROOT, OUT)}`);
