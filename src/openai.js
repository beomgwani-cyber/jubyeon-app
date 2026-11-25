// 휴대폰에서 ChatGPT API를 직접 호출해 사진을 분석한다.

import { ANALYSIS_SCHEMA, SYSTEM_PROMPT, USER_PROMPT } from './schema.js';
import { DESK_SCHEMA, DESK_SYSTEM_PROMPT, deskUserPrompt } from './desk/schema.js';
import { GLASSES_SCHEMA, GLASSES_SYSTEM_PROMPT, glassesUserPrompt } from './glasses/schema.js';

export const DEFAULT_MODEL = 'gpt-5.5';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 150000;

export class AnalysisError extends Error {}

/** 화재안전: base64 JPEG를 분석해 { raw, model }을 반환한다. */
export async function analyzePhoto(base64Jpeg, apiKey, model = DEFAULT_MODEL) {
  return chatJson({
    base64Jpeg, apiKey, model,
    name: 'fire_guard_analysis', schema: ANALYSIS_SCHEMA, system: SYSTEM_PROMPT, user: USER_PROMPT,
  });
}

/** 책상정리: 예산 안의 구입 포함 정리안을 분석해 { raw, model }을 반환한다. */
export async function analyzeDesk(base64Jpeg, budget, apiKey, model = DEFAULT_MODEL) {
  return chatJson({
    base64Jpeg, apiKey, model,
    name: 'desk_plan', schema: DESK_SCHEMA, system: DESK_SYSTEM_PROMPT, user: deskUserPrompt(budget),
  });
}

/** 맞춤 안경: 얼굴 사진과 선호(용도·예산·분위기)로 추천 3개를 받아 { raw, model }을 반환한다. */
export async function analyzeGlasses(base64Jpeg, prefs, apiKey, model = DEFAULT_MODEL) {
  return chatJson({
    base64Jpeg, apiKey, model,
    name: 'glasses_plan', schema: GLASSES_SCHEMA, system: GLASSES_SYSTEM_PROMPT, user: glassesUserPrompt(prefs),
  });
}

