// 책상정리 개선 — 시작 화면: 예산 선택 → 촬영/앨범 → 최근 기록.

import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { C } from '../theme.js';
import { BUDGETS } from './schema.js';
import { formatRange, formatWon } from './rules.js';

export const DESK_COLOR = '#2563A8';

function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function DeskHomeScreen({
  hasKey, budget, onBudget, history, onCapture, onPick, onOpen, onSettings, onMenu,
}) {
  const header = (
    <View>
      <Pressable onPress={onMenu} hitSlop={10} style={styles.menuBack}>
        <Text style={styles.menuBackText}>‹ 주변개선 메뉴</Text>
      </Pressable>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>책상정리 개선</Text>
          <Text style={styles.subtitle}>책상 사진과 예산으로 정리용품과 정리 후 모습을 제안합니다</Text>
        </View>
        <Pressable onPress={onSettings} style={styles.settingsBtn} hitSlop={10}>
          <Text style={styles.settingsText}>설정</Text>
        </Pressable>
      </View>

      {!hasKey && (
        <Pressable style={styles.warn} onPress={onSettings}>
          <Text style={styles.warnText}>먼저 설정에서 ChatGPT API 키를 입력하세요 ›</Text>
        </Pressable>
      )}

      <View style={styles.box}>
        <View style={styles.boxHead}>
          <Icon name="cart-outline" size={20} color={C.navy} />
          <Text style={styles.boxTitle}>정리용품 구입 예산</Text>
        </View>
        <View style={styles.budgetRow}>
          {BUDGETS.map((b) => {
            const on = b === budget;
            return (
              <Pressable key={b} onPress={() => onBudget(b)} style={[styles.budget, on && styles.budgetOn]}>
                <Text style={[styles.budgetText, on && styles.budgetTextOn]}>{formatWon(b)} 이하</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.boxNote}>예산 안에서 꼭 필요한 정리용품을 골라 추천합니다.</Text>
      </View>

      <Pressable style={[styles.bigBtn, { backgroundColor: C.navy }]} onPress={onCapture}>
        <Text style={styles.bigBtnText}>📷  책상 촬영</Text>
      </Pressable>
      <Pressable style={[styles.bigBtn, { backgroundColor: DESK_COLOR }]} onPress={onPick}>
        <Text style={styles.bigBtnText}>🖼  앨범에서 선택</Text>
      </Pressable>

      <Text style={styles.tip}>
        촬영 요령: 책상 전체가 한 장에 들어오도록 조금 떨어져서, 밝을 때 찍어 주세요. 의자 위·책상 옆 수납장도
        보이면 더 정확합니다. 사람 얼굴·개인 서류는 가리고 찍으세요.
      </Text>

      <Text style={styles.h2}>최근 정리안</Text>
      {history.length === 0 && <Text style={styles.empty}>아직 기록이 없습니다.</Text>}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      data={history}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => onOpen(item)}>
          <Image source={{ uri: item.afterUri || item.photoUri }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <View style={styles.rowTop}>
              <Text style={styles.badge}>예산 {formatWon(item.result.budget)}</Text>
              <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
            </View>
            <Text style={styles.rowText} numberOfLines={1}>
              {item.result.scene_summary || item.result.photo_issue || '정리안'}
            </Text>
            {item.result.purchases.length > 0 && (
              <Text style={styles.rowSub} numberOfLines={1}>
                물품 {item.result.purchases.length}개 · {formatRange(item.result.total_min, item.result.total_max)}
              </Text>
            )}
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        <Text style={styles.footer}>
          AI 제안이며 추천 물품은 일반 품목·대략적 가격입니다.{'\n'}
          사진은 분석을 위해 OpenAI 서버로 전송됩니다.
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  menuBack: { alignSelf: 'flex-start', marginBottom: 8 },
  menuBackText: { fontSize: 14, fontWeight: '700', color: C.blue },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '800', color: C.navy },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 4 },
  settingsBtn: { backgroundColor: 'white', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  settingsText: { color: C.navy, fontWeight: '700' },
  warn: { backgroundColor: '#FFF4E0', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E08A00' },
  warnText: { color: '#9A4F00', fontWeight: '700' },
  box: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 },
  boxHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  boxTitle: { fontSize: 16, fontWeight: '900', color: C.navy },
  budgetRow: { flexDirection: 'row', gap: 8 },
  budget: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: '#F7F9FC',
  },
  budgetOn: { borderColor: DESK_COLOR, backgroundColor: '#E8F0FB' },
  budgetText: { fontSize: 14, fontWeight: '800', color: C.muted },
  budgetTextOn: { color: DESK_COLOR },
  boxNote: { fontSize: 12, color: C.muted, marginTop: 8 },
  bigBtn: { borderRadius: 14, paddingVertical: 20, alignItems: 'center', marginBottom: 10 },
  bigBtnText: { color: 'white', fontSize: 19, fontWeight: '800' },
  tip: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 19 },
  h2: { fontSize: 17, fontWeight: '800', color: C.navy, marginTop: 22, marginBottom: 10 },
  empty: { color: C.muted, fontSize: 14 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: 'white', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: C.card },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  badge: {
    color: 'white', backgroundColor: DESK_COLOR, fontWeight: '800', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden',
  },
  date: { fontSize: 12, color: C.muted },
  rowText: { fontSize: 14, color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  footer: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 20, lineHeight: 16 },
});
