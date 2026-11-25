// 분석 결과 화면 — 첨부 예시처럼 "기존 사진 | AI 개선 예시"를 나란히 비교하고,
// 아래 칸에 현재 상태 진단·더 좋은 관리 방법을 보여준다.
// [이미지로 공유]는 화면 밖에 원본 크기로 그려 둔 인포그래픽(가로형 한 장)을 캡처해 보낸다.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import Infographic, { actionIcon, CATEGORY_ICONS, EMERGENCY_CHIPS, HL_BG, HL_FG } from '../components/Infographic.js';
import { AnalysisError, generatePoster } from '../openai.js';
import { LEVEL_UNUSABLE } from '../rules.js';
import { migrateImprovedImage, saveGeneratedImage } from '../storage.js';
import { C, LEVEL_COLORS, SEVERITY_COLORS, SEVERITY_TINTS } from '../theme.js';

const PAGE_PAD = 12;
const COL_GAP = 8;

function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 사진을 w×h 상자에 맞춰 그리고(cover=잘라 채움, 아니면 전체 보이게), 관찰 지점에 번호 표시를 얹는다.
 */
function PhotoView({ uri, pw, ph, w, h, cover, observations = [], r = 11 }) {
  const scale = cover ? Math.max(w / pw, h / ph) : Math.min(w / pw, h / ph);
  const dispW = pw * scale;
  const dispH = ph * scale;
  const offX = (w - dispW) / 2;
  const offY = (h - dispH) / 2;
  return (
    <View style={{ width: w, height: h, overflow: 'hidden', backgroundColor: cover ? '#DDE3EA' : 'transparent' }}>
      <Image source={{ uri }} style={{ position: 'absolute', left: offX, top: offY, width: dispW, height: dispH }} />
      {observations.map((o) => {
        const x = Math.min(Math.max(offX + o.x * dispW, r + 2), w - r - 2);
        const y = Math.min(Math.max(offY + o.y * dispH, r + 2), h - r - 2);
        return (
          <View
            key={o.no}
            style={[styles.marker, { left: x - r - 2, top: y - r - 2, width: r * 2 + 4, height: r * 2 + 4, borderRadius: r + 2 }]}
          >
            <View style={[styles.markerIn, { width: r * 2, height: r * 2, borderRadius: r, backgroundColor: SEVERITY_COLORS[o.severity] }]}>
              <Text style={[styles.markerText, { fontSize: r * 1.1 }]}>{o.no}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ItemRow({ no, icon, iconColor, iconBg, sentence, highlight, hlBg, hlColor, tag }) {
  return (
    <View style={styles.item}>
      <View style={[styles.itemIcon, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={24} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.itemHead}>
          <Text style={styles.itemText}>
            <Text style={styles.itemNo}>{no}. </Text>
            {sentence}
          </Text>
          {tag}
        </View>
        {!!highlight && (
          <View style={[styles.hl, { backgroundColor: hlBg }]}>
            <Text style={[styles.hlText, { color: hlColor }]}>{highlight}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Panel({ title, color, right, children }) {
  return (
    <View style={styles.panel}>
      <View style={[styles.panelHead, { backgroundColor: color }]}>
        <Text style={styles.panelHeadText}>{title}</Text>
        {right}
      </View>
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

export default function ResultScreen({ record, apiKey, onBack, onDelete, onUpdate }) {
  const { width, height: winH } = useWindowDimensions();
  const shotRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [viewer, setViewer] = useState(null); // 'poster' | 'before' | 'after' | null
  const [showDetail, setShowDetail] = useState(false);
  const r = record.result;
  const levelColor = LEVEL_COLORS[r.level];
  const canImprove = r.photo_usable && !!apiKey;
  const [improve, setImprove] = useState({ state: 'idle', error: '' }); // idle | loading | error

  // 안전관리 가이드 포스터(개선 예시 사진 포함)를 이미지 AI로 그린다
  async function makePoster() {
    if (!canImprove || improve.state === 'loading') return;
    setImprove({ state: 'loading', error: '' });
    try {
      const { base64, model } = await generatePoster(record.photoUri, r, apiKey);
      const updated = await saveGeneratedImage(record.id, 'poster', base64, model);
      setImprove({ state: 'idle', error: '' });
      if (updated) onUpdate(updated);
    } catch (e) {
      const msg = e instanceof AnalysisError ? e.message : `예상하지 못한 오류: ${e?.message || e}`;
      setImprove({ state: 'error', error: msg });
    }
  }

  // 포스터가 없으면 자동으로 만들고, 이전 버전에서 PNG로 저장된 개선 예시는 JPEG로 바꾼다
  useEffect(() => {
    if (record.improvedUri && !record.improvedUri.endsWith('.jpg')) {
      migrateImprovedImage(record).then((u) => u && onUpdate(u)).catch(() => {});
    }
    if (canImprove && !record.posterUri) makePoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function share() {
    if (improve.state === 'loading') {
      Alert.alert('잠시만요', '안전관리 가이드 포스터를 그리는 중입니다. 완성된 뒤 공유하면 포스터가 공유됩니다.', [
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
      // AI 포스터가 있으면 그대로, 없으면 앱이 그린 인포그래픽을 캡처해 공유
      const uri = record.posterUri || (await captureRef(shotRef, { format: 'png', quality: 1 }));
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('공유 불가', '이 기기에서는 공유 기능을 사용할 수 없습니다.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: uri.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
        dialogTitle: '화재안전 점검 결과 공유',
      });
    } catch (e) {
      Alert.alert('공유 실패', String(e?.message || e));
    } finally {
      setSharing(false);
    }
  }

  function confirmDelete() {
    Alert.alert('기록 삭제', '이 분석 기록과 사진을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(record.id) },
    ]);
  }

  // 비교 사진 크기: 두 칸 같은 크기, 원본 비율(너무 길면 잘라냄)
  const colW = (width - PAGE_PAD * 2 - COL_GAP) / 2;
  const aspect = Math.min(Math.max(record.photoHeight / record.photoWidth, 0.8), 1.45);
  const photoH = colW * aspect;
  const actions = r.actions.length
    ? r.actions
    : [{ title: '정기적으로 직접 점검', detail: '전선 손상·변색·먼지·주변 가연물을 눈으로 확인하세요.' }];
  const title = r.scene_summary ? `${r.scene_summary}` : '전기 화재안전 점검 결과';

  // 이전 버전에서 만든 개선 예시 사진이 있으면 나란히 비교, 없으면 원본만 크게
  const hasAfter = !!record.improvedUri;
  const beforeW = hasAfter ? colW : width - PAGE_PAD * 2 - 2;
  const beforeH = hasAfter ? photoH : beforeW * aspect;
  const posterW = width - PAGE_PAD * 2;
  const posterH = posterW * ((record.posterInfo?.height || 1536) / (record.posterInfo?.width || 1024));

  let posterBlock = null;
  if (record.posterUri) {
    posterBlock = (
      <>
        <Pressable onPress={() => setViewer('poster')} style={styles.poster}>
          <Image source={{ uri: record.posterUri }} style={{ width: posterW, height: posterH }} />
          <View style={styles.zoomTag}>
            <Icon name="magnify-plus-outline" size={18} color="white" />
          </View>
        </Pressable>
        <Text style={styles.hint}>
          누르면 크게 볼 수 있습니다 · AI가 그린 포스터라 글자가 틀릴 수 있으니 아래 상세 내용과 함께 확인하세요
        </Text>
        {improve.state === 'loading' ? (
          <View style={styles.redrawing}>
            <ActivityIndicator size="small" color={C.blue} />
            <Text style={styles.redrawingText}>포스터를 다시 그리는 중… (1~2분)</Text>
          </View>
        ) : improve.state === 'error' ? (
          <View style={[styles.statusCard, styles.statusError]}>
            <Text style={[styles.statusText, { color: '#8B1A1A' }]}>다시 그리기 실패: {improve.error}</Text>
          </View>
        ) : (
          canImprove && (
            <Pressable onPress={makePoster} style={{ alignSelf: 'center', marginBottom: 10 }}>
              <Text style={styles.redoText}>포스터 다시 그리기 (글자가 틀렸을 때)</Text>
            </Pressable>
          )
        )}
        <Pressable onPress={() => setShowDetail((v) => !v)} style={styles.detailToggle}>
          <Text style={styles.detailToggleText}>{showDetail ? '상세 내용 접기 ▲' : '상세 내용 보기 ▼'}</Text>
        </Pressable>
      </>
    );
  } else if (improve.state === 'loading') {
    posterBlock = (
      <View style={styles.statusCard}>
        <ActivityIndicator color={C.blue} />
        <Text style={styles.statusText}>
          안전관리 가이드 포스터를 그리는 중입니다 (1~2분).{'\n'}그동안 아래 분석 내용을 먼저 확인하세요.
        </Text>
      </View>
    );
  } else if (improve.state === 'error') {
    posterBlock = (
      <View style={[styles.statusCard, styles.statusError]}>
        <Icon name="image-off-outline" size={24} color="#8B1A1A" />
        <Text style={[styles.statusText, { color: '#8B1A1A' }]}>포스터를 그리지 못했습니다: {improve.error}</Text>
        <Pressable onPress={makePoster} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  } else if (r.photo_usable && !apiKey) {
    posterBlock = (
      <View style={styles.statusCard}>
        <Text style={styles.statusText}>설정에서 API 키를 입력하면 안전관리 가이드 포스터를 그립니다.</Text>
      </View>
    );
  }
  const detailVisible = !record.posterUri || showDetail;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 공유용 인포그래픽 — 화면 밖에 원본 크기로 그려 두고 캡처만 한다 */}
      <View style={styles.offscreen} pointerEvents="none">
        <Infographic ref={shotRef} record={record} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: PAGE_PAD, paddingBottom: 20 }}>
        {/* AI가 그린 안전관리 가이드 포스터 */}
        {posterBlock}

        {detailVisible && (
        <>
        {/* 제목 + 종합 판정 */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{r.level_message}</Text>
          </View>
          <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
            <Icon name="alert" size={14} color="white" />
            <Text style={styles.levelBadgeText}>{r.level === LEVEL_UNUSABLE ? r.level : `위험도: ${r.level}`}</Text>
          </View>
        </View>

        {r.urgent_visible && (
          <View style={styles.urgent}>
            <Icon name="alert-octagon" size={20} color="white" />
            <Text style={styles.urgentText}>즉시 사용 중지 징후: {r.urgent_detail || '사진 확인 필요'}</Text>
          </View>
        )}

        {/* 현재 사진 (이전 버전의 개선 예시가 있으면 나란히 비교) */}
        <View style={styles.compare}>
          <View style={[styles.compareCol, { width: beforeW }]}>
            <View style={[styles.compareHead, { backgroundColor: C.navy }]}>
              <Text style={styles.compareHeadText}>현재 상태</Text>
            </View>
            <Pressable onPress={() => setViewer('before')}>
              <PhotoView
                uri={record.photoUri} pw={record.photoWidth} ph={record.photoHeight}
                w={beforeW} h={beforeH} cover observations={r.observations}
              />
              <View style={styles.zoomTag}>
                <Icon name="magnify-plus-outline" size={16} color="white" />
              </View>
            </Pressable>
          </View>
          {hasAfter && (
            <View style={[styles.compareCol, { width: colW }]}>
              <View style={[styles.compareHead, { backgroundColor: C.blue }]}>
                <Text style={styles.compareHeadText}>개선 예시</Text>
              </View>
              <Pressable onPress={() => setViewer('after')}>
                <PhotoView
                  uri={record.improvedUri} pw={record.improvedInfo?.width || 1024}
                  ph={record.improvedInfo?.height || 1024} w={colW} h={photoH} cover
                />
                <View style={styles.aiTag}>
                  <Icon name="creation" size={12} color="white" />
                  <Text style={styles.aiTagText}>AI 예시</Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>
        <Text style={styles.hint}>사진을 누르면 크게 볼 수 있습니다</Text>

        {/* 현재 상태 진단 */}
        <Panel title="현재 상태 진단" color={C.navy}>
          {!r.photo_usable ? (
            <View style={styles.note}>
              <Text style={styles.noteTitle}>판독이 어렵습니다: {r.photo_issue || '사진 상태 확인 필요'}</Text>
              <Text style={styles.noteText}>밝은 곳에서 대상이 화면에 크게 보이도록 다시 촬영해 주세요.</Text>
            </View>
          ) : r.observations.length === 0 ? (
            <View style={styles.note}>
              <Text style={styles.noteTitle}>사진상 뚜렷한 위험 후보를 찾지 못했습니다</Text>
              <Text style={styles.noteText}>안전 확인은 아니므로 직접 점검을 함께 하세요.</Text>
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
                  <Text style={[styles.sevTag, { color: SEVERITY_COLORS[o.severity], borderColor: SEVERITY_COLORS[o.severity] }]}>
                    {o.severity}
                  </Text>
                }
              />
            ))
          )}
        </Panel>

        {/* 더 좋은 관리 방법 */}
        <Panel title="더 좋은 관리 방법" color={C.blue}>
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
          <View style={styles.cannot}>
            <View style={styles.cannotHead}>
              <Icon name="eye-off-outline" size={18} color={C.navy} />
              <Text style={styles.cannotTitle}>사진으로 확인할 수 없는 것</Text>
            </View>
            <View style={styles.chips}>
              {r.cannot_verify.map((c) => (
                <Text key={c} style={styles.chip}>
                  {c}
                </Text>
              ))}
            </View>
            <Text style={styles.cannotNote}>→ 직접 확인하거나 시설 담당자 점검이 필요합니다.</Text>
          </View>
        </Panel>

        {/* 즉시 점검 포인트 */}
        <View style={styles.emergency}>
          <View style={styles.emergencyHead}>
            <Icon name="magnify" size={20} color="white" />
            <Text style={styles.emergencyHeadText}>즉시 점검 포인트</Text>
          </View>
          <View style={styles.emChips}>
            {EMERGENCY_CHIPS.map(([icon, text]) => (
              <View key={text} style={styles.emChip}>
                <Icon name={icon} size={18} color="#B45309" />
                <Text style={styles.emChipText}>{text}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.emBar}>{r.emergency_notice}</Text>
        </View>
        </>
        )}

        <Text style={styles.disclaimer}>{r.disclaimer}</Text>
        <Text style={styles.disclaimer}>
          분석일시 {formatDate(record.createdAt)} · 분석 모델 {record.model}
          {record.posterModel ? ` · 포스터 ${record.posterModel}` : ''}
        </Text>
      </ScrollView>

      {/* 포스터 크게 보기 — 가로·세로로 밀어서 읽는다 */}
      <Modal visible={viewer === 'poster'} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={styles.viewerBgPlain}>
          <ScrollView contentContainerStyle={{ paddingVertical: 50 }}>
            <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: 6 }}>
              {!!record.posterUri && (
                <Image
                  source={{ uri: record.posterUri }}
                  style={{ width: width * 2, height: width * 2 * (posterH / posterW) }}
                />
              )}
            </ScrollView>
          </ScrollView>
          <Pressable style={styles.viewerCloseBtn} onPress={() => setViewer(null)}>
            <Text style={styles.viewerCloseBtnText}>닫기 ✕</Text>
          </Pressable>
        </View>
      </Modal>

      {/* 사진 크게 보기 */}
      <Modal
        visible={viewer === 'before' || viewer === 'after'}
        animationType="fade"
        onRequestClose={() => setViewer(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.viewerBg} onPress={() => setViewer(null)}>
          <Text style={styles.viewerTitle}>
            {viewer === 'after' ? '개선 예시 (AI가 그린 그림 · 실제 사진 아님)' : '현재 상태 (촬영 사진)'}
          </Text>
          {viewer === 'before' && (
            <PhotoView
              uri={record.photoUri} pw={record.photoWidth} ph={record.photoHeight}
              w={width} h={winH * 0.8} observations={r.observations} r={15}
            />
          )}
          {viewer === 'after' && record.improvedUri && (
            <PhotoView
              uri={record.improvedUri} pw={record.improvedInfo?.width || 1024} ph={record.improvedInfo?.height || 1024}
              w={width} h={winH * 0.8}
            />
          )}
          <Text style={styles.viewerClose}>화면을 누르면 닫힙니다</Text>
        </Pressable>
      </Modal>

      <View style={styles.bottomBar}>
        <Pressable style={[styles.btn, { backgroundColor: C.blue }]} onPress={share} disabled={sharing}>
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

  poster: {
    borderRadius: 10, overflow: 'hidden', backgroundColor: 'white', borderWidth: 1, borderColor: C.border,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E8F0FB', borderWidth: 1,
    borderColor: '#BFD3EE', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  statusError: { backgroundColor: '#FDECEC', borderColor: '#F3B4B4' },
  statusText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
  detailToggle: {
    alignSelf: 'stretch', alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingVertical: 11, marginBottom: 12,
  },
  detailToggleText: { fontSize: 14, fontWeight: '800', color: C.navy },
  viewerBgPlain: { flex: 1, backgroundColor: 'rgba(10,16,28,0.97)' },
  viewerCloseBtn: {
    position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  viewerCloseBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '900', color: '#0F1F3A', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 8, marginTop: 2,
  },
  levelBadgeText: { color: 'white', fontSize: 12, fontWeight: '900' },
  urgent: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#D32F2F',
    borderRadius: 10, padding: 10, marginBottom: 10,
  },
  urgentText: { color: 'white', fontWeight: '800', fontSize: 14, flex: 1 },

  compare: { flexDirection: 'row', gap: COL_GAP },
  compareCol: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  compareHead: { paddingVertical: 8, alignItems: 'center' },
  compareHeadText: { color: 'white', fontSize: 15, fontWeight: '900' },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8F0FB', padding: 8 },
  placeholderText: { fontSize: 12, color: C.text, textAlign: 'center', lineHeight: 17 },
  retryBtn: { backgroundColor: C.blue, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retryBtnText: { color: 'white', fontWeight: '800', fontSize: 12 },
  aiTag: {
    position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(17,24,39,0.72)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  aiTagText: { color: 'white', fontSize: 11, fontWeight: '800' },
  zoomTag: {
    position: 'absolute', right: 6, top: 6, backgroundColor: 'rgba(17,24,39,0.55)', borderRadius: 12, padding: 4,
  },
  hint: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6, marginBottom: 8 },
  redoText: { fontSize: 13, color: C.blue, fontWeight: '700', textDecorationLine: 'underline' },
  redrawing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 },
  redrawingText: { fontSize: 12, color: C.blue, fontWeight: '700' },

  marker: { position: 'absolute', backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  markerIn: { alignItems: 'center', justifyContent: 'center' },
  markerText: { color: 'white', fontWeight: '900' },

  panel: {
    backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', borderWidth: 1,
    borderColor: C.border, marginTop: 4, marginBottom: 10,
  },
  panelHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 14,
  },
  panelHeadText: { color: 'white', fontSize: 17, fontWeight: '900' },
  panelBody: { padding: 10, gap: 8 },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F7FA',
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10,
  },
  itemIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  itemText: { flex: 1, fontSize: 14, color: '#1F2937', lineHeight: 20 },
  itemNo: { fontWeight: '900', color: '#0F1F3A' },
  sevTag: {
    fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1, marginTop: 1,
  },
  hl: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  hlText: { fontSize: 15, fontWeight: '900' },

  note: { backgroundColor: '#F5F7FA', borderRadius: 10, padding: 12 },
  noteTitle: { fontSize: 15, fontWeight: '800', color: '#374151' },
  noteText: { fontSize: 13, color: C.muted, marginTop: 4 },

  cannot: { borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', borderRadius: 10, padding: 10, marginTop: 2 },
  cannotHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cannotTitle: { fontSize: 14, fontWeight: '900', color: C.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 12, fontWeight: '700', color: '#374151', backgroundColor: '#EEF2F7',
    borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden',
  },
  cannotNote: { fontSize: 12, color: C.muted, marginTop: 8 },

  emergency: {
    backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: C.border,
    padding: 10, gap: 8, marginBottom: 10,
  },
  emergencyHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.navy,
    alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  emergencyHeadText: { color: 'white', fontSize: 15, fontWeight: '900' },
  emChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF8E6',
    borderWidth: 1.5, borderColor: '#F2C14E', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 8,
  },
  emChipText: { fontSize: 13, fontWeight: '900', color: '#3F2A00' },
  emBar: {
    backgroundColor: '#FDEDB8', borderRadius: 8, padding: 8, fontSize: 13, color: '#1F2937', lineHeight: 18,
  },

  disclaimer: { fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 16 },

  viewerBg: { flex: 1, backgroundColor: 'rgba(10,16,28,0.97)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  viewerTitle: { color: 'white', fontSize: 15, fontWeight: '800' },
  viewerClose: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  bottomBar: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: C.border },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { flex: 0.6, backgroundColor: C.card },
  btnText: { color: 'white', fontWeight: '800', fontSize: 15 },
});