/** 사진 + 지시문을 보내고 JSON 스키마에 맞는 응답을 받는다. */
async function chatJson({ base64Jpeg, apiKey, model, name, schema, system, user }) {
  model = model || DEFAULT_MODEL;
  if (!apiKey) throw new AnalysisError('ChatGPT API 키가 없습니다. 설정 화면에서 키를 입력하세요.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: 16000,
        response_format: {
          type: 'json_schema',
          json_schema: { name, strict: true, schema },
        },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: user },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}`, detail: 'high' } },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new AnalysisError('응답 시간이 너무 오래 걸립니다. 다시 시도하세요.');
    throw new AnalysisError('네트워크 연결 실패: 인터넷 연결을 확인하세요.');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // 아래에서 상태 코드로 처리
  }

  if (!res.ok) {
    const err = data?.error || {};
    const text = `${err.code || ''} ${err.type || ''} ${err.message || ''}`.toLowerCase();
    if (res.status === 401) throw new AnalysisError('API 키가 올바르지 않습니다. 설정에서 키를 확인하세요.');
    if (res.status === 429 && text.includes('quota'))
      throw new AnalysisError('ChatGPT API 잔액/한도가 부족합니다. platform.openai.com → Billing을 확인하세요.');
    if (res.status === 429) throw new AnalysisError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.');
    if (res.status === 404 || text.includes('model'))
      throw new AnalysisError(`모델 '${model}'을(를) 사용할 수 없습니다. 설정에서 다른 모델(예: gpt-5)을 입력하세요.`);
    throw new AnalysisError(`ChatGPT API 오류 (${res.status}): ${err.message || '알 수 없는 오류'}`);
  }

  const choice = data?.choices?.[0];
  if (choice?.message?.refusal) throw new AnalysisError('AI가 이 사진의 분석을 거절했습니다. 다른 사진으로 시도하세요.');
  if (choice?.finish_reason === 'length') throw new AnalysisError('응답이 중간에 잘렸습니다. 다시 시도하세요.');
  try {
    return { raw: JSON.parse(choice?.message?.content || ''), model: data?.model || model };
  } catch {
    throw new AnalysisError('AI 응답을 해석하지 못했습니다. 다시 시도하세요.');
  }
}

// ── 개선 예시 이미지 ────────────────────────────────────────────
// 원본 사진을 바탕으로 이미지 AI가 그림을 그린다 (실제 사진 아님).

const IMAGE_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';
// 앞의 모델을 쓸 수 없으면 다음 모델로 자동 재시도
const IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'];
const IMAGE_TIMEOUT_MS = 180000;

// ── 안전관리 가이드 포스터 (ChatGPT에서 만든 예시와 같은 형식) ─────────
// 원본 사진 + 분석 결과를 주고, 이미지 AI가 포스터 한 장을 통째로 그린다.

const pos = (v) => (v < 0.34 ? 'left' : v > 0.66 ? 'right' : 'center');
const vpos = (v) => (v < 0.34 ? 'top' : v > 0.66 ? 'bottom' : 'middle');

export function posterPrompt(result) {
  const title = `${result.guide_title || '전기설비'} 안전관리 가이드`;
  const obs = result.observations.slice(0, 4);
  const actions = (result.actions.length
    ? result.actions
    : [{ title: '정기적으로 직접 점검', detail: '전선 손상·변색·먼지·주변 가연물을 눈으로 확인' }]
  ).slice(0, 5);
  const badge = result.level === '판정 불가' ? '판정 불가' : `위험도: ${result.level}`;

  const callouts = obs
    .map((o) => `  (${o.no}) "${o.label}" — pointing at the ${vpos(o.y)}-${pos(o.x)} area of the photo`)
    .join('\n');
  const leftRows = obs.map((o) => `  ${o.no}. "${o.detail}"  [highlighted phrase: "${o.label}"]`).join('\n');
  const rightRows = actions.map((a, i) => `  ${i + 1}. "${a.detail}"  [highlighted phrase: "${a.title}"]`).join('\n');

  return [
    'Design a polished Korean public-safety infographic poster (portrait), like an official office fire-safety guide.',
    'Use the attached photo as the BEFORE photo. Exact Korean text is given in quotes — copy it exactly, with correct Korean spelling.',
    'Do not add any other text.',
    '',
    'LAYOUT',
    `1. Header: a navy shield icon with a power plug on the left; big bold dark-navy title "${title}";`,
    '   smaller gray subtitle below: "지금 사용 중인 전기설비 상태를 점검하고, 더 안전한 관리 방법을 실천하세요."',
    '2. Two equal columns side by side, each a white rounded card with a colored header bar:',
    `   LEFT card — navy header "현재 상태 진단" with a yellow rounded badge "⚠ ${badge}".`,
    '   Inside: the attached BEFORE photo (keep it faithful to the original), with numbered circle markers',
    '   connected by thin lines to small white callout boxes:',
    callouts || '  (no callouts)',
    '   Below the photo, one light-gray rounded row per item: a colored flat icon, then the sentence, with the',
    '   highlighted phrase on a yellow marker-style highlight:',
    leftRows || '  1. "사진상 뚜렷한 위험 후보가 보이지 않음"  [highlighted phrase: "직접 점검 병행"]',
    '   RIGHT card — blue header "더 좋은 관리 방법".',
    '   Inside: a photorealistic AFTER photo of the SAME place (same angle, same type of power strip) with all',
    '   improvements clearly applied: fewer plugs, unused chargers unplugged, cables neatly tied, dust-free,',
    '   ventilated space, nothing flammable nearby. Same size as the left photo. Add a few small sparkle accents.',
    '   Below it, one light-blue rounded row per item: a blue flat icon, then the sentence, with the highlighted',
    '   phrase on a light-blue marker-style highlight:',
    rightRows,
    '3. Bottom strip across the full width: a navy rounded label with a magnifier icon "즉시 점검 포인트";',
    '   three yellow-outlined chips with icons: "타는 냄새", "변색·그을음", "비정상 발열";',
    '   below them a pale-yellow bar with a warning icon: "이상이 있으면 즉시 사용을 중지하고 점검하세요."',
    '4. Tiny gray footer: "AI 보조 판독 결과 · 전문 전기안전점검을 대신하지 않습니다"',
    '',
    'STYLE: clean flat vector UI, navy (#1B365D) and blue (#2563A8) with yellow accents, light gray-blue background,',
    'rounded corners, generous spacing, bold modern Korean sans-serif, high legibility.',
  ].join('\n');
}

/** 원본 사진으로 안전관리 가이드 포스터 한 장을 만들어 base64 PNG를 반환한다. */
export async function generatePoster(photoUri, result, apiKey) {
  return editImage(photoUri, posterPrompt(result), '1024x1536', 'high', apiKey, 300000);
}

// ── 책상정리: 구입 물품을 놓은 정리 후 이미지 ────────────────────────
// 한글은 이미지 AI가 자주 틀리므로 글자 없이, 새 물품 옆에 숫자 배지만 그리게 한다.

export function deskImagePrompt(result) {
  const keep = result.keep_structure.length ? result.keep_structure.join(', ') : 'desk, walls, window, monitor, chair';
  const items = result.purchases
    .map((p) => `  ${p.no}) ${p.name_en} — placed at the ${vpos(p.y)}-${pos(p.x)} area of the photo (${p.placement})`)
    .join('\n');
  return [
    'Edit the attached photo into a photorealistic AFTER photo of the SAME desk after it has been tidied up',
    'and a few new organizing products have been added. It must look like a real smartphone photo, not a render.',
    '',
    'KEEP EXACTLY: the same camera angle, framing, lighting, room, walls, window, floor, desk shape and position,',
    `and these fixed objects in the same places: ${keep}. Do not add new furniture. Do not remove the user's own`,
    'devices, books or plants — tidy and regroup them instead.',
    '',
    'TIDY UP:',
    result.after_scene_en || 'Clear the main work surface, group small items together, hide loose cables, stack papers neatly.',
    '',
    'ADD THESE NEW PRODUCTS (realistic size, simple modern design, colors matching the room):',
    items || '  (none)',
    '',
    'NUMBER BADGES: next to each new product, draw a small clean circle badge (white fill, navy #1B365D border)',
    'containing only its number digit (1, 2, 3 …) so it can be matched to a list. Each badge must touch or point',
    'to its product. No other text, letters, labels, captions or logos anywhere in the image.',
  ].join('\n');
}

