package expo.modules.vlcplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VlcPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VlcPlayer")

    View(VlcPlayerView::class) {
      Events("onDuration", "onProgress", "onPlaying", "onPaused", "onEnd", "onError")

      AsyncFunction("loadSource") { view: VlcPlayerView, uri: String, startPosition: Double ->
        view.loadSource(uri, startPosition)
      }

      AsyncFunction("play") { view: VlcPlayerView ->
        view.play()
      }

      AsyncFunction("pause") { view: VlcPlayerView ->
        view.pause()
      }

      AsyncFunction("seek") { view: VlcPlayerView, fraction: Double ->
        view.seek(fraction)
      }

      AsyncFunction("setVolume") { view: VlcPlayerView, volume: Double ->
        view.setVolume(volume.toInt())
      }

      AsyncFunction("setRate") { view: VlcPlayerView, rate: Double ->
        view.setRate(rate)
      }

      AsyncFunction("getAudioTracks") { view: VlcPlayerView ->
        view.getAudioTracks()
      }

      AsyncFunction("setAudioTrack") { view: VlcPlayerView, trackId: Int ->
        view.setAudioTrack(trackId)
      }

      AsyncFunction("getSubtitleTracks") { view: VlcPlayerView ->
        view.getSubtitleTracks()
      }

      AsyncFunction("setSubtitleTrack") { view: VlcPlayerView, trackId: Int ->
        view.setSubtitleTrack(trackId)
      }

      OnViewDestroys { view: VlcPlayerView ->
        view.cleanup()
      }
    }
  }
}
