// 책상정리 결과 화면과 공유 카드가 함께 쓰는 작은 부품들.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { markerPositions } from '../rules.js';
import { C } from '../theme.js';
import { formatRange, formatWon } from './rules.js';

export const ISSUE_COLOR = '#E0662B';
export const ITEM_COLOR = '#2563A8';
export const PRIORITY_COLORS = { 필수: '#C2410C', 추천: '#2563A8', 선택: '#6B7280' };

// 품목 이름에 맞는 아이콘
const ITEM_ICON_RULES = [
  [/모니터|받침/, 'monitor'],
  [/조명|스탠드|램프|라이트/, 'desk-lamp'],
  [/케이블|전선|선\s*정리|멀티탭/, 'cable-data'],
  [/서류|파일|문서|북엔드|책꽂이/, 'file-cabinet'],
  [/펜|연필|문구|필통|꽂이/, 'pencil-box-outline'],
  [/매트|패드/, 'rectangle-outline'],
  [/서랍|트레이|정리함|수납|바구니|박스/, 'archive-outline'],
  [/선반|랙|거치/, 'bookshelf'],
  [/옷|행거|후크|걸이/, 'hanger'],
  [/화분|식물/, 'sprout'],
  [/휴지통|쓰레기/, 'delete-outline'],
];

export function itemIcon(name) {
  for (const [re, icon] of ITEM_ICON_RULES) if (re.test(name || '')) return icon;
  return 'package-variant-closed';
}