/** 원본 사진 방향에 맞는 크기로 정리 후 이미지를 그려 base64를 반환한다. */
export async function generateDeskImage(photoUri, result, landscape, apiKey) {
  const size = landscape ? '1536x1024' : '1024x1536';
  return editImage(photoUri, deskImagePrompt(result), size, 'high', apiKey, 300000);
}

// ── 맞춤 안경: 본인 얼굴에 추천 안경을 씌운 착용 예시 ───────────────────
// 얼굴·표정·배경은 그대로 두고 안경만 더한다. 글자는 넣지 않는다.

export function glassesImagePrompt(rec, purpose) {
  const lens =
    purpose === '선글라스'
      ? 'tinted sunglass lenses in a natural color that still lets the eyes be faintly visible'
      : 'clear prescription lenses with a very subtle natural reflection; the eyes must stay fully visible';
  return [
    'Edit the attached photo so the SAME person is wearing a pair of eyeglasses. It must look like a real',
    'smartphone photo, not a render or illustration.',
    '',
    'GLASSES:',
    `${rec.image_prompt_en}.`,
    `Lenses: ${lens}.`,
    'Realistic adult size: the frame width matches the face width at the temples, lenses centred on the pupils,',
    'the bridge resting on the nose, temples going back over the ears, correct perspective for the head angle.',
    '',
    'KEEP EXACTLY: the person\'s identity, face shape, skin, expression, eyes, eyebrows, hair, clothing, pose,',
    'background, lighting and framing. Change nothing except adding the glasses and their natural shadows.',
    'No text, letters, logos or watermarks anywhere.',
  ].join('\n');
}

/** 원본 얼굴 사진에 추천 안경 하나를 씌운 이미지를 그려 base64를 반환한다. */
export async function generateTryOnImage(photoUri, rec, purpose, landscape, apiKey) {
  const size = landscape ? '1536x1024' : '1024x1536';
  return editImage(photoUri, glassesImagePrompt(rec, purpose), size, 'high', apiKey, 300000);
}

/** OpenAI 이미지 편집 API 호출 (모델 이름을 못 쓰면 다음 모델로 재시도) */
async function editImage(photoUri, prompt, size, quality, apiKey, timeoutMs = IMAGE_TIMEOUT_MS) {
  if (!apiKey) throw new AnalysisError('ChatGPT API 키가 없습니다.');
  let lastError = null;

  for (const model of IMAGE_MODELS) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', quality);
    form.append('n', '1');
    form.append('image', { uri: photoUri, name: 'photo.jpg', type: 'image/jpeg' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(IMAGE_EDIT_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        body: form,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw new AnalysisError('이미지 생성 시간이 너무 오래 걸립니다. 다시 시도하세요.');
      throw new AnalysisError('네트워크 연결 실패: 인터넷 연결을 확인하세요.');
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      // 아래에서 상태 코드로 처리
    }
    if (res.ok) {
      const b64 = data?.data?.[0]?.b64_json;
      if (b64) return { base64: b64, model };
      throw new AnalysisError('이미지 생성 응답이 비어 있습니다. 다시 시도하세요.');
    }

    const err = data?.error || {};
    const text = `${err.code || ''} ${err.type || ''} ${err.message || ''}`.toLowerCase();
    if (res.status === 401) throw new AnalysisError('API 키가 올바르지 않습니다.');
    if (res.status === 429 && text.includes('quota'))
      throw new AnalysisError('ChatGPT API 잔액/한도가 부족합니다. platform.openai.com → Billing을 확인하세요.');
    if (text.includes('verif'))
      throw new AnalysisError(
        '이미지 생성 모델은 OpenAI 조직 인증이 필요합니다. platform.openai.com → Settings → Organization → General에서 Verify를 진행하세요.',
      );
    if (text.includes('safety') || text.includes('moderation'))
      throw new AnalysisError('AI가 이 사진의 이미지 생성을 거절했습니다.');
    // 모델 이름 문제면 다음 모델로 재시도
    if (res.status === 404 || (res.status === 400 && text.includes('model'))) {
      lastError = new AnalysisError(`이미지 모델을 사용할 수 없습니다 (${err.message || res.status})`);
      continue;
    }
    throw new AnalysisError(`이미지 생성 오류 (${res.status}): ${err.message || '알 수 없는 오류'}`);
  }
  throw lastError || new AnalysisError('사용 가능한 이미지 생성 모델이 없습니다.');
}
