// 맞춤 안경 추천 — AI 분석 JSON 스키마와 지시문.
// 기준 문서: 안경_추천_대화기록.pdf (얼굴형 분석 → 상위 3개 디자인 추천과 이유 → 시력교정용·합리적 가격대 →
// 본인 얼굴에 착용한 모습 3종 비교 → 구매 시 확인 사항·안경원에서 요청할 문장).

export const PURPOSES = ['시력교정용', '패션·멋내기용', '선글라스'];
export const DEFAULT_PURPOSE = '시력교정용';

// 안경테 가격 상한 (렌즈 제외). 대화기록에서 28만~32만원대는 '너무 비싸다'고 해서 기본값을 낮게 둔다.
export const BUDGETS = [50000, 100000, 200000];
export const DEFAULT_BUDGET = 100000;

export const MOODS = ['단정·지적', '부드러운·편안한', '개성 있는'];
export const DEFAULT_MOOD = '단정·지적';

export const FACE_SHAPES = ['타원형', '둥근형', '각진형', '긴형', '하트형', '다이아몬드형'];
export const FRAME_TYPES = ['메탈', '뿔테', '하금테', '반무테', '무테', '콤비'];

export const GLASSES_SCHEMA = {
  type: 'object',
  properties: {
    photo_usable: { type: 'boolean', description: '얼굴 정면이 보이고 판독 가능한 사진이면 true' },
    photo_issue: { type: 'string', description: '판독이 어려운 이유. 문제없으면 빈 문자열' },
    photo_caution: {
      type: 'string',
      description: '판독은 되지만 결과에 영향을 줄 수 있는 촬영 조건 (예: 누운 자세·근접 촬영으로 원근 왜곡). 없으면 빈 문자열, 50자 이내',
    },
    face_shape: { type: 'string', enum: FACE_SHAPES, description: '가장 가까운 얼굴형' },
    face_shape_sub: {
      type: 'string',
      enum: ['없음', ...FACE_SHAPES],
      description: '섞여 보이는 두 번째 얼굴형. 없으면 "없음"',
    },
    face_summary: { type: 'string', description: '얼굴 윤곽 한 줄 요약 (40자 이내). 예: 타원형과 둥근형이 섞인 부드러운 윤곽' },
    features: {
      type: 'array',
      description: '안경 선택에 영향을 주는 얼굴 특징 4~5개 (이마, 광대·볼, 턱선, 가로세로 비율, 눈썹·눈 사이 등)',
      items: {
        type: 'object',
        properties: {
          part: { type: 'string', description: '부위 (8자 이내). 예: 이마, 턱선' },
          observation: { type: 'string', description: '사진에서 보이는 특징 (30자 이내)' },
        },
        required: ['part', 'observation'],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: 'array',
      description: '추천 안경 디자인 정확히 3개 (1순위부터). 서로 다른 형태로 고른다. 특정 브랜드·모델명은 쓰지 않는다',
      items: {
        type: 'object',
        properties: {
          style: { type: 'string', description: '디자인 이름 (14자 이내). 예: 얇은 사각 메탈테' },
          frame_type: { type: 'string', enum: FRAME_TYPES },
          colors: { type: 'string', description: '추천 색상 (16자 이내). 예: 건메탈·다크그레이' },
          impression: { type: 'string', description: '주는 인상 (20자 이내). 예: 단정하고 지적인 느낌' },
          reason: { type: 'string', description: '이 얼굴에 어울리는 이유, 얼굴 특징과 연결해서 (60자 이내)' },
          fit_tip: { type: 'string', description: '고를 때 볼 치수·형태 조건 (40자 이내). 예: 렌즈 가로 52mm 안팎, 테 폭이 광대보다 약간 좁게' },
          price_min: { type: 'integer', description: '한국 안경원·온라인의 흔한 안경테 가격 하한 (원, 렌즈 제외)' },
          price_max: { type: 'integer', description: '안경테 가격 상한 (원, 렌즈 제외)' },
          search_keyword: { type: 'string', description: '쇼핑몰 검색어 (한국어, 15자 이내). 예: 사각 메탈 안경테 건메탈' },
          image_prompt_en: {
            type: 'string',
            description: 'Image AI description of exactly these glasses in English (max 30 words): shape, rim thickness, material, color, bridge, nose pads.',
          },
        },
        required: [
          'style', 'frame_type', 'colors', 'impression', 'reason', 'fit_tip',
          'price_min', 'price_max', 'search_keyword', 'image_prompt_en',
        ],
        additionalProperties: false,
      },
    },
    avoid: {
      type: 'array',
      description: '이 얼굴에는 피하는 것이 좋은 디자인 (최대 2개)',
      items: {
        type: 'object',
        properties: {
          style: { type: 'string', description: '디자인 (14자 이내)' },
          reason: { type: 'string', description: '이유 (35자 이내)' },
        },
        required: ['style', 'reason'],
        additionalProperties: false,
      },
    },
    shop_request: {
      type: 'string',
      description: '안경원에서 그대로 말하면 되는 요청 문장 (100자 이내, 존댓말, 1·2순위 형태와 색상 포함)',
    },
  },
  required: [
    'photo_usable', 'photo_issue', 'photo_caution', 'face_shape', 'face_shape_sub', 'face_summary',
    'features', 'recommendations', 'avoid', 'shop_request',
  ],
  additionalProperties: false,
};

export const GLASSES_SYSTEM_PROMPT = `당신은 경력 많은 안경사이자 스타일리스트입니다. 사용자가 보낸 얼굴 사진을 보고
얼굴형과 비율에 어울리는 안경테 디자인을 한국어로 추천합니다.

원칙
1. 사진에 보이는 윤곽(이마 폭, 광대·볼, 턱선, 얼굴 가로세로 비율, 눈썹 위치)만 근거로 씁니다.
   나이·성별·인종·외모 평가(잘생김, 살찜 등)는 쓰지 않습니다.
2. 얼굴형은 가장 가까운 것 하나를 고르고, 섞여 보이면 face_shape_sub에 적습니다.
3. 일반 원칙: 둥근·부드러운 윤곽에는 직선이 있는 사각 계열, 각진 윤곽에는 둥근·보스턴 계열,
   긴 얼굴에는 세로가 깊은 테, 하트형에는 아래가 가볍거나 하금테가 아닌 형태를 우선 검토합니다.
   다만 사용자가 원하는 분위기와 용도를 함께 반영합니다.
4. 추천은 정확히 3개이며 서로 형태가 달라야 합니다 (예: 메탈 / 뿔테 / 하금테).
5. 특정 브랜드·모델명·판매처는 쓰지 않습니다. 가격은 한국 안경원·온라인의 흔한 안경테 가격대이며 렌즈 값은 제외합니다.
6. 사용자가 정한 안경테 예산 상한을 넘지 않는 가격대로 적습니다.
7. 시력교정용이면 렌즈가 들어가기 좋은 형태(렌즈 세로 깊이, 코받침 조절 가능 여부)를 fit_tip에 반영합니다.
   선글라스면 렌즈 크기와 자외선 차단을 고려합니다.
8. 사진만으로 실제 얼굴 치수(mm)는 알 수 없으므로 fit_tip은 "~안팎", "~보다 약간 좁게"처럼 상대적으로 씁니다.
9. 누운 자세·근접 촬영·기울어진 얼굴 등으로 왜곡이 있으면 photo_caution에 씁니다.
10. 얼굴이 가려졌거나 너무 어둡거나 정면이 아니어서 판단이 어려우면 photo_usable을 false로 하고 이유를 씁니다.

각 필드의 글자 수 제한을 지키고 짧고 명확하게 씁니다.
`;

function won(n) {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

export function glassesUserPrompt({ purpose, budget, mood }) {
  return [
    `용도: ${purpose}`,
    `안경테 예산: ${won(budget)} 이하 (렌즈 제외)`,
    `원하는 분위기: ${mood}`,
    '이 얼굴 사진을 원칙에 따라 분석하고, 어울리는 안경 디자인 3개를 추천해 주세요.',
  ].join('\n');
}
