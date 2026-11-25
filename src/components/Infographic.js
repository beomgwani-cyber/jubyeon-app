// 공유용 인포그래픽 — 가로형 한 장 이미지 (안전관리 가이드 포스터 형식).
// 고정 폭 CANVAS_W 기준으로 그리고, 화면에서는 ScaledBox로 축소해 미리보기만 한다.
// 공유 시에는 이 View를 그대로 캡처하므로 축소되지 않은 원본 해상도로 저장된다.

import { forwardRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { LEVEL_UNUSABLE } from '../rules.js';
import { C, LEVEL_COLORS, SEVERITY_COLORS, SEVERITY_TINTS } from '../theme.js';

export const CANVAS_W = 1080;
const PAD = 26;
const GAP = 18;
const COL_W = (CANVAS_W - PAD * 2 - GAP) / 2;
const INNER = 14;
const PHOTO_W = COL_W - INNER * 2;

const LABEL_W = 156;
const LABEL_H = 58;
const LABEL_EDGE = 16;

// 관찰 항목 분류별 아이콘
export const CATEGORY_ICONS = {
  '전선·피복': 'cable-data',
  '콘센트·플러그': 'power-plug',
  멀티탭: 'power-socket-eu',
  '충전기·어댑터': 'battery-charging',
  전열기구: 'radiator',
  '가연물·적치': 'fire',
  '먼지·이물질': 'weather-dust',
  '통풍·배치': 'thermometer-alert',
  기타: 'alert-circle-outline',
};

// 관리방법 문구에 맞는 아이콘 (제목 우선, 없으면 설명에서 찾음)
const ACTION_ICON_RULES = [
  [/담당자|사용\s*중지|신고|점검\s*요청/, 'account-hard-hat'],
  [/통풍|환기|열\s*배출|뚜껑|밀폐/, 'weather-windy'],
  [/먼지|청소|닦/, 'broom'],
  [/정격|용량|합산|과부하|고용량/, 'flash-alert'],
  [/전선|케이블|꼬임|엉킴|선\s*정리/, 'cable-data'],
  [/가연|종이|천|치우|적치/, 'fire-off'],
  [/스마트|타이머|자동/, 'timer-outline'],
  [/분리|뽑|끄|차단|스위치|OFF/i, 'power'],
  [/물기|습기/, 'water-alert'],
];

export function actionIcon(a) {
  for (const text of [a.title, a.detail]) {
    for (const [re, name] of ACTION_ICON_RULES) if (re.test(text || '')) return name;
  }
  return 'check-circle-outline';
}

export const EMERGENCY_CHIPS = [
  ['scent', '타는 냄새'],
  ['smoke', '연기·스파크'],
  ['fire', '변색·그을음'],
  ['thermometer-high', '비정상 발열'],
];

function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 두 점을 잇는 직선 (회전한 얇은 View) */
function Line({ x1, y1, x2, y2, color, width = 2.5 }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return null;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <View
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - len / 2,
        top: (y1 + y2) / 2 - width / 2,
        width: len,
        height: width,
        backgroundColor: color,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

/**
 * 사진 크기를 정하고(세로로 너무 긴 사진은 가운데를 잘라냄),
 * 각 관찰 항목의 지점 좌표와 설명 상자 위치를 계산한다.
 */
function layoutPhoto(record) {
  const { photoWidth: pw, photoHeight: ph, result } = record;
  const boxW = PHOTO_W;
  const boxH = Math.min(Math.max(boxW * (ph / pw), boxW * 0.72), boxW * 1.28);
  const scale = Math.max(boxW / pw, boxH / ph);
  const dispW = pw * scale;
  const dispH = ph * scale;
  const offX = (boxW - dispW) / 2;
  const offY = (boxH - dispH) / 2;

  const points = result.observations.map((o) => ({
    o,
    px: Math.min(Math.max(offX + o.x * dispW, 10), boxW - 10),
    py: Math.min(Math.max(offY + o.y * dispH, 10), boxH - 10),
  }));

  // 지점이 가장자리에 가까우면 반대쪽에 설명 상자를 둬서 지점을 가리지 않게 한다
  const reach = LABEL_EDGE + LABEL_W + 24;
  for (const p of points) {
    if (p.px < reach) p.side = 'R';
    else if (p.px > boxW - reach) p.side = 'L';
    else p.side = p.px < boxW / 2 ? 'L' : 'R';
  }

  // 같은 쪽 상자끼리 겹치지 않도록 위에서부터 차례로 배치
  const minTop = 14;
  const maxTop = boxH - LABEL_H - 8;
  for (const side of ['L', 'R']) {
    const group = points.filter((p) => p.side === side).sort((a, b) => a.py - b.py);
    let prevBottom = -Infinity;
    for (const p of group) {
      p.top = Math.max(p.py - LABEL_H / 2, minTop, prevBottom + 12);
      prevBottom = p.top + LABEL_H;
    }
    // 아래로 넘치면 전체를 위로 당긴다
    const overflow = group.length ? group[group.length - 1].top - maxTop : 0;
    if (overflow > 0) {
      let nextTop = Infinity;
      for (let i = group.length - 1; i >= 0; i--) {
        group[i].top = Math.max(minTop, Math.min(group[i].top - overflow, nextTop - LABEL_H - 12));
        nextTop = group[i].top;
      }
    }
    for (const p of group) {
      p.left = side === 'L' ? LABEL_EDGE : boxW - LABEL_EDGE - LABEL_W;
      p.ax = side === 'L' ? p.left + LABEL_W : p.left; // 선이 시작하는 상자 쪽 끝
      p.ay = p.top + LABEL_H / 2;
    }
  }
  return { boxW, boxH, points };
}

function AnnotatedPhoto({ record }) {
  const { boxW, boxH, points } = layoutPhoto(record);
  return (
    <View style={{ width: boxW, height: boxH, borderRadius: 14, overflow: 'hidden', backgroundColor: '#DDE3EA' }}>
      <Image source={{ uri: record.photoUri }} style={{ width: boxW, height: boxH }} resizeMode="cover" />
      {points.map(({ o, px, py, ax, ay }) => (
        <Line key={`l${o.no}`} x1={ax} y1={ay} x2={px} y2={py} color={SEVERITY_COLORS[o.severity]} />
      ))}
      {points.map(({ o, px, py }) => (
        <View key={`d${o.no}`} style={[s.dotOuter, { left: px - 9, top: py - 9 }]}>
          <View style={[s.dotInner, { backgroundColor: SEVERITY_COLORS[o.severity] }]} />
        </View>
      ))}
      {points.map(({ o, left, top }) => (
        <View
          key={`b${o.no}`}
          style={[s.callout, { left, top, borderColor: SEVERITY_COLORS[o.severity] }]}
        >
          <Text style={s.calloutText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {o.label}
          </Text>
          <View style={[s.calloutNo, { backgroundColor: SEVERITY_COLORS[o.severity] }]}>
            <Text style={s.calloutNoText}>{o.no}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** AI가 그린 개선 예시 — 왼쪽 원본 사진과 같은 크기로 맞춘다. */
function ImprovedPhoto({ record }) {
  const { boxW, boxH } = layoutPhoto(record);
  const [failed, setFailed] = useState('');
  return (
    <View style={{ width: boxW, height: boxH, borderRadius: 14, overflow: 'hidden', backgroundColor: '#DDE3EA' }}>
      <Image
        key={record.improvedUri}
        source={{ uri: record.improvedUri }}
        style={{ width: boxW, height: boxH }}
        resizeMode="cover"
        onError={(e) => setFailed(String(e?.nativeEvent?.error || '알 수 없는 오류'))}
      />
      {!!failed && (
        <View style={s.imgFail}>
          <Icon name="image-broken-variant" size={40} color="#6B7280" />
          <Text style={s.imgFailText}>개선 예시 이미지를 표시하지 못했습니다{'\n'}{failed}</Text>
        </View>
      )}
      <View style={s.aiBadge}>
        <Icon name="creation" size={20} color="white" />
        <Text style={s.aiBadgeText}>AI가 그린 개선 예시 · 실제 사진 아님</Text>
      </View>
    </View>
  );
}

function Highlight({ text, bg, color }) {
  return (
    <View style={[s.hl, { backgroundColor: bg }]}>
      <Text style={[s.hlText, { color }]}>{text}</Text>
    </View>
  );
}

function ItemRow({ icon, iconColor, iconBg, no, sentence, highlight, hlBg, hlColor, tag }) {
  return (
    <View style={s.item}>
      <View style={[s.itemIcon, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={34} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.itemHead}>
          <Text style={s.itemText}>
            <Text style={s.itemNo}>{no}. </Text>
            {sentence}
          </Text>
          {tag}
        </View>
        {!!highlight && <Highlight text={highlight} bg={hlBg} color={hlColor} />}
      </View>
    </View>
  );
}

function PanelHeader({ title, color, right }) {
  return (
    <View style={[s.panelHead, { backgroundColor: color }]}>
      <Text style={s.panelHeadText}>{title}</Text>
      {right}
    </View>
  );
}

const Infographic = forwardRef(function Infographic({ record, onLayout }, ref) {
  const r = record.result;
  const levelColor = LEVEL_COLORS[r.level];
  const title = `${r.guide_title || '전기설비'} 안전관리 가이드`;
  const actions = r.actions.length
    ? r.actions
    : [{ title: '정기적으로 직접 점검', detail: '전선 손상·변색·먼지·주변 가연물을 눈으로 확인' }];

  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} style={s.canvas}>
      {/* 머리글 */}
      <View style={s.header}>
        <View style={s.logo}>
          <Icon name="shield" size={74} color={C.navy} />
          <View style={s.logoPlug}>
            <Icon name="power-plug" size={34} color="white" />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {title}
          </Text>
          <Text style={s.subtitle}>
            지금 사용 중인 전기설비 상태를 점검하고, 더 안전한 관리 방법을 실천하세요.
          </Text>
          <View style={s.titleRule} />
        </View>
      </View>

      {r.urgent_visible && (
        <View style={s.urgent}>
          <Icon name="alert-octagon" size={30} color="white" />
          <Text style={s.urgentText}>즉시 사용 중지 징후: {r.urgent_detail || '사진 확인 필요'}</Text>
        </View>
      )}

      <View style={s.columns}>
        {/* 현재 상태 진단 */}
        <View style={s.panel}>
          <PanelHeader
            title="현재 상태 진단"
            color={C.navy}
            right={
              <View style={[s.levelBadge, { backgroundColor: levelColor }]}>
                <Icon name="alert" size={22} color="white" />
                <Text style={s.levelBadgeText}>
                  {r.level === LEVEL_UNUSABLE ? r.level : `위험도: ${r.level}`}
                </Text>
              </View>
            }
          />
          <View style={s.panelBody}>
            <AnnotatedPhoto record={record} />
            <View style={{ height: 14 }} />
            {!r.photo_usable ? (
              <View style={s.note}>
                <Text style={s.noteTitle}>판독이 어렵습니다: {r.photo_issue || '사진 상태 확인 필요'}</Text>
                <Text style={s.noteText}>밝은 곳에서 대상이 화면에 크게 보이도록 다시 촬영해 주세요.</Text>
              </View>
            ) : r.observations.length === 0 ? (
              <View style={s.note}>
                <Text style={s.noteTitle}>사진상 뚜렷한 위험 후보를 찾지 못했습니다</Text>
                <Text style={s.noteText}>안전 확인은 아니므로 직접 점검을 함께 하세요.</Text>
              </View>
            ) : (
              r.observations.map((o) => (
                <ItemRow
                  key={o.no}
                  no={o.no}
                  icon={CATEGORY_ICONS[o.category] || CATEGORY_ICONS.기타}
                  iconColor={SEVERITY_COLORS[o.severity]}
                  iconBg={SEVERITY_TINTS[o.severity]}
                  sentence={o.detail}
                  highlight={o.label}
                  hlBg={HL_BG[o.severity]}
                  hlColor={HL_FG[o.severity]}
                  tag={
                    <Text style={[s.sevTag, { color: SEVERITY_COLORS[o.severity], borderColor: SEVERITY_COLORS[o.severity] }]}>
                      {o.severity}
                    </Text>
                  }
                />
              ))
            )}
          </View>
        </View>

        {/* 더 좋은 관리 방법 */}
        <View style={s.panel}>
          <PanelHeader title="더 좋은 관리 방법" color={C.blue} />
          <View style={s.panelBody}>
            {!!record.improvedUri && (
              <>
                <ImprovedPhoto record={record} />
                <View style={{ height: 4 }} />
              </>
            )}
            {actions.map((a, i) => (
              <ItemRow
                key={i}
                no={i + 1}
                icon={actionIcon(a)}
                iconColor={C.blue}
                iconBg="#E3EEFA"
                sentence={a.detail}
                highlight={a.title}
                hlBg="#CFE3F8"
                hlColor="#123E6E"
              />
            ))}

            <View style={s.cannot}>
              <View style={s.cannotHead}>
                <Icon name="eye-off-outline" size={24} color={C.navy} />
                <Text style={s.cannotTitle}>사진으로 확인할 수 없는 것</Text>
              </View>
              <View style={s.chips}>
                {r.cannot_verify.map((c) => (
                  <Text key={c} style={s.chip}>
                    {c}
                  </Text>
                ))}
              </View>
              <Text style={s.cannotNote}>→ 직접 확인하거나 시설 담당자 점검이 필요합니다.</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 즉시 점검 포인트 */}
      <View style={s.emergency}>
        <View style={s.emergencyLabel}>
          <Icon name="magnify" size={40} color="white" />
          <Text style={s.emergencyLabelText}>즉시 점검{'\n'}포인트</Text>
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <View style={s.emChips}>
            {EMERGENCY_CHIPS.map(([icon, text]) => (
              <View key={text} style={s.emChip}>
                <Icon name={icon} size={28} color="#B45309" />
                <Text style={s.emChipText}>{text}</Text>
              </View>
            ))}
          </View>
          <View style={s.emBar}>
            <Icon name="alert-outline" size={26} color="#1F2937" />
            <Text style={s.emBarText}>
              이상이 있으면 <Text style={s.emBarStrong}>즉시 사용을 중지</Text>하고{' '}
              <Text style={s.emBarStrong}>대피 · 119 신고 · 시설 안전관리자 통보</Text>
            </Text>
          </View>
        </View>
      </View>

      <Text style={s.footer}>
        {r.disclaimer}
        {'\n'}AI 화재안전 지킴이 · 분석 {formatDate(record.createdAt)} · {record.model}
      </Text>
    </View>
  );
});

export default Infographic;

/** CANVAS_W 폭으로 그린 내용을 width에 맞춰 축소해 보여준다. */
export function ScaledBox({ width, children }) {
  const [h, setH] = useState(0);
  const k = width / CANVAS_W;
  return (
    <View style={{ width, height: h * k, overflow: 'hidden' }}>
      <View
        style={{ width: CANVAS_W, transform: [{ scale: k }], transformOrigin: 'top left' }}
        onLayout={(e) => setH(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </View>
  );
}

export const HL_BG = { '위험 의심': '#FBD5D5', 주의: '#FFE7A3', 참고: '#D6E6F7' };
export const HL_FG = { '위험 의심': '#8B1A1A', 주의: '#6B3B00', 참고: '#123E6E' };

const s = StyleSheet.create({
  canvas: { width: CANVAS_W, backgroundColor: '#F3F6FA', padding: PAD, paddingTop: 22 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  logo: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  logoPlug: { position: 'absolute', top: 18 },
  title: { fontSize: 40, fontWeight: '900', color: '#0F1F3A', letterSpacing: -1 },
  subtitle: { fontSize: 18, color: '#4B5563', marginTop: 2 },
  titleRule: { height: 4, width: 120, backgroundColor: C.blue, borderRadius: 2, marginTop: 8 },

  urgent: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#D32F2F',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, marginBottom: 16,
  },
  urgentText: { color: 'white', fontSize: 21, fontWeight: '800', flex: 1 },

  columns: { flexDirection: 'row', gap: GAP, alignItems: 'stretch' },
  panel: {
    width: COL_W, backgroundColor: 'white', borderRadius: 18, overflow: 'hidden',
    borderWidth: 1.5, borderColor: '#C9D5E4',
  },
  panelHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20, minHeight: 66,
  },
  panelHeadText: { color: 'white', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12,
    paddingVertical: 6, paddingHorizontal: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
  },
  levelBadgeText: { color: 'white', fontSize: 21, fontWeight: '900' },
  panelBody: { padding: INNER, gap: 10 },

  dotOuter: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
  },
  dotInner: { width: 10, height: 10, borderRadius: 5 },
  callout: {
    position: 'absolute', width: LABEL_W, height: LABEL_H, backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 2.5, borderRadius: 12, paddingLeft: 20, paddingRight: 8, justifyContent: 'center',
  },
  calloutText: { fontSize: 17, fontWeight: '800', color: '#111827', lineHeight: 21 },
  calloutNo: {
    position: 'absolute', left: -12, top: -12, width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'white',
  },
  calloutNoText: { color: 'white', fontSize: 17, fontWeight: '900' },

  imgFail: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  imgFailText: { fontSize: 16, color: '#4B5563', textAlign: 'center', fontWeight: '700' },
  aiBadge: {
    position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(17,24,39,0.72)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  aiBadgeText: { color: 'white', fontSize: 15, fontWeight: '800' },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F7FA',
    borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12,
  },
  itemIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemText: { flex: 1, fontSize: 18, color: '#1F2937', lineHeight: 25, fontWeight: '500' },
  itemNo: { fontWeight: '900', color: '#0F1F3A' },
  sevTag: {
    fontSize: 14, fontWeight: '800', borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 1, marginTop: 2,
  },
  hl: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  hlText: { fontSize: 19, fontWeight: '900' },

  note: { backgroundColor: '#F5F7FA', borderRadius: 14, padding: 16 },
  noteTitle: { fontSize: 19, fontWeight: '800', color: '#374151' },
  noteText: { fontSize: 16, color: C.muted, marginTop: 4 },

  cannot: { borderWidth: 1.5, borderColor: '#D5DDE8', borderStyle: 'dashed', borderRadius: 14, padding: 14, marginTop: 4 },
  cannotHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cannotTitle: { fontSize: 19, fontWeight: '900', color: C.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    fontSize: 15, fontWeight: '700', color: '#374151', backgroundColor: '#EEF2F7',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden',
  },
  cannotNote: { fontSize: 15, color: C.muted, marginTop: 10 },

  emergency: {
    flexDirection: 'row', gap: 14, marginTop: GAP, backgroundColor: 'white', borderRadius: 18,
    borderWidth: 1.5, borderColor: '#C9D5E4', padding: 12, alignItems: 'stretch',
  },
  emergencyLabel: {
    width: 210, backgroundColor: C.navy, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12,
  },
  emergencyLabelText: { color: 'white', fontSize: 25, fontWeight: '900', lineHeight: 31 },
  emChips: { flexDirection: 'row', gap: 10 },
  emChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFF8E6', borderWidth: 2, borderColor: '#F2C14E', borderRadius: 14, paddingVertical: 10,
  },
  emChipText: { fontSize: 18, fontWeight: '900', color: '#3F2A00' },
  emBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FDEDB8',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  emBarText: { flex: 1, fontSize: 17, color: '#1F2937' },
  emBarStrong: { fontWeight: '900', color: '#B42318' },

  footer: { fontSize: 13, color: '#6B7280', marginTop: 12, lineHeight: 19, textAlign: 'center' },
});
