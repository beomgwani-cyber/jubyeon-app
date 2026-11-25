import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { AnalysisError, analyzeDesk, analyzeGlasses, analyzePhoto } from './src/openai.js';
import { normalize } from './src/rules.js';
import { addHistory, deleteHistory, loadHistory, loadSettings, saveSettings } from './src/storage.js';
import { normalizeDesk } from './src/desk/rules.js';
import { DEFAULT_BUDGET } from './src/desk/schema.js';
import DeskHomeScreen from './src/desk/DeskHomeScreen.js';
import DeskResultScreen from './src/desk/DeskResultScreen.js';
import { normalizeGlasses } from './src/glasses/rules.js';
import { DEFAULT_BUDGET as GLASSES_BUDGET, DEFAULT_MOOD, DEFAULT_PURPOSE } from './src/glasses/schema.js';
import GlassesHomeScreen from './src/glasses/GlassesHomeScreen.js';
import GlassesResultScreen from './src/glasses/GlassesResultScreen.js';
import { C } from './src/theme.js';
import HomeScreen from './src/screens/HomeScreen.js';
import ResultScreen from './src/screens/ResultScreen.js';
import MenuScreen from './src/screens/MenuScreen.js';
import SettingsScreen from './src/screens/SettingsScreen.js';
import WebPreview, { isWebPreview } from './src/WebPreview.js';

const MAX_SIDE = 1568; // API로 보낼 사진의 긴 변 최대 픽셀

/** 사진을 줄이고 JPEG(base64)로 만든다. */
async function prepareImage(asset) {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const ref = await ctx.renderAsync();
  return ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
}

export default function App() {
  if (isWebPreview()) return <WebPreview />;
  return <MainApp />;
}

