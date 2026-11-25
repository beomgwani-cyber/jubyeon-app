// 맞춤 안경 결과 화면과 공유 카드가 함께 쓰는 부품.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { C } from '../theme.js';
import { faceShapeLabel, formatRange, formatWon } from './rules.js';

const COLOR = '#7048B6';

export function NoBadge({ no, size = 30 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLOR, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: 'white', fontWeight: '900', fontSize: size * 0.5 }}>{no}</Text>
    </View>
  );
}

// ── 공유용 카드 (고정 폭으로 화면 밖에 그려 두고 캡처) ─────────────────

export const CARD_W = 1080;
const PAD = 30;
const GAP = 14;

export const GlassesShareCard = forwardRef(function GlassesShareCard({ record }, ref) {
  const r = record.result;
  const recs = r.recommendations;
  const shots = [
    { label: '원본', uri: record.photoUri },
    ...recs.map((x) => ({ label: `${x.no}. ${x.style}`, uri: record[`tryon${x.no}Uri`] })),
  ];
  const cols = shots.length;
  const tileW = (CARD_W - PAD * 2 - GAP * (cols - 1)) / cols;
  const tileH = tileW * 1.4;

  return (
    <View ref={ref} collapsable={false} style={card.root}>
      <View style={card.head}>
        <View style={card.logo}>
          <Icon name="glasses" size={42} color="white" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.title}>맞춤 안경 추천</Text>
          <Text style={card.sub}>{r.face_summary}</Text>
        </View>
        <View style={card.shape}>
          <Text style={card.shapeLabel}>얼굴형</Text>
          <Text style={card.shapeValue}>{faceShapeLabel(r)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: GAP }}>
        {shots.map((s, i) => (
          <View key={i} style={[card.tile, { width: tileW }]}>
            {s.uri ? (
              <Image source={{ uri: s.uri }} style={{ width: tileW, height: tileH }} resizeMode="cover" />
            ) : (
              <View style={[card.empty, { width: tileW, height: tileH }]}>
                <Icon name="glasses" size={48} color="#B9A6DD" />
              </View>
            )}
            <Text style={[card.tileLabel, i === 0 && { backgroundColor: C.navy }]} numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={card.section}>
        <View style={card.sectionHead}>
          <Icon name="star-outline" size={28} color={COLOR} />
          <Text style={card.sectionTitle}>추천 이유</Text>
          <Text style={card.meta}>{r.purpose} · 테 {formatWon(r.budget)} 이하</Text>
        </View>
        {recs.map((x) => (
          <View key={x.no} style={card.row}>
            <NoBadge no={x.no} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={card.rowTitle}>
                {x.style} <Text style={card.rowColors}>· {x.colors}</Text>
              </Text>
              <Text style={card.rowReason}>{x.reason}</Text>
            </View>
            <Text style={card.price}>{formatRange(x.price_min, x.price_max)}</Text>
          </View>
        ))}
      </View>

      {!!r.shop_request && (
        <View style={card.request}>
          <Text style={card.requestTitle}>안경원에서 요청할 문장</Text>
          <Text style={card.requestText}>“{r.shop_request}”</Text>
        </View>
      )}

      <Text style={card.footer}>
        주변개선 · 착용 이미지는 AI 합성 예시이며 실제 안경테 치수·시력교정 효과를 보증하지 않습니다.
      </Text>
    </View>
  );
});

const card = StyleSheet.create({
  root: { width: CARD_W, backgroundColor: '#F3F0F9', padding: PAD, gap: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logo: { width: 70, height: 70, borderRadius: 18, backgroundColor: COLOR, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 40, fontWeight: '900', color: '#0F1F3A', letterSpacing: -1 },
  sub: { fontSize: 20, color: C.muted, marginTop: 2 },
  shape: { backgroundColor: 'white', borderRadius: 14, borderWidth: 2, borderColor: COLOR, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  shapeLabel: { fontSize: 15, color: C.muted, fontWeight: '700' },
  shapeValue: { fontSize: 24, color: COLOR, fontWeight: '900' },
  tile: { backgroundColor: 'white', borderRadius: 14, overflow: 'hidden' },
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECE6F7' },
  tileLabel: {
    backgroundColor: COLOR, color: 'white', fontSize: 18, fontWeight: '900', textAlign: 'center',
    paddingVertical: 8, paddingHorizontal: 6,
  },
  section: { backgroundColor: 'white', borderRadius: 16, padding: 18, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontSize: 26, fontWeight: '900', color: '#0F1F3A' },
  meta: { fontSize: 18, fontWeight: '800', color: COLOR },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F7F5FB', borderRadius: 12, padding: 12 },
  rowTitle: { fontSize: 22, fontWeight: '900', color: '#1F2937' },
  rowColors: { fontSize: 18, color: C.muted, fontWeight: '700' },
  rowReason: { fontSize: 17, color: '#4B5563', marginTop: 3, lineHeight: 24 },
  price: { fontSize: 18, fontWeight: '800', color: '#1F2937' },
  request: { backgroundColor: 'white', borderRadius: 16, padding: 18, borderLeftWidth: 6, borderLeftColor: COLOR },
  requestTitle: { fontSize: 18, fontWeight: '900', color: COLOR, marginBottom: 6 },
  requestText: { fontSize: 20, color: '#1F2937', lineHeight: 30 },
  footer: { fontSize: 15, color: C.muted, textAlign: 'center' },
});
