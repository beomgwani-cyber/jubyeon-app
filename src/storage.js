// 휴대폰 안에만 저장: API 키·모델 설정, 분석 이력(사진 + 결과).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { DEFAULT_MODEL } from './openai.js';

const KEY_API = 'fireguard.apiKey';
const KEY_MODEL = 'fireguard.model';
const MAX_HISTORY = 30;

// 기능별 기록 저장소 (fire = 화재안전 지킴이, desk = 책상정리 개선, glasses = 맞춤 안경 추천)
const STORES = {
  fire: { key: 'fireguard.history', dir: 'history' },
  desk: { key: 'desk.history', dir: 'desk_history' },
  glasses: { key: 'glasses.history', dir: 'glasses_history' },
};

export async function loadSettings() {
  const [apiKey, model] = await Promise.all([AsyncStorage.getItem(KEY_API), AsyncStorage.getItem(KEY_MODEL)]);
  return { apiKey: apiKey || '', model: model || DEFAULT_MODEL };
}

export async function saveSettings({ apiKey, model }) {
  if (apiKey) await AsyncStorage.setItem(KEY_API, apiKey.trim());
  else await AsyncStorage.removeItem(KEY_API);
  await AsyncStorage.setItem(KEY_MODEL, (model || DEFAULT_MODEL).trim());
}

function historyDir(ns = 'fire') {
  const dir = new Directory(Paths.document, STORES[ns].dir);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// 기록에 연결된 모든 이미지 파일 (photoUri, posterUri, afterUri …)
function recordFiles(r) {
  return Object.keys(r).filter((k) => k.endsWith('Uri') && r[k]).map((k) => r[k]);
}

export async function loadHistory(ns = 'fire') {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(STORES[ns].key)) || '[]');
    // 사진 파일이 지워진 기록은 제외
    return list.filter((r) => new File(r.photoUri).exists);
  } catch {
    return [];
  }
}

/** 분석에 사용한 사진(캐시)을 앱 문서 폴더로 옮기고 기록을 저장한다. */
export async function addHistory({ id, tempPhotoUri, photoWidth, photoHeight, model, raw, result, ...extra }, ns = 'fire') {
  const dest = new File(historyDir(ns), `${id}.jpg`);
  new File(tempPhotoUri).copy(dest);
  const record = {
    id,
    createdAt: new Date().toISOString(),
    photoUri: dest.uri,
    photoWidth,
    photoHeight,
    model,
    raw,
    result,
    ...extra,
  };
  const list = await loadHistory(ns);
  const next = [record, ...list];
  for (const old of next.slice(MAX_HISTORY)) recordFiles(old).forEach(deletePhoto);
  await AsyncStorage.setItem(STORES[ns].key, JSON.stringify(next.slice(0, MAX_HISTORY)));
  return record;
}

/**
 * 이미지 파일을 디코딩해 JPEG로 다시 저장한다.
 * 디코딩이 안 되는(표시할 수 없는) 파일이면 여기서 오류가 나므로 검증도 겸한다.
 */
async function toJpeg(srcUri, id, kind, ns = 'fire') {
  const ref = await ImageManipulator.manipulate(srcUri).renderAsync();
  // 포스터는 글자가 많아 화질을 높게 저장
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: kind === 'poster' ? 0.95 : 0.88 });
  const dest = new File(historyDir(ns), `${id}_${kind}_${Date.now()}.jpg`);
  new File(out.uri).copy(dest);
  deletePhoto(out.uri);
  return { uri: dest.uri, width: out.width, height: out.height, bytes: dest.size };
}

/** 기록 한 건의 필드를 바꿔 저장하고, 바뀐 기록을 반환한다. */
export async function updateRecord(id, changes, ns = 'fire') {
  const list = await loadHistory(ns);
  let updated = null;
  const next = list.map((r) => {
    if (r.id !== id) return r;
    updated = { ...r, ...(typeof changes === 'function' ? changes(r) : changes) };
    return updated;
  });
  await AsyncStorage.setItem(STORES[ns].key, JSON.stringify(next));
  return updated;
}

/**
 * 기록에 생성 이미지를 연결한다.
 * kind: 'improved'(개선 예시) | 'poster'(포스터) | 'after'(책상 정리 후) | 'tryon1'~'tryon3'(안경 착용 예시)
 */
async function attachImage(id, kind, info, imageModel, ns = 'fire') {
  return updateRecord(
    id,
    (r) => {
      const old = r[`${kind}Uri`];
      if (old && old !== info.uri) deletePhoto(old);
      return {
        [`${kind}Uri`]: info.uri,
        [`${kind}Model`]: imageModel || r[`${kind}Model`],
        [`${kind}Info`]: { width: info.width, height: info.height, bytes: info.bytes },
      };
    },
    ns,
  );
}

/** AI가 만든 이미지(base64)를 검증·JPEG 변환 후 저장하고 기록에 연결한다. */
export async function saveGeneratedImage(id, kind, base64, imageModel, ns = 'fire') {
  const tmp = new File(Paths.cache, `${kind}_${id}_${Date.now()}.png`);
  tmp.write(base64, { encoding: 'base64' });
  if (!tmp.exists || !tmp.size) throw new Error('생성된 이미지를 저장하지 못했습니다.');
  try {
    const info = await toJpeg(tmp.uri, id, kind, ns);
    return await attachImage(id, kind, info, imageModel, ns);
  } catch (e) {
    throw new Error(`생성된 이미지 파일을 열 수 없습니다 (${tmp.size} bytes): ${e?.message || e}`);
  } finally {
    deletePhoto(tmp.uri);
  }
}

/** 이전 버전에서 PNG로 저장된 개선 예시를 JPEG로 바꾼다 (API 호출 없음). */
export async function migrateImprovedImage(record) {
  const info = await toJpeg(record.improvedUri, record.id, 'improved');
  return attachImage(record.id, 'improved', info, record.improvedModel);
}

export async function deleteHistory(id, ns = 'fire') {
  const list = await loadHistory(ns);
  const target = list.find((r) => r.id === id);
  if (target) recordFiles(target).forEach(deletePhoto);
  await AsyncStorage.setItem(STORES[ns].key, JSON.stringify(list.filter((r) => r.id !== id)));
}

function deletePhoto(uri) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // 이미 없는 파일은 무시
  }
}
