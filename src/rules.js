// AI 응답을 받은 뒤 적용하는 코드 안전 규칙 (Python fire_guard/rules.py와 동일).
// - 종합 판정은 코드가 계산한다. '안전' 판정은 존재하지 않는다.
// - 사진으로 확인할 수 없는 기본 항목, 긴급 안내, 면책 문구는 항상 표시된다.

import { CATEGORIES, SEVERITIES } from './schema.js';

export const LEVEL_UNUSABLE = '판정 불가';
export const LEVEL_DANGER = '위험 의심';
export const LEVEL_CAUTION = '주의';
export const LEVEL_NONE_SEEN = '사진상 이상 미발견';

export const LEVEL_MESSAGES = {
  [LEVEL_UNUSABLE]: '사진을 다시 촬영해 주세요',
  [LEVEL_DANGER]: '사용을 멈추고 직접 확인하세요',
  [LEVEL_CAUTION]: '관리 개선이 필요합니다',
  [LEVEL_NONE_SEEN]: '안전 확인이 아닙니다 · 직접 점검 병행',
};

export const STANDARD_CANNOT_VERIFY = [
  '누전',
  '내부 발열·접촉 불량',
  '실제 과부하(정격 초과)',
  '통전 지속시간',
  '실제 전원 OFF 여부',
];

export const EMERGENCY_NOTICE =
  '타는 냄새·연기·불꽃·스파크·비정상 발열이 있으면 앱 진단보다 ' +
  '대피, 119 신고, 시설 안전관리자 통보가 우선입니다.';

export const DISCLAIMER =
  'AI 보조 판독 결과입니다. 사진상 이상 미발견은 안전 확인이 아니며, ' +
  '전문 전기안전점검을 대신하지 않습니다. 번호 위치는 근사치입니다.';

const MAX_OBSERVATIONS = 6;
const MAX_ACTIONS = 5;

// '안전' 단정 표현을 중립 표현으로 바꾼다 (긴 표현 먼저).
const FORBIDDEN_REPLACEMENTS = [
  [/안전합니다/g, '사진상 위험 단서가 보이지 않습니다'],
  [/안전함/g, '사진상 위험 단서 없음'],
  [/이상\s*없음/g, '사진상 이상 미발견'],
  [/문제\s*없(음|습니다)/g, '사진상 이상 미발견'],
];

const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])); // 위험 의심 = 0

function cleanText(text) {
  let t = String(text ?? '').trim();
  for (const [pattern, repl] of FORBIDDEN_REPLACEMENTS) t = t.replace(pattern, repl);
  return t;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function computeLevel(r) {
  if (!r.photo_usable) return LEVEL_UNUSABLE;
  if (r.urgent_visible) return LEVEL_DANGER;
  const sev = new Set((r.observations || []).map((o) => o.severity));
  if (sev.has(LEVEL_DANGER)) return LEVEL_DANGER;
  if (sev.has(LEVEL_CAUTION)) return LEVEL_CAUTION;
  return LEVEL_NONE_SEEN;
}

export function normalize(raw) {
  const r = {
    photo_usable: Boolean(raw?.photo_usable),
    photo_issue: cleanText(raw?.photo_issue),
    scene_summary: cleanText(raw?.scene_summary),
    guide_title: cleanText(raw?.guide_title).replace(/\s*안전\s*관리\s*가이드$/, '').slice(0, 20),
    urgent_visible: Boolean(raw?.urgent_visible),
    urgent_detail: cleanText(raw?.urgent_detail),
  };

  let obs = (raw?.observations || []).map((o) => ({
    label: cleanText(o?.label),
    detail: cleanText(o?.detail),
    severity: SEVERITIES.includes(o?.severity) ? o.severity : '참고',
    category: CATEGORIES.includes(o?.category) ? o.category : '기타',
    x: clamp01(o?.x),
    y: clamp01(o?.y),
  }));
  // 심각도 높은 순 (Array.prototype.sort는 안정 정렬) → 최대 6개 → 번호 부여
  obs.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  obs = obs.slice(0, MAX_OBSERVATIONS).map((o, i) => ({ ...o, no: i + 1 }));
  r.observations = obs;

  let actions = (raw?.actions || [])
    .filter((a) => a?.title)
    .map((a) => ({ title: cleanText(a.title), detail: cleanText(a.detail) }))
    .slice(0, MAX_ACTIONS);
  if (r.urgent_visible || obs.some((o) => o.severity === LEVEL_DANGER)) {
    if (!actions.some((a) => (a.title + a.detail).includes('담당자'))) {
      actions = [
        { title: '사용 중지 후 점검 요청', detail: '해당 기기 사용을 멈추고 시설 담당자에게 점검을 요청하세요.' },
        ...actions,
      ].slice(0, MAX_ACTIONS);
    }
  }
  r.actions = actions;

  const cannot = [...STANDARD_CANNOT_VERIFY];
  for (const item of raw?.extra_cannot_verify || []) {
    const t = cleanText(item);
    const key = t.replace(/\s*여부$/, '').trim();
    // '누전 여부'처럼 기본 항목과 같은 내용이면 중복으로 보고 넣지 않는다
    if (key && !cannot.some((c) => c.includes(key) || key.includes(c))) cannot.push(t);
  }
  r.cannot_verify = cannot;

  r.level = computeLevel(r);
  r.level_message = LEVEL_MESSAGES[r.level];
  r.emergency_notice = EMERGENCY_NOTICE;
  r.disclaimer = DISCLAIMER;
  return r;
}

// 번호 표시가 서로 겹치면 가까운 빈 자리로 살짝 옮긴다 (사진 밖으로는 안 나감).
export function markerPositions(observations, w, h, r) {
  const minD = 2 * r + 6;
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0]];
  const placed = [];
  for (const o of observations) {
    const bx = o.x * w;
    const by = o.y * h;
    let best = [bx, by];
    for (const [dx, dy] of dirs) {
      const cx = Math.min(Math.max(bx + dx * minD, r + 2), w - r - 2);
      const cy = Math.min(Math.max(by + dy * minD, r + 2), h - r - 2);
      if (placed.every(([qx, qy]) => (cx - qx) ** 2 + (cy - qy) ** 2 >= minD ** 2)) {
        best = [cx, cy];
        break;
      }
    }
    placed.push(best);
  }
  return placed;
}
