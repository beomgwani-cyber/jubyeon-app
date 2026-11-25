// 책상정리 개선 — 결과 화면.
// 맨 위: AI가 그린 '정리 후' 이미지(새 물품 옆 숫자 = 아래 목록 번호) → 구입 추천 물품·예산 →
// 현재 상태(사진 + 문제 지점) → 체크할 수 있는 정리 순서.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { AnalysisError, generateDeskImage } from '../openai.js';
import { saveGeneratedImage, updateRecord } from '../storage.js';
import { C } from '../theme.js';
import {
  DeskShareCard, ISSUE_COLOR, ITEM_COLOR, MarkedPhoto, NoCircle, PRIORITY_COLORS, itemIcon,
} from './DeskParts.js';
import { formatRange, formatWon } from './rules.js';

const PAD = 12;

function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shopSearch(keyword) {
  Linking.openURL(`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`).catch(() =>
    Alert.alert('열 수 없음', '인터넷 브라우저를 열 수 없습니다.'),
  );
}

function Section({ icon, title, color = C.navy, right, children }) {
  return (
    <View style={styles.section}>
      <View style={[styles.sectionHead, { backgroundColor: color }]}>
        <Icon name={icon} size={20} color="white" />
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function DeskResultScreen({ record, apiKey, onBack, onDelete, onUpdate }) {
  const { width, height: winH } = useWindowDimensions();
  const shotRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [viewer, setViewer] = useState(null); // 'after' | 'before' | null
  const [gen, setGen] = useState({ state: 'idle', error: '' }); // idle | loading | error
  const r = record.result;
  const canDraw = r.photo_usable && r.purchases.length > 0 && !!apiKey;
  const checked = record.checkedSteps || [];

  async function makeAfter() {
    if (!canDraw || gen.state === 'loading') return;
    setGen({ state: 'loading', error: '' });
    try {
      const landscape = record.photoWidth >= record.photoHeight;
      const { base64, model } = await generateDeskImage(record.photoUri, r, landscape, apiKey);
      const updated = await saveGeneratedImage(record.id, 'after', base64, model, 'desk');
      setGen({ state: 'idle', error: '' });
      if (updated) onUpdate(updated);
    } catch (e) {
      const msg = e instanceof AnalysisError ? e.message : `예상하지 못한 오류: ${e?.message || e}`;
      setGen({ state: 'error', error: msg });
    }
  }

  // 정리 후 이미지가 없으면 화면을 열 때 자동으로 그린다
  useEffect(() => {
    if (canDraw && !record.afterUri) makeAfter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleStep(i) {
    const next = checked.includes(i) ? checked.filter((v) => v !== i) : [...checked, i];
    const updated = await updateRecord(record.id, { checkedSteps: next }, 'desk');
    if (updated) onUpdate(updated);
  }

  function share() {
    if (gen.state === 'loading') {
      Alert.alert('잠시만요', '정리 후 이미지를 그리는 중입니다. 완성된 뒤 공유하면 이미지가 함께 들어갑니다.', [
        { text: '기다리기', style: 'cancel' },
        { text: '지금 공유', onPress: doShare },
      ]);
      return;
    }
    doShare();
  }

  async function doShare() {
    try {
      setSharing(true);
      const uri = await captureRef(shotRef, { format: 'jpg', quality: 0.92 });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('공유 불가', '이 기기에서는 공유 기능을 사용할 수 없습니다.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: '책상정리 개선안 공유' });
    } catch (e) {
      Alert.alert('공유 실패', String(e?.message || e));
    } finally {
      setSharing(false);
    }
  }

  function confirmDelete() {
    Alert.alert('기록 삭제', '이 정리안과 사진을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(record.id) },
    ]);
  }

  const fullW = width - PAD * 2;
  const afterW = record.afterInfo?.width || 1536;
  const afterH = record.afterInfo?.height || 1024;
  const beforeH = fullW * Math.min(Math.max(record.photoHeight / record.photoWidth, 0.4), 1.35);

  // ── 정리 후 이미지 영역 ──
  let afterBlock = null;
  if (record.afterUri) {
    afterBlock = (
      <>
        <Pressable onPress={() => setViewer('after')} style={styles.afterBox}>
          <Image source={{ uri: record.afterUri }} style={{ width: fullW, height: fullW * (afterH / afterW) }} />
          <View style={styles.aiTag}>
            <Icon name="creation" size={13} color="white" />
            <Text style={styles.aiTagText}>정리 후 · AI 예시</Text>
          </View>
          <View style={styles.zoomTag}>
            <Icon name="magnify-plus-outline" size={18} color="white" />
          </View>
        </Pressable>
        <Text style={styles.hint}>그림 속 숫자 = 아래 추천 물품 번호 · AI가 그린 예시라 실제 크기와 다를 수 있습니다</Text>
        {gen.state === 'loading' ? (
          <View style={styles.redrawing}>
            <ActivityIndicator size="small" color={ITEM_COLOR} />
            <Text style={styles.redrawingText}>다시 그리는 중… (1~2분)</Text>
          </View>
        ) : gen.state === 'error' ? (
          <Text style={styles.errorLine}>다시 그리기 실패: {gen.error}</Text>
        ) : (
          canDraw && (
            <Pressable onPress={makeAfter} style={{ alignSelf: 'center', marginBottom: 10 }}>
              <Text style={styles.redoText}>정리 후 이미지 다시 그리기</Text>
            </Pressable>
          )
        )}
      </>
    );
  } else if (gen.state === 'loading') {
    afterBlock = (
      <View style={styles.statusCard}>
        <ActivityIndicator color={ITEM_COLOR} />
        <Text style={styles.statusText}>
          추천 물품을 놓은 정리 후 모습을 그리는 중입니다 (1~2분).{'\n'}그동안 아래 정리안을 먼저 확인하세요.
        </Text>
      </View>
    );
  } else if (gen.state === 'error') {
    afterBlock = (
      <View style={[styles.statusCard, styles.statusError]}>
        <Icon name="image-off-outline" size={24} color="#8B1A1A" />
        <Text style={[styles.statusText, { color: '#8B1A1A' }]}>정리 후 이미지를 그리지 못했습니다: {gen.error}</Text>
        <Pressable onPress={makeAfter} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  } else if (r.photo_usable && !apiKey) {
    afterBlock = (
      <View style={styles.statusCard}>
        <Text style={styles.statusText}>설정에서 API 키를 입력하면 정리 후 이미지를 그립니다.</Text>
      </View>
    );
  }

  const budgetColor = r.over_budget ? '#C62828' : r.may_exceed ? '#B45309' : '#1E7B4F';
  const budgetMsg = r.over_budget
    ? '최소 가격 합계가 예산을 넘습니다. \'선택\' 물품부터 빼 보세요.'
    : r.may_exceed
      ? '가격에 따라 예산을 조금 넘을 수 있습니다. \'필수\' 물품부터 구입하세요.'
      : '예산 안에서 구입할 수 있는 구성입니다.';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 공유용 카드 — 화면 밖에 원본 크기로 그려 두고 캡처만 한다 */}
      <View style={styles.offscreen} pointerEvents="none">
        <DeskShareCard ref={shotRef} record={record} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: PAD, paddingBottom: 20 }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>책상정리 개선안</Text>
            <Text style={styles.subtitle}>{r.scene_summary || r.photo_issue}</Text>
          </View>
          <View style={styles.headBadges}>
            <Text style={styles.budgetBadge}>예산 {formatWon(r.budget)}</Text>
            {r.photo_usable && <Text style={styles.clutterBadge}>{r.clutter_level}</Text>}
          </View>
        </View>

        {!r.photo_usable ? (
          <View style={[styles.statusCard, styles.statusError]}>
            <Icon name="camera-off-outline" size={24} color="#8B1A1A" />
            <Text style={[styles.statusText, { color: '#8B1A1A' }]}>
              사진을 판독하기 어렵습니다: {r.photo_issue || '사진 상태 확인 필요'}
              {'\n'}밝을 때 책상 전체가 보이도록 다시 찍어 주세요.
            </Text>
          </View>
        ) : (
          <>
            {afterBlock}

            {/* 구입 추천 물품 */}
            <Section icon="cart-outline" title="구입 추천 물품" color={ITEM_COLOR}>
              {r.purchases.length === 0 && (
                <Text style={styles.empty}>이 책상은 지금 있는 물건만으로 정리할 수 있다고 판단했습니다.</Text>
              )}
              {r.purchases.map((p) => (
                <View key={p.no} style={styles.item}>
                  <View style={styles.itemTop}>
                    <NoCircle no={p.no} />
                    <View style={styles.itemIcon}>
                      <Icon name={itemIcon(p.name)} size={22} color={ITEM_COLOR} />
                    </View>
                    <Text style={styles.itemName}>{p.name}</Text>
                    <Text style={[styles.prioTag, { color: PRIORITY_COLORS[p.priority], borderColor: PRIORITY_COLORS[p.priority] }]}>
                      {p.priority}
                    </Text>
                  </View>
                  <Text style={styles.itemRole}>{p.role}</Text>
                  <View style={styles.metaRow}>
                    <Icon name="map-marker-outline" size={15} color={C.muted} />
                    <Text style={styles.metaText}>{p.placement}</Text>
                  </View>
                  {!!p.size_hint && (
                    <View style={styles.metaRow}>
                      <Icon name="ruler" size={15} color={C.muted} />
                      <Text style={styles.metaText}>{p.size_hint}</Text>
                    </View>
                  )}
                  <View style={styles.itemBottom}>
                    <Text style={styles.price}>{formatRange(p.price_min, p.price_max)}</Text>
                    <Pressable onPress={() => shopSearch(p.search_keyword)} style={styles.searchBtn} hitSlop={6}>
                      <Icon name="magnify" size={15} color={ITEM_COLOR} />
                      <Text style={styles.searchText}>쇼핑 검색</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {r.purchases.length > 0 && (
                <View style={[styles.totalBox, { borderColor: budgetColor }]}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>예상 합계</Text>
                    <Text style={[styles.totalValue, { color: budgetColor }]}>
                      {formatRange(r.total_min, r.total_max)}
                    </Text>
                  </View>
                  <Text style={[styles.totalMsg, { color: budgetColor }]}>
                    예산 {formatWon(r.budget)} · {budgetMsg}
                  </Text>
                </View>
              )}
              {r.cautions.length > 0 && (
                <View style={styles.cautions}>
                  <Text style={styles.cautionTitle}>구입 전 확인하세요</Text>
                  {r.cautions.map((c, i) => (
                    <Text key={i} style={styles.cautionText}>• {c}</Text>
                  ))}
                </View>
              )}
            </Section>

            {/* 현재 상태 */}
            <Section icon="magnify-scan" title="현재 상태">
              <Pressable onPress={() => setViewer('before')} style={styles.photoWrap}>
                <MarkedPhoto
                  uri={record.photoUri} pw={record.photoWidth} ph={record.photoHeight}
                  w={fullW - 22} h={beforeH - 22} points={r.issues}
                />
              </Pressable>
              {r.issues.map((o) => (
                <View key={o.no} style={styles.issue}>
                  <NoCircle no={o.no} color={ISSUE_COLOR} size={24} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.issueLabel}>{o.label}</Text>
                    <Text style={styles.issueDetail}>{o.detail}</Text>
                  </View>
                </View>
              ))}
              {r.keep_structure.length > 0 && (
                <View style={styles.keep}>
                  <Text style={styles.keepTitle}>그대로 둘 고정 구조</Text>
                  <View style={styles.chips}>
                    {r.keep_structure.map((k) => (
                      <Text key={k} style={styles.chip}>{k}</Text>
                    ))}
                  </View>
                </View>
              )}
            </Section>

            {/* 정리 순서 */}
            {r.steps.length > 0 && (
              <Section
                icon="format-list-checks"
                title="정리 순서"
                right={<Text style={styles.progress}>{checked.length}/{r.steps.length}</Text>}
              >
                {r.steps.map((s, i) => {
                  const done = checked.includes(i);
                  return (
                    <Pressable key={i} onPress={() => toggleStep(i)} style={[styles.step, done && styles.stepDone]}>
                      <Icon
                        name={done ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                        size={26}
                        color={done ? '#1E7B4F' : C.muted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>
                          {i + 1}. {s.title}
                        </Text>
                        <Text style={styles.stepDetail}>{s.detail}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                <Text style={styles.stepHint}>끝낸 단계를 누르면 체크됩니다</Text>
              </Section>
            )}
          </>
        )}

        <Text style={styles.disclaimer}>{r.disclaimer}</Text>
        <Text style={styles.disclaimer}>
          분석일시 {formatDate(record.createdAt)} · 분석 모델 {record.model}
          {record.afterModel ? ` · 이미지 ${record.afterModel}` : ''}
        </Text>
      </ScrollView>

      {/* 정리 후 이미지 크게 보기 — 밀어서 확인 */}
      <Modal visible={viewer === 'after'} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={styles.viewerBg}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 50 }}>
            <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: 6 }}>
              {!!record.afterUri && (
                <Image
                  source={{ uri: record.afterUri }}
                  style={{ width: width * 1.8, height: width * 1.8 * (afterH / afterW) }}
                />
              )}
            </ScrollView>
          </ScrollView>
          <Pressable style={styles.viewerCloseBtn} onPress={() => setViewer(null)}>
            <Text style={styles.viewerCloseBtnText}>닫기 ✕</Text>
          </Pressable>
        </View>
      </Modal>

      {/* 현재 사진 크게 보기 */}
      <Modal visible={viewer === 'before'} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={[styles.viewerBg, { alignItems: 'center', justifyContent: 'center', gap: 12 }]} onPress={() => setViewer(null)}>
          <Text style={styles.viewerTitle}>현재 상태 (촬영 사진)</Text>
          <MarkedPhoto
            uri={record.photoUri} pw={record.photoWidth} ph={record.photoHeight}
            w={width} h={winH * 0.8} points={r.issues} r={15} bg="transparent"
          />
          <Text style={styles.viewerClose}>화면을 누르면 닫힙니다</Text>
        </Pressable>
      </Modal>

      <View style={styles.bottomBar}>
        <Pressable style={[styles.btn, { backgroundColor: ITEM_COLOR }]} onPress={share} disabled={sharing}>
          <Text style={styles.btnText}>{sharing ? '이미지 만드는 중…' : '이미지로 공유'}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={confirmDelete}>
          <Text style={[styles.btnText, { color: '#D32F2F' }]}>삭제</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onBack}>
          <Text style={[styles.btnText, { color: C.navy }]}>처음으로</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -5000, top: 0 },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  title: { fontSize: 21, fontWeight: '900', color: '#0F1F3A', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 2 },
  headBadges: { alignItems: 'flex-end', gap: 4 },
  budgetBadge: {
    color: 'white', backgroundColor: ITEM_COLOR, fontWeight: '900', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden',
  },
  clutterBadge: {
    color: ISSUE_COLOR, borderColor: ISSUE_COLOR, borderWidth: 1, fontWeight: '800', fontSize: 11,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },

  afterBox: {
    borderRadius: 12, overflow: 'hidden', backgroundColor: 'white', borderWidth: 1, borderColor: C.border,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  aiTag: {
    position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(27,54,93,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  aiTagText: { color: 'white', fontSize: 12, fontWeight: '800' },
  zoomTag: { position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(17,24,39,0.55)', borderRadius: 14, padding: 5 },
  hint: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6, marginBottom: 6 },
  redoText: { fontSize: 13, color: ITEM_COLOR, fontWeight: '700', textDecorationLine: 'underline' },
  redrawing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 },
  redrawingText: { fontSize: 12, color: ITEM_COLOR, fontWeight: '700' },
  errorLine: { fontSize: 12, color: '#8B1A1A', textAlign: 'center', marginBottom: 10 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E8F0FB', borderWidth: 1,
    borderColor: '#BFD3EE', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  statusError: { backgroundColor: '#FDECEC', borderColor: '#F3B4B4' },
  statusText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
  retryBtn: { backgroundColor: ITEM_COLOR, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retryBtnText: { color: 'white', fontWeight: '800', fontSize: 12 },

  section: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14 },
  sectionTitle: { flex: 1, color: 'white', fontSize: 17, fontWeight: '900' },
  sectionBody: { padding: 10, gap: 8 },
  empty: { fontSize: 14, color: C.muted, padding: 6 },

  item: { backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10, gap: 4 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E3EEFA', alignItems: 'center', justifyContent: 'center' },
  itemName: { flex: 1, fontSize: 16, fontWeight: '900', color: '#0F1F3A' },
  prioTag: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  itemRole: { fontSize: 14, color: C.text, lineHeight: 20, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1, fontSize: 12, color: C.muted },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { fontSize: 15, fontWeight: '900', color: '#1F2937' },
  searchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: '#BFD3EE',
    backgroundColor: 'white', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4,
  },
  searchText: { fontSize: 12, fontWeight: '800', color: ITEM_COLOR },
  totalBox: { borderWidth: 1.5, borderRadius: 10, padding: 10, backgroundColor: 'white' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, fontWeight: '900', color: '#0F1F3A' },
  totalValue: { fontSize: 17, fontWeight: '900' },
  totalMsg: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  cautions: { backgroundColor: '#FFF8E6', borderRadius: 10, padding: 10, gap: 2 },
  cautionTitle: { fontSize: 13, fontWeight: '900', color: '#7A4B00', marginBottom: 2 },
  cautionText: { fontSize: 13, color: '#3F2A00', lineHeight: 19 },

  photoWrap: { borderRadius: 8, overflow: 'hidden' },
  issue: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFF4EE', borderRadius: 10, padding: 9 },
  issueLabel: { fontSize: 14, fontWeight: '900', color: '#7C2D12' },
  issueDetail: { fontSize: 13, color: C.text, marginTop: 1, lineHeight: 18 },
  keep: { borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', borderRadius: 10, padding: 10 },
  keepTitle: { fontSize: 13, fontWeight: '900', color: C.navy, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 12, fontWeight: '700', color: '#374151', backgroundColor: '#EEF2F7',
    borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden',
  },

  progress: { color: 'white', fontWeight: '900', fontSize: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10 },
  stepDone: { backgroundColor: '#EAF6EF' },
  stepTitle: { fontSize: 15, fontWeight: '900', color: '#0F1F3A' },
  stepTitleDone: { color: '#1E7B4F' },
  stepDetail: { fontSize: 13, color: C.text, marginTop: 2, lineHeight: 18 },
  stepHint: { fontSize: 11, color: C.muted, textAlign: 'center' },

  disclaimer: { fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 16 },

  viewerBg: { flex: 1, backgroundColor: 'rgba(10,16,28,0.97)' },
  viewerTitle: { color: 'white', fontSize: 15, fontWeight: '800' },
  viewerClose: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  viewerCloseBtn: {
    position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  viewerCloseBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },

  bottomBar: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: C.border },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { flex: 0.6, backgroundColor: C.card },
  btnText: { color: 'white', fontWeight: '800', fontSize: 15 },
});
