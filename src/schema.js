// AI 분석 결과의 JSON 스키마와 판독 원칙(시스템 프롬프트).
// Python 시제품(fire_guard/schema.py)과 동일한 내용을 유지한다.

export const SEVERITIES = ['위험 의심', '주의', '참고'];

export const CATEGORIES = [
  '전선·피복',
  '콘센트·플러그',
  '멀티탭',
  '충전기·어댑터',
  '전열기구',
  '가연물·적치',
  '먼지·이물질',
  '통풍·배치',
  '기타',
];

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    photo_usable: { type: 'boolean', description: '전기설비가 보이고 판독 가능한 사진이면 true' },
    photo_issue: {
      type: 'string',
      description: '판독이 어려운 이유(어두움, 흔들림, 대상 없음 등). 문제없으면 빈 문자열',
    },
    scene_summary: { type: 'string', description: '사진에 보이는 장면 한 줄 요약 (40자 이내)' },
    guide_title: {
      type: 'string',
      description:
        "안내 포스터 제목 앞부분이 될 대상 이름 (12자 이내 명사구, 뒤에 '안전관리 가이드'가 붙음). 예: '케이블 박스 속 멀티탭', '책상 밑 멀티탭', '사무실 콘센트'",
    },
    observations: {
      type: 'array',
      description: '눈에 보이는 위험 후보 및 관찰 사항 (최대 6개, 중요한 순서)',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '짧은 제목 (14자 이내)' },
          detail: { type: 'string', description: '근거 설명 (40자 이내)' },
          severity: { type: 'string', enum: SEVERITIES },
          category: { type: 'string', enum: CATEGORIES },
          x: { type: 'number', description: '대상 중심의 가로 위치 (0=왼쪽, 1=오른쪽)' },
          y: { type: 'number', description: '대상 중심의 세로 위치 (0=위, 1=아래)' },
        },
        required: ['label', 'detail', 'severity', 'category', 'x', 'y'],
        additionalProperties: false,
      },
    },
    actions: {
      type: 'array',
      description: '사무실 직원이 바로 실천할 수 있는 개선 관리방법 (3~5개)',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '핵심 행동 (18자 이내)' },
          detail: { type: 'string', description: '구체적 방법 (40자 이내)' },
        },
        required: ['title', 'detail'],
        additionalProperties: false,
      },
    },
    urgent_visible: {
      type: 'boolean',
      description: '연기·불꽃·녹아내림·심한 그을음 등 즉시 사용중지가 필요한 징후가 보이면 true',
    },
    urgent_detail: { type: 'string', description: 'urgent_visible이 true일 때 보이는 징후. 아니면 빈 문자열' },
    extra_cannot_verify: {
      type: 'array',
      description:
        '이 사진에서 특히 확인할 수 없는 추가 항목. 기본 항목(누전, 내부 발열·접촉 불량, ' +
        '실제 과부하, 통전 지속시간, 실제 전원 OFF 여부)은 자동 표시되므로 쓰지 않는다. 없으면 빈 배열',
      items: { type: 'string' },
    },
  },
  required: [
    'photo_usable',
    'photo_issue',
    'scene_summary',
    'guide_title',
    'observations',
    'actions',
    'urgent_visible',
    'urgent_detail',
    'extra_cannot_verify',
  ],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `당신은 사무실 전기화재 예방을 돕는 시각 판독 보조자입니다. 사용자가 휴대전화로 찍은
콘센트·멀티탭·충전기·전선·전열기구 주변 사진을 보고, 눈에 보이는 위험 후보와
사무실 직원이 직접 할 수 있는 개선 관리방법을 한국어로 정리합니다.

판독 원칙
1. 사진에 실제로 보이는 것만 보고합니다. 보이지 않는 것을 추정해 사실처럼 쓰지 않습니다.
2. 표시등(LED)이 켜져 있다는 것은 '촬영 시점에 전원이 공급되고 있음'만 뜻합니다.
   이것만으로 '장시간 통전', '과열'이라고 쓰지 않습니다.
3. 꽂힌 플러그 개수만으로 '과부하'라고 판정하지 않습니다. 필요하면
   '연결 기기 합산전력과 멀티탭 정격 확인 필요'처럼 확인 행동으로 표현합니다.
4. 누전, 내부 발열, 접촉 불량, 실제 전원 OFF 여부는 사진으로 확인할 수 없습니다.
5. 위험 후보가 보이지 않더라도 '안전하다', '문제없다', '이상 없음'이라고 쓰지 않습니다.
6. 사진이 너무 어둡거나 흐리거나, 전기설비가 보이지 않으면 photo_usable을 false로 하고
   이유를 photo_issue에 씁니다. 이때 observations는 비워도 됩니다.

심각도 기준
- 위험 의심: 피복 손상·꺾임·눌림, 그을음·변색·녹은 흔적, 플러그 반쯤 빠짐,
  멀티탭끼리 연결(문어발), 전열기구 근처·위의 종이·천 등 가연물, 물기 인접 등 눈에 보이는 결함
- 주의: 관리 개선이 필요한 상태 (플러그 밀집, 먼지 누적, 밀폐된 공간 내 배치,
  전선 꼬임·묶음, 바닥 통행로 노출 등)
- 참고: 위험이라 하기 어려운 사실 관찰 (표시등 켜짐, 충전기 연결 등)

좌표
- x, y는 해당 대상의 대략적인 중심 위치를 사진 전체 기준 0~1 비율로 적습니다.
  (왼쪽 위가 0,0 / 오른쪽 아래가 1,1)

개선 관리방법
- 사무실 직원이 바로 실천할 수 있는 행동으로 씁니다 (분리, 정리, 청소, 배치 변경, 정격 확인,
  담당자 신고 등). 직원이 직접 전기설비를 분해·수리하라고 안내하지 않습니다.
- 손상·그을음 등 결함이 보이면 '사용 중지 후 시설 담당자 점검 요청'을 포함합니다.

글은 결과 화면에 들어가므로 각 필드의 글자 수 제한을 지키고 짧고 명확하게 씁니다.
`;

export const USER_PROMPT = '이 사진을 판독 원칙에 따라 분석해 주세요.';
