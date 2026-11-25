// 맞춤 안경 추천 — 결과 화면.
// 맨 위: 원본 / ① / ② / ③ 탭으로 바꿔 보는 착용 비교 (AI가 추천 안경 3종을 차례로 그림) →
// 얼굴 분석 → 추천 디자인 3개(이유·치수·가격·쇼핑 검색) → 피할 디자인 → 구매 방법·안경원 요청 문장.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { AnalysisError, generateTryOnImage } from '../openai.js';
import { saveGeneratedImage } from '../storage.js';
import { C } from '../theme.js';
import { GLASSES_COLOR } from './GlassesHomeScreen.js';
import { GlassesShareCard, NoBadge } from './GlassesParts.js';
import { faceShapeLabel, formatRange, formatWon } from './rules.js';

const PAD = 12;
const TINT = '#F1ECFA';

// 화면을 나갔다 다시 들어와도 같은 이미지를 두 번 그리지 않도록 (기록id:번호)
const inFlight = new Set();
// 자동으로 차례 그리기가 진행 중인 기록 id (다시 들어와도 두 번째 순서를 시작하지 않음)
const autoRunning = new Set();

function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function openUrl(url) {
  Linking.openURL(url).catch(() => Alert.alert('열 수 없음', '인터넷 브라우저를 열 수 없습니다.'));
}

const shopSearch = (kw) => openUrl(`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(kw)}`);
const opticianSearch = () => openUrl(`https://map.naver.com/p/search/${encodeURIComponent('안경원')}`);

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

