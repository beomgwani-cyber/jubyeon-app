// 책상정리 AI 응답을 화면에 쓰기 좋게 정리한다 (글자 정리, 좌표 보정, 우선순위 정렬, 예산 합계).

import { PRIORITIES } from './schema.js';

const MAX_ISSUES = 5;
const MAX_PURCHASES = 6;
const MAX_STEPS = 6;

export const DESK_DISCLAIMER =
  'AI가 제안한 정리안입니다. 추천 물품은 일반 품목이며 특정 상품이 아니고, 가격은 대략적인 범위입니다. ' +
  '정리 후 이미지는 AI가 그린 예시라 실제 크기·배치와 다를 수 있으니 구입 전에 책상 치수를 직접 재 보세요.';

const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i]));

const text = (v) => String(v ?? '').trim();

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function won(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 12000 → '1.2만원', 9000 → '9,000원' */
export function formatWon(n) {
  if (n >= 10000) {
    const man = Math.round(n / 1000) / 10;
    return `${String(man).replace(/\.0$/, '')}만원`;
  }
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

export function formatRange(min, max) {
  if (!min && !max) return '가격 확인 필요';
  if (min === max || !max) return `약 ${formatWon(min)}`;
  return `${formatWon(min)} ~ ${formatWon(max)}`;
}

export function normalizeDesk(raw, budget) {
  const r = {
    photo_usable: Boolean(raw?.photo_usable),
    photo_issue: text(raw?.photo_issue),
    scene_summary: text(raw?.scene_summary),
    clutter_level: text(raw?.clutter_level) || '조금 어수선',
    keep_structure: (raw?.keep_structure || []).map(text).filter(Boolean).slice(0, 8),
    after_scene_en: text(raw?.after_scene_en),
    cautions: (raw?.cautions || []).map(text).filter(Boolean).slice(0, 3),
    budget,
  };

  r.issues = (raw?.issues || [])
    .filter((o) => o?.label)
    .slice(0, MAX_ISSUES)
    .map((o, i) => ({ no: i + 1, label: text(o.label), detail: text(o.detail), x: clamp01(o.x), y: clamp01(o.y) }));

  let items = (raw?.purchases || [])
    .filter((p) => p?.name)
    .map((p) => {
      let min = won(p.price_min);
      let max = won(p.price_max);
      if (max && min > max) [min, max] = [max, min];
      if (!max) max = min;
      return {
        name: text(p.name),
        name_en: text(p.name_en) || text(p.name),
        role: text(p.role),
        placement: text(p.placement),
        size_hint: text(p.size_hint),
        price_min: min,
        price_max: max,
        priority: PRIORITIES.includes(p.priority) ? p.priority : '추천',
        search_keyword: text(p.search_keyword) || text(p.name),
        x: clamp01(p.x),
        y: clamp01(p.y),
      };
    });
  // 필수 → 추천 → 선택 (안정 정렬이라 같은 등급 안에서는 AI가 정한 순서 유지)
  items.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  items = items.slice(0, MAX_PURCHASES).map((p, i) => ({ ...p, no: i + 1 }));
  r.purchases = items;

  r.total_min = items.reduce((s, p) => s + p.price_min, 0);
  r.total_max = items.reduce((s, p) => s + p.price_max, 0);
  r.over_budget = r.total_min > budget;
  r.may_exceed = !r.over_budget && r.total_max > budget;

  r.steps = (raw?.steps || [])
    .filter((s) => s?.title)
    .slice(0, MAX_STEPS)
    .map((s) => ({ title: text(s.title), detail: text(s.detail) }));

  r.disclaimer = DESK_DISCLAIMER;
  return r;
}
