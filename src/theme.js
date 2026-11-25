import { LEVEL_CAUTION, LEVEL_DANGER, LEVEL_NONE_SEEN, LEVEL_UNUSABLE } from './rules.js';

export const C = {
  bg: '#EEF2F7',
  panel: '#FFFFFF',
  border: '#D5DDE8',
  card: '#F4F6F9',
  navy: '#1B365D',
  blue: '#2563A8',
  text: '#1F2937',
  muted: '#6B7280',
};

export const SEVERITY_COLORS = { '위험 의심': '#D32F2F', 주의: '#E08A00', 참고: '#2563A8' };
export const SEVERITY_TINTS = { '위험 의심': '#FDECEC', 주의: '#FFF4E0', 참고: '#E8F0FB' };

export const LEVEL_COLORS = {
  [LEVEL_DANGER]: '#D32F2F',
  [LEVEL_CAUTION]: '#E08A00',
  [LEVEL_NONE_SEEN]: '#3B6E8F', // 초록(=안전)으로 오해하지 않도록 청회색
  [LEVEL_UNUSABLE]: '#6B7280',
};
