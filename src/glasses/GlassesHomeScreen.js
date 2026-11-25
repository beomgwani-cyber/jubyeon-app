// 맞춤 안경 추천 — 시작 화면: 용도·안경테 예산·분위기 선택 → 촬영/앨범 → 최근 기록.

import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { C } from '../theme.js';
import { BUDGETS, MOODS, PURPOSES } from './schema.js';
import { faceShapeLabel, formatWon } from './rules.js';

export const GLASSES_COLOR = '#7048B6';
const TINT = '#F1ECFA';

function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Choice({ icon, title, options, value, onChange, label = (o) => o, note }) {
  return (
    <View style={styles.box}>
      <View style={styles.boxHead}>
        <Icon name={icon} size={20} color={C.navy} />
        <Text style={styles.boxTitle}>{title}</Text>
      </View>
      <View style={styles.optRow}>
        {options.map((o) => {
          const on = o === value;
          return (
            <Pressable key={String(o)} onPress={() => onChange(o)} style={[styles.opt, on && styles.optOn]}>
              <Text style={[styles.optText, on && styles.optTextOn]} numberOfLines={1} adjustsFontSizeToFit>
                {label(o)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!!note && <Text style={styles.boxNote}>{note}</Text>}
    </View>
  );
}

export default function GlassesHomeScreen({
  hasKey, prefs, onPrefs, history, onCapture, onPick, onOpen, onSettings, onMenu,
}) {
  const set = (k) => (v) => onPrefs({ ...prefs, [k]: v });

  const header = (
    <View>
      <Pressable onPress={onMenu} hitSlop={10} style={styles.menuBack}>
        <Text style={styles.menuBackText}>‹ 주변개선 메뉴</Text>
      </Pressable>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>맞춤 안경 추천</Text>
          <Text style={styles.subtitle}>얼굴 사진으로 어울리는 안경 3가지를 고르고, 내 얼굴에 씌워 비교합니다</Text>
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

      <Choice icon="eye-outline" title="용도" options={PURPOSES} value={prefs.purpose} onChange={set('purpose')} />
      <Choice
        icon="tag-outline"
        title="안경테 예산 (렌즈 제외)"
        options={BUDGETS}
        value={prefs.budget}
        onChange={set('budget')}
        label={(b) => `${formatWon(b)} 이하`}
        note="렌즈 값은 도수·종류에 따라 따로 듭니다."
      />
      <Choice icon="emoticon-happy-outline" title="원하는 분위기" options={MOODS} value={prefs.mood} onChange={set('mood')} />

      <Pressable style={[styles.bigBtn, { backgroundColor: C.navy }]} onPress={onCapture}>
        <Text style={styles.bigBtnText}>🤳  얼굴 촬영</Text>
      </Pressable>
      <Pressable style={[styles.bigBtn, { backgroundColor: GLASSES_COLOR }]} onPress={onPick}>
        <Text style={styles.bigBtnText}>🖼  앨범에서 선택</Text>
      </Pressable>

      <Text style={styles.tip}>
        촬영 요령: 안경을 벗고, 정면을 보고, 얼굴 전체와 귀 위치가 보이게 찍어 주세요. 누워서 가까이 찍으면
        얼굴형이 왜곡될 수 있으니 팔을 쭉 뻗거나 다른 사람이 찍어 주는 것이 좋습니다. 앞머리는 이마가 보이게 넘겨 주세요.
      </Text>

      <Text style={styles.h2}>최근 추천</Text>
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
      renderItem={({ item }) => {
        const r = item.result;
        return (
          <Pressable style={styles.row} onPress={() => onOpen(item)}>
            <Image source={{ uri: item.tryon1Uri || item.photoUri }} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={styles.badge}>{r.purpose}</Text>
                <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.rowText} numberOfLines={1}>
                {r.photo_usable ? `얼굴형 ${faceShapeLabel(r)}` : r.photo_issue || '판독 불가'}
              </Text>
              {r.recommendations.length > 0 && (
                <Text style={styles.rowSub} numberOfLines={1}>
                  {r.recommendations.map((x) => x.style).join(' · ')}
                </Text>
              )}
            </View>
          </Pressable>
        );
      }}
      ListFooterComponent={
        <Text style={styles.footer}>
          AI 제안이며 실제 안경 치수·착용감·시력교정 효과를 보증하지 않습니다.{'\n'}
          얼굴 사진은 분석을 위해 OpenAI 서버로 전송되고, 기록은 이 휴대폰에만 저장됩니다.
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
  box: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
  boxHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  boxTitle: { fontSize: 15, fontWeight: '900', color: C.navy },
  optRow: { flexDirection: 'row', gap: 8 },
  opt: {
    flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: '#F7F9FC',
  },
  optOn: { borderColor: GLASSES_COLOR, backgroundColor: TINT },
  optText: { fontSize: 13, fontWeight: '800', color: C.muted },
  optTextOn: { color: GLASSES_COLOR },
  boxNote: { fontSize: 12, color: C.muted, marginTop: 6 },
  bigBtn: { borderRadius: 14, paddingVertical: 20, alignItems: 'center', marginBottom: 10, marginTop: 2 },
  bigBtnText: { color: 'white', fontSize: 19, fontWeight: '800' },
  tip: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 19 },
  h2: { fontSize: 17, fontWeight: '800', color: C.navy, marginTop: 22, marginBottom: 10 },
  empty: { color: C.muted, fontSize: 14 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: 'white', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: C.card },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  badge: {
    color: 'white', backgroundColor: GLASSES_COLOR, fontWeight: '800', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden',
  },
  date: { fontSize: 12, color: C.muted },
  rowText: { fontSize: 14, color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  footer: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 20, lineHeight: 16 },
});
