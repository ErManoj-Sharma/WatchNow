package expo.modules.vlcplayer

import android.content.Context
import android.net.Uri
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout

class VlcPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // libVLC inflates its TextureView/SurfaceView out of a ViewStub during attachViews (after
  // RN's initial layout). Without Android-driven layout, RN never lays that subtree out
  // (facebook/react-native#17968) and the view stays 0x0, so libVLC's play() defers forever.
  override val shouldUseAndroidLayout: Boolean = true

  private val videoLayout = VLCVideoLayout(context)
  private var libVLC: LibVLC? = null
  private var mediaPlayer: MediaPlayer? = null
  private var lastDurationSec = 0.0
  private var startPositionMs = 0L
  private var pendingSeek = false
  private var lastLoggedTimeMs = 0L
  // libVLC's plain Media(FileDescriptor) path registers the raw fd as an "fd://" mrl and
  // only reads/dups it at play() time — the ParcelFileDescriptor must stay open for the
  // media's whole lifetime or open() fails with EBADF instantly.
  private var mediaPfd: ParcelFileDescriptor? = null

  private val onDuration by EventDispatcher<Double>()
  private val onProgress by EventDispatcher<Double>()
  private val onPlaying by EventDispatcher<Unit>()
  private val onPaused by EventDispatcher<Unit>()
  private val onEnd by EventDispatcher<Unit>()
  private val onError by EventDispatcher<String>()

  init {
    addView(videoLayout, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private fun ensurePlayer(): MediaPlayer {
    mediaPlayer?.let { return it }
    Log.d(TAG, "ensurePlayer: creating LibVLC + MediaPlayer")
    val lib = LibVLC(context, arrayListOf("--no-drop-late-frames", "--no-skip-frames"))
    libVLC = lib
    val mp = MediaPlayer(lib)
    // libVLC fires events on its own thread; hop to the UI thread for Expo's EventDispatcher.
    mp.setEventListener { event -> post { handleEvent(event) } }
    // textureView=true: SurfaceView hole-punch never produces a surface inside React
    // Native's view hierarchy here (play() defers forever on areSurfacesWaiting).
    // TextureView composites normally and works at any nesting depth.
    mp.attachViews(videoLayout, null, false, true)
    mediaPlayer = mp
    logSurfaceDiagnostics("attach")
    postDelayed({ logSurfaceDiagnostics("attach+1s") }, 1000)
    return mp
  }

  private fun logSurfaceDiagnostics(tag: String) {
    fun walk(v: View, depth: Int, out: StringBuilder) {
      if (v is SurfaceView || v is TextureView) {
        val valid = when (v) {
          is SurfaceView -> v.holder.surface.isValid
          is TextureView -> v.isAvailable
          else -> false
        }
        out.append("${v.javaClass.simpleName}(d$depth ${v.width}x${v.height} valid=$valid) ")
      }
      if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i), depth + 1, out)
    }
    val found = StringBuilder()
    walk(videoLayout, 0, found)
    val ancestors = StringBuilder()
    var p: View? = videoLayout.parent as? View
    while (p != null) {
      if (p is SurfaceView) ancestors.append(p.javaClass.name).append(' ')
      p = p.parent as? View
    }
    val waiting = try {
      val field = MediaPlayer::class.java.getDeclaredField("mWindow")
      field.isAccessible = true
      val aw = field.get(mediaPlayer ?: return)
      val method = aw.javaClass.getDeclaredMethod("areSurfacesWaiting")
      method.isAccessible = true
      method.invoke(aw)
    } catch (e: Exception) {
      "probe-failed:${e.javaClass.simpleName}"
    }
    Log.d(TAG, "diag[$tag] root=${width}x${height} layout=${videoLayout.width}x${videoLayout.height} surfaces=[$found] surfaceAncestors=[$ancestors] waiting=$waiting")
  }

  fun loadSource(uriString: String, startPosition: Double) {
    // attachViews/@MainThread + view access must run on the UI thread (Expo AsyncFunctions
    // arrive on a background module queue — calling from there leaves the surface state
    // stuck in ATTACHED and MediaPlayer.play() silently defers forever).
    post { loadSourceOnUi(uriString, startPosition) }
  }

  private fun loadSourceOnUi(uriString: String, startPosition: Double) {
    val mp = ensurePlayer()
    startPositionMs = (startPosition * 1000.0).toLong()
    pendingSeek = startPositionMs > 0
    lastDurationSec = 0.0
    Log.d(TAG, "loadSource ui=${Looper.myLooper() == Looper.getMainLooper()} uri=$uriString startMs=$startPositionMs")
    try {
      mp.stop()
      val lib = libVLC ?: return
      mediaPfd?.close()
      mediaPfd = null
      val media = if (uriString.startsWith("content://")) {
        val pfd = context.contentResolver.openFileDescriptor(Uri.parse(uriString), "r")
          ?: error("Cannot open content uri")
        mediaPfd = pfd
        Media(lib, pfd.fileDescriptor)
      } else {
        Media(lib, Uri.parse(uriString))
      }
      media.setHWDecoderEnabled(true, false)
      mp.media = media
      media.release()
      Log.d(TAG, "loadSource: media set, calling play()")
      mp.play()
    } catch (e: Exception) {
      Log.e(TAG, "loadSource failed", e)
      onError(e.message ?: "Failed to open media")
    }
  }

  fun play() {
    post {
      Log.d(TAG, "play()")
      mediaPlayer?.play()
    }
  }

  fun pause() {
    post {
      Log.d(TAG, "pause()")
      mediaPlayer?.pause()
    }
  }

  fun seek(fraction: Double) {
    post {
      val mp = mediaPlayer ?: return@post
      // NaN slips past coerceIn; a poisoned JS position would seek to 0.
      if (!fraction.isFinite()) {
        Log.e(TAG, "seek ignored: non-finite fraction=$fraction")
        return@post
      }
      val length = mp.length
      Log.d(TAG, "seek fraction=$fraction lengthMs=$length")
      if (length > 0) {
        mp.time = (fraction.coerceIn(0.0, 1.0) * length).toLong()
      }
    }
  }

  fun setRate(rate: Double) {
    post {
      Log.d(TAG, "setRate $rate")
      mediaPlayer?.setRate(rate.toFloat())
    }
  }

  fun setVolume(volume: Int) {
    mediaPlayer?.setVolume(volume.coerceIn(0, 100))
  }

  fun getAudioTracks(): List<Map<String, Any>> {
    val mp = mediaPlayer ?: return emptyList()
    val currentId = mp.audioTrack
    return mp.audioTracks?.map { track ->
      mapOf("id" to track.id, "name" to (track.name ?: ""), "selected" to (track.id == currentId))
    } ?: emptyList()
  }

  fun setAudioTrack(trackId: Int): Boolean {
    Log.d(TAG, "setAudioTrack id=$trackId")
    return mediaPlayer?.setAudioTrack(trackId) ?: false
  }

  private fun applyPendingSeek() {
    if (!pendingSeek) return
    val mp = mediaPlayer ?: return
    if (mp.length > 0 && mp.isPlaying) {
      Log.d(TAG, "applyPendingSeek -> ${startPositionMs}ms")
      mp.time = startPositionMs
      pendingSeek = false
    }
  }

  private fun handleEvent(event: MediaPlayer.Event) {
    when (event.type) {
      MediaPlayer.Event.Playing -> {
        Log.d(TAG, "event: Playing")
        applyPendingSeek()
        emitDurationIfChanged()
        onPlaying(Unit)
      }
      MediaPlayer.Event.Paused -> {
        Log.d(TAG, "event: Paused")
        onPaused(Unit)
      }
      MediaPlayer.Event.EndReached -> {
        Log.d(TAG, "event: EndReached")
        onEnd(Unit)
      }
      MediaPlayer.Event.EncounteredError -> {
        Log.e(TAG, "event: EncounteredError")
        onError("Playback error")
      }
      MediaPlayer.Event.TimeChanged -> {
        val t = event.getTimeChanged()
        if (t - lastLoggedTimeMs >= 5000 || t < lastLoggedTimeMs) {
          lastLoggedTimeMs = t
          Log.d(TAG, "event: TimeChanged ${t}ms")
        }
        emitDurationIfChanged()
        onProgress(t / 1000.0)
      }
      // Buffering (259) and PositionChanged (268) fire several times a second — too noisy for logcat.
      MediaPlayer.Event.Buffering, MediaPlayer.Event.PositionChanged -> {}
      else -> Log.d(TAG, "event: type=${event.type}")
    }
  }

  private fun emitDurationIfChanged() {
    val mp = mediaPlayer ?: return
    val length = mp.length
    if (length > 0) {
      val seconds = length / 1000.0
      if (seconds != lastDurationSec) {
        lastDurationSec = seconds
        Log.d(TAG, "emitDuration ${seconds}s")
        onDuration(seconds)
      }
    }
  }

  fun cleanup() {
    Log.d(TAG, "cleanup")
    mediaPlayer?.let {
      try {
        it.stop()
      } catch (_: Exception) {
      }
      it.detachViews()
      it.release()
    }
    mediaPlayer = null
    libVLC?.release()
    libVLC = null
    mediaPfd?.close()
    mediaPfd = null
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    Log.d(TAG, "onDetachedFromWindow")
    cleanup()
  }

  companion object {
    private const val TAG = "VlcPlayer"
  }
}
