// 책상정리 개선 — AI 분석 JSON 스키마와 지시문.
// 1차 범위: '구입 포함 정리안' (예산 안에서 정리용품을 추천하고, 물품을 놓은 정리 후 이미지를 그린다).

export const BUDGETS = [30000, 50000, 100000];
export const DEFAULT_BUDGET = 50000;

export const PRIORITIES = ['필수', '추천', '선택'];

const POS = {
  x: { type: 'number', description: '사진 전체 기준 가로 위치 (0=왼쪽, 1=오른쪽)' },
  y: { type: 'number', description: '사진 전체 기준 세로 위치 (0=위, 1=아래)' },
};

export const DESK_SCHEMA = {
  type: 'object',
  properties: {
    photo_usable: { type: 'boolean', description: '책상·작업 공간이 보이고 판독 가능한 사진이면 true' },
    photo_issue: { type: 'string', description: '판독이 어려운 이유. 문제없으면 빈 문자열' },
    scene_summary: { type: 'string', description: '사진 속 책상 환경 한 줄 요약 (40자 이내)' },
    clutter_level: {
      type: 'string',
      enum: ['많이 어수선', '조금 어수선', '비교적 정돈'],
      description: '현재 정리 상태',
    },
    keep_structure: {
      type: 'array',
      description: '정리 후에도 위치·모양을 그대로 유지할 고정 구조 (책상 형태, 창문, 파티션, 모니터, 의자 등). 한국어 짧은 명사, 최대 8개',
      items: { type: 'string' },
    },
    issues: {
      type: 'array',
      description: '사진에서 보이는 정리가 필요한 지점 (최대 5개, 중요한 순서)',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '짧은 제목 (14자 이내)' },
          detail: { type: 'string', description: '보이는 근거와 문제 (40자 이내)' },
          ...POS,
        },
        required: ['label', 'detail', 'x', 'y'],
        additionalProperties: false,
      },
    },
    purchases: {
      type: 'array',
      description: '예산 안에서 구입을 추천하는 정리용품 (3~6개, 효과 큰 순서). 특정 브랜드·상품명은 쓰지 않는다',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '일반 품목명 (12자 이내). 예: 모니터 받침대' },
          name_en: { type: 'string', description: '이미지 AI용 영어 품목명과 색·재질 (예: light oak wooden monitor riser)' },
          role: { type: 'string', description: '이 사진에서 해결하는 문제 (30자 이내)' },
          placement: { type: 'string', description: '놓을 위치 (25자 이내). 예: 모니터 아래, 책상 오른쪽 끝' },
          size_hint: { type: 'string', description: '구입 전 확인할 치수·조건 (30자 이내). 예: 가로 55cm 이하' },
          price_min: { type: 'integer', description: '한국 온라인 일반 가격대 하한 (원)' },
          price_max: { type: 'integer', description: '가격대 상한 (원)' },
          priority: { type: 'string', enum: PRIORITIES },
          search_keyword: { type: 'string', description: '쇼핑몰 검색어 (한국어, 15자 이내)' },
          ...POS,
        },
        required: [
          'name', 'name_en', 'role', 'placement', 'size_hint', 'price_min', 'price_max',
          'priority', 'search_keyword', 'x', 'y',
        ],
        additionalProperties: false,
      },
    },
    steps: {
      type: 'array',
      description: '정리 순서 (4~6단계). 비우기 → 분류 → 물품 설치 → 배치 → 유지 순',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '핵심 행동 (16자 이내)' },
          detail: { type: 'string', description: '구체적 방법 (45자 이내)' },
        },
        required: ['title', 'detail'],
        additionalProperties: false,
      },
    },
    after_scene_en: {
      type: 'string',
      description:
        'Image-editing instruction in English (max 90 words): how the same desk looks after tidying, ' +
        'where existing items move, and exactly where each purchased product is placed in the photo.',
    },
    cautions: {
      type: 'array',
      description: '구입·설치 전에 직접 확인할 것 (최대 3개, 각 30자 이내). 없으면 빈 배열',
      items: { type: 'string' },
    },
  },
  required: [
    'photo_usable', 'photo_issue', 'scene_summary', 'clutter_level', 'keep_structure',
    'issues', 'purchases', 'steps', 'after_scene_en', 'cautions',
  ],
  additionalProperties: false,
};

export const DESK_SYSTEM_PROMPT = `당신은 사무 공간 정리 디자이너입니다. 사용자가 찍은 책상 사진을 보고,
정해진 예산 안에서 정리용품을 구입해 책상을 깔끔하고 일하기 좋게 바꾸는 계획을 한국어로 만듭니다.

원칙
1. 사진에 실제로 보이는 물건과 구조만 근거로 씁니다. 보이지 않는 서랍 속 등은 추정하지 않습니다.
2. 책상·창문·벽·파티션·모니터·의자 등 고정 구조는 옮기거나 바꾸지 않는 것을 전제로 합니다.
3. 구입 물품은 이 사진의 문제를 직접 해결하는 것만 추천합니다. 이미 있는 물건으로 해결되면 추천하지 않습니다.
4. 특정 브랜드·상품명·판매처는 쓰지 않고 일반 품목명으로 씁니다.
5. 가격은 한국 온라인 쇼핑 기준의 흔한 가격대로 적습니다 (확정 가격 아님).
6. 추천 물품의 price_min 합계가 예산을 넘지 않게 고르고, 꼭 필요한 것을 '필수'로 둡니다.
7. 크기가 맞아야 하는 물품은 사진으로 보아 필요한 대략적 치수 조건을 size_hint에 씁니다.
8. 전선 정리 시 멀티탭을 밀폐하거나 덮지 않도록 하고, 조명은 콘센트 위치와 눈부심을 고려합니다.
9. 사진이 너무 어둡거나 책상이 보이지 않으면 photo_usable을 false로 하고 이유를 씁니다.

좌표
- issues와 purchases의 x, y는 사진 전체 기준 0~1 비율 (왼쪽 위 0,0 / 오른쪽 아래 1,1).
- purchases의 좌표는 그 물품을 놓을 자리입니다.

after_scene_en
- 이미지 편집 AI에게 줄 영어 지시문입니다. 같은 사진·같은 시점에서 무엇을 치우고 어디로 옮기며,
  각 구입 물품을 사진의 어느 위치에 놓는지 구체적으로 씁니다.

각 필드의 글자 수 제한을 지키고 짧고 명확하게 씁니다.
`;

export function deskUserPrompt(budget) {
  const won = String(budget).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `구입 예산은 ${won}원 이하입니다. 이 책상 사진을 원칙에 따라 분석하고, 예산 안의 구입 포함 정리안을 만들어 주세요.`;
}