function MainApp() {
  // menu | home(화재안전 지킴이) | result | desk(책상정리 개선) | deskResult | glasses(맞춤 안경) | glassesResult | settings
  const [screen, setScreen] = useState('menu');
  const [settingsFrom, setSettingsFrom] = useState('menu'); // 설정을 닫으면 돌아갈 화면
  const [settings, setSettings] = useState({ apiKey: '', model: '' });
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [deskHistory, setDeskHistory] = useState([]);
  const [deskCurrent, setDeskCurrent] = useState(null);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [glassesHistory, setGlassesHistory] = useState([]);
  const [glassesCurrent, setGlassesCurrent] = useState(null);
  const [glassesPrefs, setGlassesPrefs] = useState({
    purpose: DEFAULT_PURPOSE, budget: GLASSES_BUDGET, mood: DEFAULT_MOOD,
  });
  const [busy, setBusy] = useState(null); // null | 'fire' | 'desk' | 'glasses' (분석 중인 기능)

  useEffect(() => {
    loadSettings().then(setSettings);
    loadHistory().then(setHistory);
    loadHistory('desk').then(setDeskHistory);
    loadHistory('glasses').then(setGlassesHistory);
  }, []);

  function openSettings(from) {
    setSettingsFrom(from);
    setScreen('settings');
  }

  // 안드로이드 뒤로가기: 결과 → 화재안전 지킴이 → 메뉴 → 앱 종료, 설정 → 연 화면
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy) return true;
      const parent = {
        result: 'home', home: 'menu', deskResult: 'desk', desk: 'menu',
        glassesResult: 'glasses', glasses: 'menu', settings: settingsFrom,
      }[screen];
      if (parent) {
        setScreen(parent);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen, busy, settingsFrom]);

  // kind: 'fire'(화재안전 지킴이) | 'desk'(책상정리 개선) | 'glasses'(맞춤 안경 추천)
  const runAnalysis = useCallback(
    async (source, kind = 'fire') => {
      if (!settings.apiKey) {
        Alert.alert('API 키 필요', '설정에서 ChatGPT API 키를 먼저 입력하세요.');
        openSettings(kind === 'fire' ? 'home' : kind);
        return;
      }
      const options = { mediaTypes: ['images'], quality: 1 };
      let picked;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('카메라 권한 필요', '휴대폰 설정에서 이 앱의 카메라 권한을 허용해 주세요.');
          return;
        }
        picked = await ImagePicker.launchCameraAsync(options);
      } else {
        picked = await ImagePicker.launchImageLibraryAsync(options);
      }
      if (picked.canceled || !picked.assets?.length) return;

      setBusy(kind);
      try {
        const img = await prepareImage(picked.assets[0]);
        const base = { id: String(Date.now()), tempPhotoUri: img.uri, photoWidth: img.width, photoHeight: img.height };
        if (kind === 'desk') {
          const { raw, model } = await analyzeDesk(img.base64, budget, settings.apiKey, settings.model);
          const record = await addHistory({ ...base, model, raw, result: normalizeDesk(raw, budget) }, 'desk');
          setDeskHistory(await loadHistory('desk'));
          setDeskCurrent(record);
          setScreen('deskResult');
        } else if (kind === 'glasses') {
          const prefs = glassesPrefs;
          const { raw, model } = await analyzeGlasses(img.base64, prefs, settings.apiKey, settings.model);
          const record = await addHistory({ ...base, model, raw, prefs, result: normalizeGlasses(raw, prefs) }, 'glasses');
          setGlassesHistory(await loadHistory('glasses'));
          setGlassesCurrent(record);
          setScreen('glassesResult');
        } else {
          const { raw, model } = await analyzePhoto(img.base64, settings.apiKey, settings.model);
          const record = await addHistory({ ...base, model, raw, result: normalize(raw) });
          setHistory(await loadHistory());
          setCurrent(record);
          setScreen('result');
        }
      } catch (e) {
        const msg = e instanceof AnalysisError ? e.message : `예상하지 못한 오류: ${e?.message || e}`;
        Alert.alert('분석 실패', msg);
      } finally {
        setBusy(null);
      }
    },
    [settings, budget, glassesPrefs],
  );

  async function handleSaveSettings(next) {
    await saveSettings(next);
    setSettings(await loadSettings());
  }

  async function handleDelete(id) {
    await deleteHistory(id);
    setHistory(await loadHistory());
    setScreen('home');
  }

  async function handleDeskDelete(id) {
    await deleteHistory(id, 'desk');
    setDeskHistory(await loadHistory('desk'));
    setScreen('desk');
  }

  async function handleGlassesDelete(id) {
    await deleteHistory(id, 'glasses');
    setGlassesHistory(await loadHistory('glasses'));
    setScreen('glasses');
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {screen === 'menu' && (
          <MenuScreen
            onSelect={(key) => setScreen({ fire: 'home', desk: 'desk', glasses: 'glasses' }[key] || 'menu')}
            onSettings={() => openSettings('menu')}
          />
        )}
        {screen === 'home' && (
          <HomeScreen
            hasKey={!!settings.apiKey}
            history={history}
            onCapture={() => runAnalysis('camera')}
            onPick={() => runAnalysis('library')}
            onOpen={(r) => {
              setCurrent(r);
              setScreen('result');
            }}
            onSettings={() => openSettings('home')}
            onMenu={() => setScreen('menu')}
          />
        )}
        {screen === 'result' && current && (
          <ResultScreen
            key={current.id}
            record={current}
            apiKey={settings.apiKey}
            onBack={() => setScreen('home')}
            onDelete={handleDelete}
            onUpdate={async (r) => {
              setCurrent((c) => (c?.id === r.id ? r : c));
              setHistory(await loadHistory());
            }}
          />
        )}
        {screen === 'desk' && (
          <DeskHomeScreen
            hasKey={!!settings.apiKey}
            budget={budget}
            onBudget={setBudget}
            history={deskHistory}
            onCapture={() => runAnalysis('camera', 'desk')}
            onPick={() => runAnalysis('library', 'desk')}
            onOpen={(r) => {
              setDeskCurrent(r);
              setScreen('deskResult');
            }}
            onSettings={() => openSettings('desk')}
            onMenu={() => setScreen('menu')}
          />
        )}
        {screen === 'deskResult' && deskCurrent && (
          <DeskResultScreen
            key={deskCurrent.id}
            record={deskCurrent}
            apiKey={settings.apiKey}
            onBack={() => setScreen('desk')}
            onDelete={handleDeskDelete}
            onUpdate={async (r) => {
              setDeskCurrent((c) => (c?.id === r.id ? r : c));
              setDeskHistory(await loadHistory('desk'));
            }}
          />
        )}
        {screen === 'glasses' && (
          <GlassesHomeScreen
            hasKey={!!settings.apiKey}
            prefs={glassesPrefs}
            onPrefs={setGlassesPrefs}
            history={glassesHistory}
            onCapture={() => runAnalysis('camera', 'glasses')}
            onPick={() => runAnalysis('library', 'glasses')}
            onOpen={(r) => {
              setGlassesCurrent(r);
              setScreen('glassesResult');
            }}
            onSettings={() => openSettings('glasses')}
            onMenu={() => setScreen('menu')}
          />
        )}
        {screen === 'glassesResult' && glassesCurrent && (
          <GlassesResultScreen
            key={glassesCurrent.id}
            record={glassesCurrent}
            apiKey={settings.apiKey}
            onBack={() => setScreen('glasses')}
            onDelete={handleGlassesDelete}
            onUpdate={async (r) => {
              setGlassesCurrent((c) => (c?.id === r.id ? r : c));
              setGlassesHistory(await loadHistory('glasses'));
            }}
          />
        )}
        {screen === 'settings' && (
          <SettingsScreen settings={settings} onSave={handleSaveSettings} onBack={() => setScreen(settingsFrom)} />
        )}

        {busy && (
          <View style={styles.overlay}>
            <View style={styles.overlayBox}>
              <ActivityIndicator size="large" color={C.navy} />
              <Text style={styles.overlayTitle}>
                {busy === 'desk'
                  ? '책상 정리안을 만드는 중입니다'
                  : busy === 'glasses'
                    ? '얼굴형을 분석하고 안경을 고르는 중입니다'
                    : '사진을 분석하는 중입니다'}
              </Text>
              <Text style={styles.overlayText}>30초~1분 정도 걸립니다. 앱을 닫지 마세요.</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center' },
  overlayBox: { backgroundColor: 'white', borderRadius: 16, padding: 24, alignItems: 'center', width: '80%' },
  overlayTitle: { fontSize: 17, fontWeight: '800', color: C.navy, marginTop: 14 },
  overlayText: { fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center' },
});
