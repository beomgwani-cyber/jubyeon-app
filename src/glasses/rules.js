// 맞춤 안경 추천 AI 응답을 화면에 쓰기 좋게 정리한다 (글자 정리, 추천 3개 고정, 가격·예산 보정).

import { formatRange, formatWon } from '../desk/rules.js';
import { FACE_SHAPES, FRAME_TYPES } from './schema.js';

export { formatRange, formatWon };

export const MAX_RECS = 3;

export const GLASSES_DISCLAIMER =
  'AI가 사진의 윤곽만 보고 제안한 디자인입니다. 착용 이미지는 AI가 그린 예시라 실제 안경테의 크기·색·착용감과 다르며, ' +
  '시력교정 효과를 보여 주지 않습니다. 가격은 흔한 안경테 가격대(렌즈 제외)로 확정 가격이 아닙니다.';

// 대화기록 '실제 구매 시 확인 사항'을 그대로 옮긴 고정 안내 (AI 응답과 무관하게 항상 표시)
export const BUY_CHECKS = {
  시력교정용: [
    '최근 검안 결과나 안경 처방전으로 렌즈 도수와 종류를 정합니다.',
    '안경테 + 렌즈 총비용을 확인하세요. 누진다초점·고도수·압축 렌즈는 값이 더 듭니다.',
    '코받침·귀 뒤 피팅과 렌즈 중심이 눈동자에 맞는지 안경원에서 점검받으세요.',
  ],
  '패션·멋내기용': [
    '도수 없는 렌즈도 테 폭이 얼굴보다 너무 넓거나 좁지 않은지 써 보고 고르세요.',
    '코받침이 미끄러지지 않는지, 안경다리가 귀 뒤를 누르지 않는지 확인하세요.',
    '나중에 도수를 넣을 수 있는 테인지 안경원에 물어보세요.',
  ],
  선글라스: [
    '자외선 차단(UV400) 표시를 확인하세요. 색이 진하다고 차단이 되는 것은 아닙니다.',
    '운전용이면 너무 진한 색(가시광선 투과율 낮음)은 피하세요.',
    '도수가 필요하면 도수 선글라스 제작이 가능한 테인지 안경원에 확인하세요.',
  ],
};

const text = (v) => String(v ?? '').trim();

function won(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeGlasses(raw, prefs = {}) {
  const budget = won(prefs.budget) || 100000;
  const sub = text(raw?.face_shape_sub);
  const shape = FACE_SHAPES.includes(raw?.face_shape) ? raw.face_shape : '타원형';

  const r = {
    photo_usable: Boolean(raw?.photo_usable),
    photo_issue: text(raw?.photo_issue),
    photo_caution: text(raw?.photo_caution),
    face_shape: shape,
    face_shape_sub: FACE_SHAPES.includes(sub) && sub !== shape ? sub : '',
    face_summary: text(raw?.face_summary),
    shop_request: text(raw?.shop_request),
    purpose: text(prefs.purpose) || '시력교정용',
    mood: text(prefs.mood),
    budget,
  };

  r.features = (raw?.features || [])
    .filter((f) => f?.part && f?.observation)
    .slice(0, 5)
    .map((f) => ({ part: text(f.part), observation: text(f.observation) }));

  r.recommendations = (raw?.recommendations || [])
    .filter((x) => x?.style)
    .slice(0, MAX_RECS)
    .map((x, i) => {
      let min = won(x.price_min);
      let max = won(x.price_max);
      if (max && min > max) [min, max] = [max, min];
      if (!max) max = min;
      // AI가 예산 상한을 넘겨 적으면 상한으로 자르고 표시한다
      const over = min > budget;
      if (max > budget) max = Math.max(budget, min);
      return {
        no: i + 1,
        style: text(x.style),
        frame_type: FRAME_TYPES.includes(x.frame_type) ? x.frame_type : '메탈',
        colors: text(x.colors),
        impression: text(x.impression),
        reason: text(x.reason),
        fit_tip: text(x.fit_tip),
        price_min: min,
        price_max: max,
        over_budget: over,
        search_keyword: text(x.search_keyword) || text(x.style),
        image_prompt_en: text(x.image_prompt_en) || text(x.style),
      };
    });

  r.avoid = (raw?.avoid || [])
    .filter((a) => a?.style)
    .slice(0, 2)
    .map((a) => ({ style: text(a.style), reason: text(a.reason) }));

  r.buy_checks = BUY_CHECKS[r.purpose] || BUY_CHECKS['시력교정용'];
  r.disclaimer = GLASSES_DISCLAIMER;
  return r;
}

/** 얼굴형 표시: '타원형 + 둥근형' */
export function faceShapeLabel(r) {
  return r.face_shape_sub ? `${r.face_shape} + ${r.face_shape_sub}` : r.face_shape;
}
