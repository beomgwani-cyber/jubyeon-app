// 첫 화면 — 주변개선 앱의 기능 메뉴.

import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { C } from '../theme.js';

const MENUS = [
  {
    key: 'fire',
    title: '화재안전 지킴이',
    desc: '콘센트·멀티탭 사진으로 화재 위험 후보와 관리방법을 확인합니다',
    icon: 'fire-alert',
    color: '#D9480F',
    tint: '#FFF0E6',
    ready: true,
  },
  {
    key: 'desk',
    title: '책상정리 개선',
    desc: '책상 사진과 예산으로 정리용품 추천과 정리 후 모습을 보여줍니다',
    icon: 'desk',
    color: C.blue,
    tint: '#E8F0FB',
    ready: true,
  },
  {
    key: 'glasses',
    title: '맞춤 안경 추천',
    desc: '얼굴 사진으로 어울리는 안경 3가지를 추천하고 내 얼굴에 씌워 비교합니다',
    icon: 'glasses',
    color: '#7048B6',
    tint: '#F1ECFA',
    ready: true,
  },
];

export default function MenuScreen({ onSelect, onSettings }) {
  function press(m) {
    if (m.ready) onSelect(m.key);
    else Alert.alert(m.title, '준비 중인 기능입니다. 곧 사용할 수 있도록 만들겠습니다.');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 32 }}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>주변개선</Text>
          <Text style={styles.subtitle}>사진 한 장으로 우리 주변을 더 안전하고 편리하게</Text>
        </View>
        <Pressable onPress={onSettings} style={styles.settingsBtn} hitSlop={10}>
          <Icon name="cog-outline" size={18} color={C.navy} />
          <Text style={styles.settingsText}>설정</Text>
        </Pressable>
      </View>

      {MENUS.map((m) => (
        <Pressable
          key={m.key}
          onPress={() => press(m)}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, !m.ready && styles.cardDim]}
        >
          <View style={[styles.iconBox, { backgroundColor: m.tint }]}>
            <Icon name={m.icon} size={38} color={m.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{m.title}</Text>
              {!m.ready && <Text style={styles.soon}>준비 중</Text>}
            </View>
            <Text style={styles.cardDesc}>{m.desc}</Text>
          </View>
          <Icon name="chevron-right" size={26} color={C.muted} />
        </Pressable>
      ))}

      <Text style={styles.footer}>
        AI 보조 결과이며 전문가의 점검·진단을 대신하지 않습니다.{'\n'}
        사진은 분석을 위해 OpenAI 서버로 전송됩니다.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 22, marginTop: 6 },
  title: { fontSize: 30, fontWeight: '900', color: C.navy, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 4 },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'white', borderWidth: 1,
    borderColor: C.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7,
  },
  settingsText: { color: C.navy, fontWeight: '700', fontSize: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'white', borderRadius: 16,
    borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardDim: { backgroundColor: '#FAFBFD' },
  iconBox: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 19, fontWeight: '900', color: C.text },
  soon: {
    fontSize: 11, fontWeight: '800', color: C.muted, backgroundColor: '#EEF2F7',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden',
  },
  cardDesc: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 19 },
  footer: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 12, lineHeight: 17 },
});
