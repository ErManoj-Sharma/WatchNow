import type { StyleProp, ViewStyle } from 'react-native';

export type VlcAudioTrack = {
  id: number;
  name: string;
  selected?: boolean;
};

export type VlcVideoViewHandle = {
  loadSource: (uri: string, startPositionSeconds?: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (fraction: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  getAudioTracks: () => Promise<VlcAudioTrack[]>;
  setAudioTrack: (id: number) => Promise<boolean>;
};

export type VlcVideoViewProps = {
  style?: StyleProp<ViewStyle>;
  /** Duration of the loaded media, in seconds. */
  onDuration?: (seconds: number) => void;
  /** Current playback position, in seconds. */
  onProgress?: (seconds: number) => void;
  onPlaying?: () => void;
  onPaused?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};