export default function GlassesResultScreen({ record, apiKey, onBack, onDelete, onUpdate }) {
  const { width, height: winH } = useWindowDimensions();
  const shotRef = useRef(null);
  const scrollRef = useRef(null);
  const recRef = useRef(record); // 순서대로 그리는 동안 최신 기록
  recRef.current = record;
  const [tab, setTab] = useState(record.tryon1Uri ? 1 : 0); // 0 = 원본, 1~3 = 추천 번호
  const [gen, setGen] = useState({}); // { [no]: 'loading' | 오류 문장 }
  const [sharing, setSharing] = useState(false);
  const [viewer, setViewer] = useState(false);
  const r = record.result;
  const recs = r.recommendations;
  const canDraw = r.photo_usable && recs.length > 0 && !!apiKey;

  const uriOf = (no) => (no === 0 ? record.photoUri : record[`tryon${no}Uri`]);
  const sizeOf = (no) =>
    no === 0
      ? { w: record.photoWidth, h: record.photoHeight }
      : { w: record[`tryon${no}Info`]?.width || 1024, h: record[`tryon${no}Info`]?.height || 1536 };

  async function draw(no) {
    const key = `${record.id}:${no}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);
    setGen((g) => ({ ...g, [no]: 'loading' }));
    try {
      const landscape = record.photoWidth > record.photoHeight;
      const { base64, model } = await generateTryOnImage(record.photoUri, recs[no - 1], r.purpose, landscape, apiKey);
      const updated = await saveGeneratedImage(record.id, `tryon${no}`, base64, model, 'glasses');
      setGen((g) => ({ ...g, [no]: undefined }));
      if (updated) {
        recRef.current = updated;
        onUpdate(updated);
      }
      // 처음 완성된 착용 이미지는 바로 보여 준다
      setTab((t) => (t === 0 && no === 1 ? 1 : t));
    } catch (e) {
      const msg = e instanceof AnalysisError ? e.message : `예상하지 못한 오류: ${e?.message || e}`;
      setGen((g) => ({ ...g, [no]: msg }));
    } finally {
      inFlight.delete(key);
    }
  }

  // 화면을 열면 아직 없는 착용 이미지를 1번부터 차례로 그린다 (동시에 그리면 기록 저장이 엉킴)
  useEffect(() => {
    if (!canDraw || autoRunning.has(record.id)) return;
    autoRunning.add(record.id);
    (async () => {
      try {
        for (let no = 1; no <= recs.length; no++) {
          if (!recRef.current[`tryon${no}Uri`]) await draw(no);
        }
      } finally {
        autoRunning.delete(record.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showTryOn(no) {
    setTab(no);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function share() {
    const pending = Object.values(gen).includes('loading');
    if (pending) {
      Alert.alert('잠시만요', '착용 이미지를 그리는 중입니다. 다 그린 뒤 공유하면 이미지가 함께 들어갑니다.', [
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
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: '맞춤 안경 추천 공유' });
    } catch (e) {
      Alert.alert('공유 실패', String(e?.message || e));
    } finally {
      setSharing(false);
    }
  }

  function shareRequest() {
    Share.share({ message: r.shop_request }).catch(() => {});
  }

  function confirmDelete() {
    Alert.alert('기록 삭제', '이 추천 기록과 얼굴 사진·착용 이미지를 모두 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(record.id) },
    ]);
  }

  const fullW = width - PAD * 2;

  // ── 착용 비교 영역 ──
  const cur = sizeOf(tab);
  const boxH = Math.min(fullW * (cur.h / cur.w), winH * 0.6);
  const curUri = uriOf(tab);
  const curGen = gen[tab];
  const curRec = tab > 0 ? recs[tab - 1] : null;

  let stage;
  if (curUri) {
    stage = (
      <Pressable onPress={() => setViewer(true)} style={[styles.stage, { height: boxH }]}>
        <Image source={{ uri: curUri }} style={{ width: fullW, height: boxH }} resizeMode="contain" />
        <View style={styles.aiTag}>
          {tab > 0 && <Icon name="creation" size={13} color="white" />}
          <Text style={styles.aiTagText}>{tab === 0 ? '원본 사진' : `${tab}. ${curRec?.style} · AI 예시`}</Text>
        </View>
        <View style={styles.zoomTag}>
          <Icon name="magnify-plus-outline" size={18} color="white" />
        </View>
      </Pressable>
    );
  } else {
    stage = (
      <View style={[styles.stage, styles.stageEmpty, { height: boxH }]}>
        {curGen === 'loading' ? (
          <>
            <ActivityIndicator size="large" color={GLASSES_COLOR} />
            <Text style={styles.stageText}>{curRec?.style}을(를) 씌워 보는 중입니다 (1~2분)</Text>
            <Text style={styles.stageSub}>그동안 아래 추천 이유를 먼저 확인하세요</Text>
          </>
        ) : curGen ? (
          <>
            <Icon name="image-off-outline" size={30} color="#8B1A1A" />
            <Text style={[styles.stageText, { color: '#8B1A1A' }]}>착용 이미지를 그리지 못했습니다{'\n'}{curGen}</Text>
            {canDraw && (
              <Pressable onPress={() => draw(tab)} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </Pressable>
            )}
          </>
        ) : canDraw ? (
          <>
            <ActivityIndicator color={GLASSES_COLOR} />
            <Text style={styles.stageText}>앞 번호를 그린 다음 차례로 그립니다</Text>
          </>
        ) : (
          <Text style={styles.stageText}>설정에서 API 키를 입력하면 착용 모습을 그립니다.</Text>
        )}
      </View>
    );
  }

  const tryOnBlock = (
    <>
      <View style={styles.tabs}>
        {[0, ...recs.map((x) => x.no)].map((no) => {
          const on = tab === no;
          const loading = gen[no] === 'loading';
          const thumb = uriOf(no);
          return (
            <Pressable key={no} onPress={() => setTab(no)} style={[styles.tab, on && styles.tabOn]}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.tabThumb} />
              ) : (
                <View style={[styles.tabThumb, styles.tabThumbEmpty]}>
                  {loading ? <ActivityIndicator size="small" color={GLASSES_COLOR} /> : <Icon name="glasses" size={20} color={C.muted} />}
                </View>
              )}
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                {no === 0 ? '원본' : `${no}순위`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {stage}
      <Text style={styles.hint}>
        위 탭을 눌러 원본과 비교하세요 · AI가 그린 예시라 실제 안경 크기·색·렌즈 도수와 다릅니다
      </Text>
      {tab > 0 && curUri && canDraw && curGen !== 'loading' && (
        <Pressable onPress={() => draw(tab)} style={{ alignSelf: 'center', marginBottom: 10 }}>
          <Text style={styles.redoText}>{tab}순위 착용 이미지 다시 그리기</Text>
        </Pressable>
      )}
      {tab > 0 && curUri && typeof curGen === 'string' && curGen !== 'loading' && (
        <Text style={styles.errorLine}>다시 그리기 실패: {curGen}</Text>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 공유용 카드 — 화면 밖에 원본 크기로 그려 두고 캡처만 한다 */}
      <View style={styles.offscreen} pointerEvents="none">
        <GlassesShareCard ref={shotRef} record={record} />
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: PAD, paddingBottom: 20 }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>맞춤 안경 추천</Text>
            <Text style={styles.subtitle}>{r.face_summary || r.photo_issue}</Text>
          </View>
          <View style={styles.headBadges}>
            <Text style={styles.purposeBadge}>{r.purpose}</Text>
            <Text style={styles.budgetBadge}>테 {formatWon(r.budget)} 이하</Text>
          </View>
        </View>

        {!r.photo_usable ? (
          <View style={[styles.statusCard, styles.statusError]}>
            <Icon name="camera-off-outline" size={24} color="#8B1A1A" />
            <Text style={[styles.statusText, { color: '#8B1A1A' }]}>
              사진을 판독하기 어렵습니다: {r.photo_issue || '사진 상태 확인 필요'}
              {'\n'}안경을 벗고 정면을 보며, 밝은 곳에서 얼굴 전체가 보이게 다시 찍어 주세요.
            </Text>
          </View>
        ) : (
          <>
            {!!r.photo_caution && (
              <View style={styles.statusCard}>
                <Icon name="alert-circle-outline" size={22} color="#9A4F00" />
                <Text style={[styles.statusText, { color: '#7A4B00' }]}>{r.photo_caution}</Text>
              </View>
            )}

            {tryOnBlock}

            {/* 얼굴 분석 */}
            <Section icon="face-recognition" title="얼굴 특징">
              <View style={styles.shapeRow}>
                <Text style={styles.shapeLabel}>얼굴형</Text>
                <Text style={styles.shapeValue}>{faceShapeLabel(r)}</Text>
              </View>
              {r.features.map((f, i) => (
                <View key={i} style={styles.feature}>
                  <Text style={styles.featurePart}>{f.part}</Text>
                  <Text style={styles.featureText}>{f.observation}</Text>
                </View>
              ))}
            </Section>

            {/* 추천 디자인 */}
            <Section icon="glasses" title="추천 안경 디자인" color={GLASSES_COLOR}>
              {recs.map((x) => (
                <View key={x.no} style={[styles.rec, x.no === 1 && styles.recTop]}>
                  <View style={styles.recHead}>
                    <NoBadge no={x.no} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recStyle}>{x.style}</Text>
                      <Text style={styles.recMeta}>{x.frame_type} · {x.colors}</Text>
                    </View>
                    {uriOf(x.no) ? (
                      <Pressable onPress={() => showTryOn(x.no)} hitSlop={6}>
                        <Image source={{ uri: uriOf(x.no) }} style={styles.recThumb} />
                      </Pressable>
                    ) : null}
                  </View>
                  {!!x.impression && <Text style={styles.impression}>“{x.impression}”</Text>}
                  <Text style={styles.reason}>{x.reason}</Text>
                  {!!x.fit_tip && (
                    <View style={styles.metaRow}>
                      <Icon name="ruler" size={15} color={C.muted} />
                      <Text style={styles.metaText}>{x.fit_tip}</Text>
                    </View>
                  )}
                  <View style={styles.recBottom}>
                    <Text style={styles.price}>
                      테 {formatRange(x.price_min, x.price_max)}
                      {x.over_budget ? <Text style={styles.over}>  예산 초과</Text> : null}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable onPress={() => showTryOn(x.no)} style={styles.smallBtn} hitSlop={6}>
                        <Icon name="account-eye-outline" size={15} color={GLASSES_COLOR} />
                        <Text style={styles.smallBtnText}>착용</Text>
                      </Pressable>
                      <Pressable onPress={() => shopSearch(x.search_keyword)} style={styles.smallBtn} hitSlop={6}>
                        <Icon name="magnify" size={15} color={GLASSES_COLOR} />
                        <Text style={styles.smallBtnText}>쇼핑 검색</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
              {r.avoid.length > 0 && (
                <View style={styles.avoid}>
                  <Text style={styles.avoidTitle}>이 얼굴에는 피하면 좋은 디자인</Text>
                  {r.avoid.map((a, i) => (
                    <Text key={i} style={styles.avoidText}>
                      ✕ <Text style={{ fontWeight: '900' }}>{a.style}</Text> — {a.reason}
                    </Text>
                  ))}
                </View>
              )}
            </Section>

            {/* 구매 방법 */}
            <Section icon="storefront-outline" title="구매 방법">
              <View style={styles.way}>
                <Icon name="web" size={20} color={C.navy} />
                <Text style={styles.wayText}>
                  <Text style={styles.wayBold}>온라인</Text> — 쇼핑 검색으로 테를 고른 뒤, 도수 렌즈가 필요하면
                  가까운 안경원에 렌즈 제작·피팅이 되는지 먼저 물어보세요.
                </Text>
              </View>
              <View style={styles.way}>
                <Icon name="store-outline" size={20} color={C.navy} />
                <Text style={styles.wayText}>
                  <Text style={styles.wayBold}>오프라인</Text> — 안경원에서 세 가지 형태를 직접 써 보고 테 폭·코받침·볼
                  닿음·안경다리 압박을 확인하세요.
                </Text>
              </View>
              <Pressable onPress={opticianSearch} style={styles.mapBtn}>
                <Icon name="map-marker-outline" size={18} color="white" />
                <Text style={styles.mapBtnText}>가까운 안경원 찾기</Text>
              </Pressable>

              {!!r.shop_request && (
                <View style={styles.request}>
                  <Text style={styles.requestTitle}>안경원에서 이렇게 말해 보세요</Text>
                  <Text style={styles.requestText} selectable>“{r.shop_request}”</Text>
                  <Pressable onPress={shareRequest} style={styles.requestBtn} hitSlop={6}>
                    <Icon name="share-variant-outline" size={15} color={GLASSES_COLOR} />
                    <Text style={styles.smallBtnText}>문장 보내기·저장</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.checks}>
                <Text style={styles.checksTitle}>구입 전 확인하세요</Text>
                {r.buy_checks.map((c, i) => (
                  <Text key={i} style={styles.checkText}>• {c}</Text>
                ))}
              </View>
            </Section>
          </>
        )}

        <Text style={styles.disclaimer}>{r.disclaimer}</Text>
        <Text style={styles.disclaimer}>
          분석일시 {formatDate(record.createdAt)} · 분석 모델 {record.model}
          {record.tryon1Model ? ` · 이미지 ${record.tryon1Model}` : ''}
        </Text>
      </ScrollView>

      {/* 크게 보기 */}
      <Modal visible={viewer} animationType="fade" onRequestClose={() => setViewer(false)} statusBarTranslucent>
        <Pressable style={styles.viewerBg} onPress={() => setViewer(false)}>
          <Text style={styles.viewerTitle}>{tab === 0 ? '원본 사진' : `${tab}순위 · ${curRec?.style} (AI 예시)`}</Text>
          {!!curUri && <Image source={{ uri: curUri }} style={{ width, height: winH * 0.8 }} resizeMode="contain" />}
          <Text style={styles.viewerClose}>화면을 누르면 닫힙니다</Text>
        </Pressable>
      </Modal>

      <View style={styles.bottomBar}>
        <Pressable style={[styles.btn, { backgroundColor: GLASSES_COLOR }]} onPress={share} disabled={sharing}>
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
  purposeBadge: {
    color: 'white', backgroundColor: GLASSES_COLOR, fontWeight: '900', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden',
  },
  budgetBadge: {
    color: GLASSES_COLOR, borderColor: GLASSES_COLOR, borderWidth: 1, fontWeight: '800', fontSize: 11,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },

  tabs: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tab: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: 'white',
  },
  tabOn: { borderColor: GLASSES_COLOR, backgroundColor: TINT },
  tabThumb: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.card },
  tabThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12, fontWeight: '800', color: C.muted },
  tabTextOn: { color: GLASSES_COLOR },

  stage: {
    borderRadius: 12, overflow: 'hidden', backgroundColor: '#1F2430', borderWidth: 1, borderColor: C.border,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  stageEmpty: { backgroundColor: TINT, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  stageText: { fontSize: 14, color: C.text, textAlign: 'center', fontWeight: '700', lineHeight: 20 },
  stageSub: { fontSize: 12, color: C.muted },
  aiTag: {
    position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '85%',
    backgroundColor: 'rgba(76,44,130,0.88)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  aiTagText: { color: 'white', fontSize: 12, fontWeight: '800' },
  zoomTag: { position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(17,24,39,0.55)', borderRadius: 14, padding: 5 },
  hint: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6, marginBottom: 8 },
  redoText: { fontSize: 13, color: GLASSES_COLOR, fontWeight: '700', textDecorationLine: 'underline' },
  errorLine: { fontSize: 12, color: '#8B1A1A', textAlign: 'center', marginBottom: 10 },
  retryBtn: { backgroundColor: GLASSES_COLOR, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  retryBtnText: { color: 'white', fontWeight: '800', fontSize: 13 },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF8E6', borderWidth: 1,
    borderColor: '#F0D9A0', borderRadius: 10, padding: 12, marginBottom: 10,
  },
  statusError: { backgroundColor: '#FDECEC', borderColor: '#F3B4B4' },
  statusText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },

  section: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14 },
  sectionTitle: { flex: 1, color: 'white', fontSize: 17, fontWeight: '900' },
  sectionBody: { padding: 10, gap: 8 },

  shapeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: TINT, borderRadius: 10, padding: 10 },
  shapeLabel: { fontSize: 13, fontWeight: '800', color: C.muted },
  shapeValue: { fontSize: 18, fontWeight: '900', color: GLASSES_COLOR },
  feature: { flexDirection: 'row', gap: 10, paddingHorizontal: 4 },
  featurePart: { width: 64, fontSize: 13, fontWeight: '900', color: C.navy },
  featureText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },

  rec: { backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10, gap: 4, borderWidth: 1.5, borderColor: 'transparent' },
  recTop: { borderColor: GLASSES_COLOR, backgroundColor: '#FAF8FE' },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recStyle: { fontSize: 16, fontWeight: '900', color: '#0F1F3A' },
  recMeta: { fontSize: 12, color: C.muted, marginTop: 1 },
  recThumb: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  impression: { fontSize: 13, color: GLASSES_COLOR, fontWeight: '800', marginTop: 2 },
  reason: { fontSize: 14, color: C.text, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1, fontSize: 12, color: C.muted },
  recBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 6 },
  price: { flexShrink: 1, fontSize: 14, fontWeight: '900', color: '#1F2937' },
  over: { fontSize: 11, color: '#C62828', fontWeight: '800' },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: '#D6C8F0',
    backgroundColor: 'white', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4,
  },
  smallBtnText: { fontSize: 12, fontWeight: '800', color: GLASSES_COLOR },
  avoid: { backgroundColor: '#FDF2F2', borderRadius: 10, padding: 10, gap: 3 },
  avoidTitle: { fontSize: 13, fontWeight: '900', color: '#8B1A1A', marginBottom: 2 },
  avoidText: { fontSize: 13, color: '#4B1F1F', lineHeight: 19 },

  way: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  wayText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
  wayBold: { fontWeight: '900', color: C.navy },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.navy,
    borderRadius: 10, paddingVertical: 10,
  },
  mapBtnText: { color: 'white', fontWeight: '800', fontSize: 14 },
  request: { backgroundColor: TINT, borderRadius: 10, padding: 12, gap: 6 },
  requestTitle: { fontSize: 13, fontWeight: '900', color: GLASSES_COLOR },
  requestText: { fontSize: 15, color: '#1F2937', lineHeight: 22, fontWeight: '600' },
  requestBtn: {
    alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: '#D6C8F0',
    backgroundColor: 'white', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4,
  },
  checks: { backgroundColor: '#FFF8E6', borderRadius: 10, padding: 10, gap: 2 },
  checksTitle: { fontSize: 13, fontWeight: '900', color: '#7A4B00', marginBottom: 2 },
  checkText: { fontSize: 13, color: '#3F2A00', lineHeight: 19 },

  disclaimer: { fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 16 },

  viewerBg: { flex: 1, backgroundColor: 'rgba(10,16,28,0.97)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  viewerTitle: { color: 'white', fontSize: 15, fontWeight: '800' },
  viewerClose: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  bottomBar: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: C.border },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { flex: 0.6, backgroundColor: C.card },
  btnText: { color: 'white', fontWeight: '800', fontSize: 15 },
});