/** 사진 전체를 w×h 상자 안에 맞춰 보이게 그리고, 지점에 번호 원을 얹는다. */
export function MarkedPhoto({ uri, pw, ph, w, h, points = [], color = ISSUE_COLOR, r = 11, bg = '#DDE3EA' }) {
  const scale = Math.min(w / pw, h / ph);
  const dw = pw * scale;
  const dh = ph * scale;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  const placed = markerPositions(points, dw, dh, r);
  return (
    <View style={{ width: w, height: h, backgroundColor: bg, overflow: 'hidden' }}>
      <Image source={{ uri }} style={{ position: 'absolute', left: ox, top: oy, width: dw, height: dh }} />
      {points.map((o, i) => (
        <View
          key={o.no}
          style={[
            styles.marker,
            { left: ox + placed[i][0] - r - 2, top: oy + placed[i][1] - r - 2, width: r * 2 + 4, height: r * 2 + 4, borderRadius: r + 2 },
          ]}
        >
          <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[styles.markerText, { fontSize: r * 1.1 }]}>{o.no}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function NoCircle({ no, color = ITEM_COLOR, size = 26 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: 'white', fontWeight: '900', fontSize: size * 0.52 }}>{no}</Text>
    </View>
  );
}

// ── 공유용 카드 (고정 폭으로 화면 밖에 그려 두고 캡처) ─────────────────

export const CARD_W = 1080;
const PAD = 30;
const GAP = 18;
const HALF = (CARD_W - PAD * 2 - GAP) / 2;

export const DeskShareCard = forwardRef(function DeskShareCard({ record }, ref) {
  const r = record.result;
  const aspect = Math.min(Math.max(record.photoHeight / record.photoWidth, 0.5), 1.4);
  const photoH = HALF * aspect;
  const afterW = record.afterInfo?.width || record.photoWidth;
  const afterH = record.afterInfo?.height || record.photoHeight;

  return (
    <View ref={ref} collapsable={false} style={card.root}>
      <View style={card.head}>
        <View style={card.logo}>
          <Icon name="desk" size={40} color="white" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.title}>책상정리 개선안</Text>
          <Text style={card.sub}>{r.scene_summary}</Text>
        </View>
        <View style={card.budget}>
          <Text style={card.budgetLabel}>구입 예산</Text>
          <Text style={card.budgetValue}>{formatWon(r.budget)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: GAP }}>
        <View style={card.col}>
          <Text style={[card.colHead, { backgroundColor: C.navy }]}>현재 상태</Text>
          <MarkedPhoto uri={record.photoUri} pw={record.photoWidth} ph={record.photoHeight} w={HALF} h={photoH} points={r.issues} r={15} />
        </View>
        <View style={card.col}>
          <Text style={[card.colHead, { backgroundColor: ITEM_COLOR }]}>정리 후 (AI 예시)</Text>
          {record.afterUri ? (
            <MarkedPhoto uri={record.afterUri} pw={afterW} ph={afterH} w={HALF} h={photoH} />
          ) : (
            <View style={[card.empty, { height: photoH }]}>
              <Text style={card.emptyText}>정리 후 이미지 없음</Text>
            </View>
          )}
        </View>
      </View>

      <View style={card.section}>
        <View style={card.sectionHead}>
          <Icon name="cart-outline" size={26} color={ITEM_COLOR} />
          <Text style={card.sectionTitle}>구입 추천 물품</Text>
          <Text style={card.total}>
            합계 {formatRange(r.total_min, r.total_max)}
          </Text>
        </View>
        {r.purchases.map((p) => (
          <View key={p.no} style={card.itemRow}>
            <NoCircle no={p.no} size={34} />
            <Icon name={itemIcon(p.name)} size={30} color={ITEM_COLOR} />
            <View style={{ flex: 1 }}>
              <Text style={card.itemName}>
                {p.name} <Text style={{ color: PRIORITY_COLORS[p.priority], fontSize: 18 }}>· {p.priority}</Text>
              </Text>
              <Text style={card.itemRole}>{p.role} · {p.placement}</Text>
            </View>
            <Text style={card.price}>{formatRange(p.price_min, p.price_max)}</Text>
          </View>
        ))}
      </View>

      {r.steps.length > 0 && (
        <View style={card.section}>
          <View style={card.sectionHead}>
            <Icon name="format-list-numbered" size={26} color={C.navy} />
            <Text style={card.sectionTitle}>정리 순서</Text>
          </View>
          <View style={card.steps}>
            {r.steps.map((s, i) => (
              <View key={i} style={card.step}>
                <NoCircle no={i + 1} color={C.navy} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={card.stepTitle}>{s.title}</Text>
                  <Text style={card.stepDetail}>{s.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text style={card.footer}>
        주변개선 · AI 제안 정리안 — 추천 물품은 일반 품목이며 가격은 대략적 범위입니다. 구입 전 치수를 확인하세요.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  marker: { position: 'absolute', backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  markerText: { color: 'white', fontWeight: '900' },
});

const card = StyleSheet.create({
  root: { width: CARD_W, backgroundColor: '#EEF2F7', padding: PAD, gap: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logo: { width: 68, height: 68, borderRadius: 18, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 40, fontWeight: '900', color: '#0F1F3A', letterSpacing: -1 },
  sub: { fontSize: 20, color: C.muted, marginTop: 2 },
  budget: { backgroundColor: 'white', borderRadius: 14, borderWidth: 2, borderColor: ITEM_COLOR, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  budgetLabel: { fontSize: 15, color: C.muted, fontWeight: '700' },
  budgetValue: { fontSize: 26, color: ITEM_COLOR, fontWeight: '900' },
  col: { width: HALF, backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' },
  colHead: { color: 'white', fontSize: 22, fontWeight: '900', textAlign: 'center', paddingVertical: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F0FB' },
  emptyText: { fontSize: 18, color: C.muted },
  section: { backgroundColor: 'white', borderRadius: 16, padding: 18, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontSize: 26, fontWeight: '900', color: '#0F1F3A' },
  total: { fontSize: 20, fontWeight: '900', color: ITEM_COLOR },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F7FA', borderRadius: 12, padding: 12 },
  itemName: { fontSize: 22, fontWeight: '900', color: '#1F2937' },
  itemRole: { fontSize: 17, color: '#4B5563', marginTop: 2 },
  price: { fontSize: 19, fontWeight: '800', color: '#1F2937' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  step: { width: (CARD_W - PAD * 2 - 36 - 10) / 2, flexDirection: 'row', gap: 10, backgroundColor: '#F5F7FA', borderRadius: 12, padding: 12 },
  stepTitle: { fontSize: 19, fontWeight: '900', color: '#0F1F3A' },
  stepDetail: { fontSize: 16, color: '#4B5563', marginTop: 2, lineHeight: 22 },
  footer: { fontSize: 15, color: C.muted, textAlign: 'center' },
});
