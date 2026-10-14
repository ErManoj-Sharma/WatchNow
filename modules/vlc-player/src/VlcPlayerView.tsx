import { requireNativeView } from 'expo';
import * as React from 'react';

import type { VlcAudioTrack, VlcSubtitleTrack, VlcVideoViewHandle, VlcVideoViewProps } from './VlcPlayer.types';

export type { VlcAudioTrack, VlcSubtitleTrack, VlcVideoViewHandle, VlcVideoViewProps };

// Expo view events wrap single-value payloads as { payload: <value> } (see
// expo-modules-core ViewEvent.convertEventBody); Unit events arrive as {}.
type NativeProps = {
  style?: VlcVideoViewProps['style'];
  onDuration?: (e: { nativeEvent: { payload: number } }) => void;
  onProgress?: (e: { nativeEvent: { payload: number } }) => void;
  onPlaying?: (e: unknown) => void;
  onPaused?: (e: unknown) => void;
  onEnd?: (e: unknown) => void;
  onError?: (e: { nativeEvent: { payload: string } }) => void;
};

type NativeHandle = {
  loadSource: (uri: string, startPosition: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (fraction: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  getAudioTracks: () => Promise<VlcAudioTrack[]>;
  setAudioTrack: (id: number) => Promise<boolean>;
  getSubtitleTracks: () => Promise<VlcSubtitleTrack[]>;
  setSubtitleTrack: (id: number) => Promise<boolean>;
};

// The native view exposes AsyncFunctions (loadSource/play/pause/...) on its instance, so a
// ref is valid at runtime, but requireNativeView's ComponentType<P> return type doesn't
// declare ref. Cast once here rather than at every call site.
const NativeView = requireNativeView<NativeProps>('VlcPlayer') as React.ComponentType<
  NativeProps & React.RefAttributes<NativeHandle>
>;

export const VlcVideoView = React.forwardRef<VlcVideoViewHandle, VlcVideoViewProps>(
  function VlcVideoView(props, ref) {
    const nativeRef = React.useRef<NativeHandle>(null);

    React.useImperativeHandle(
      ref,
      (): VlcVideoViewHandle => ({
        loadSource: (uri, startPositionSeconds = 0) => nativeRef.current!.loadSource(uri, startPositionSeconds),
        play: () => nativeRef.current!.play(),
        pause: () => nativeRef.current!.pause(),
        seek: (fraction) => nativeRef.current!.seek(fraction),
        setVolume: (volume) => nativeRef.current!.setVolume(volume),
        setRate: (rate) => nativeRef.current!.setRate(rate),
        getAudioTracks: () => nativeRef.current!.getAudioTracks(),
        setAudioTrack: (id) => nativeRef.current!.setAudioTrack(id),
        getSubtitleTracks: () => nativeRef.current!.getSubtitleTracks(),
        setSubtitleTrack: (id) => nativeRef.current!.setSubtitleTrack(id),
      }),
      [],
    );

    return (
      <NativeView
        ref={nativeRef}
        style={props.style}
        onDuration={(e) => props.onDuration?.(e.nativeEvent.payload)}
        onProgress={(e) => props.onProgress?.(e.nativeEvent.payload)}
        onPlaying={() => props.onPlaying?.()}
        onPaused={() => props.onPaused?.()}
        onEnd={() => props.onEnd?.()}
        onError={(e) => props.onError?.(e.nativeEvent.payload)}
      />
    );
  },
);

export default VlcVideoView;
