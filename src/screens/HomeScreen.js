import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, LEVEL_COLORS } from '../theme.js';

function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function HomeScreen({ hasKey, history, onCapture, onPick, onOpen, onSettings, onMenu }) {
  const header = (
    <View>
      <Pressable onPress={onMenu} hitSlop={10} style={styles.menuBack}>
        <Text style={styles.menuBackText}>‹ 주변개선 메뉴</Text>
      </Pressable>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>화재안전 지킴이</Text>
          <Text style={styles.subtitle}>콘센트·멀티탭 사진으로 위험 후보와 관리방법을 확인합니다</Text>
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

      <Pressable style={[styles.bigBtn, { backgroundColor: C.navy }]} onPress={onCapture}>
        <Text style={styles.bigBtnText}>📷  카메라로 촬영</Text>
      </Pressable>
      <Pressable style={[styles.bigBtn, { backgroundColor: C.blue }]} onPress={onPick}>
        <Text style={styles.bigBtnText}>🖼  앨범에서 선택</Text>
      </Pressable>

      <Text style={styles.tip}>
        촬영 요령: 밝은 곳에서 콘센트·멀티탭과 주변 전선이 화면에 크게 보이도록 찍어 주세요.
      </Text>

      <Text style={styles.h2}>최근 점검 기록</Text>
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
          <Image source={{ uri: item.photoUri }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <View style={styles.rowTop}>
              <Text style={[styles.badge, { backgroundColor: LEVEL_COLORS[item.result.level] }]}>{item.result.level}</Text>
              <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
            </View>
            <Text style={styles.rowText} numberOfLines={2}>
              {item.result.scene_summary || item.result.photo_issue || '분석 결과'}
            </Text>
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        <Text style={styles.footer}>
          AI 보조 판독이며 전문 전기안전점검을 대신하지 않습니다.{'\n'}
          타는 냄새·연기·불꽃이 있으면 대피 후 119에 신고하세요.
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
  bigBtn: { borderRadius: 14, paddingVertical: 20, alignItems: 'center', marginBottom: 10 },
  bigBtnText: { color: 'white', fontSize: 19, fontWeight: '800' },
  tip: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  h2: { fontSize: 17, fontWeight: '800', color: C.navy, marginTop: 22, marginBottom: 10 },
  empty: { color: C.muted, fontSize: 14 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: 'white', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  thumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: C.card },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  badge: { color: 'white', fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  date: { fontSize: 12, color: C.muted },
  rowText: { fontSize: 14, color: C.text },
  footer: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 20, lineHeight: 16 },
});
