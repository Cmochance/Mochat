import { useState, useRef, useCallback } from 'react'
import { Loader2, Play, Pause, Square, SkipBack, SkipForward, Headphones, Radio, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '../../../services/api'

interface AudioViewProps {
  materialId: number
}

interface PodcastLine {
  speaker: string
  text: string
}

type AudioType = 'summary' | 'podcast'
type SpeedOption = 0.75 | 1 | 1.25 | 1.5 | 2

const SPEED_OPTIONS: SpeedOption[] = [0.75, 1, 1.25, 1.5, 2]

export default function AudioView({ materialId }: AudioViewProps) {
  const { t } = useTranslation()

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Audio state
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState<SpeedOption>(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)

  // Podcast script
  const [script, setScript] = useState<PodcastLine[]>([])
  const [scriptExpanded, setScriptExpanded] = useState(true)
  const [activeLine, setActiveLine] = useState(-1)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Generate audio
  const handleGenerate = useCallback(async (type: AudioType) => {
    setIsGenerating(true)
    setError(null)
    setAudioUrl(null)
    setScript([])
    setActiveLine(-1)

    try {
      const endpoint = type === 'summary'
        ? `/learn/materials/${materialId}/audio/summary`
        : `/learn/materials/${materialId}/audio/podcast`

      const response = await api.post(endpoint, {}, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
    
      // For podcast, also fetch the script
      if (type === 'podcast') {
        try {
          const scriptRes = await api.post(`/learn/materials/${materialId}/audio/podcast/script`)
          setScript(scriptRes.data.script || [])
        } catch {
          // Script fetch failed, not critical
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('learn.audio.generateError')
      setError(msg)
    } finally {
      setIsGenerating(false)
    }
  }, [materialId, t])

  // Audio controls
  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleStop = () => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    setIsPlaying(false)
    setCurrentTime(0)
    setActiveLine(-1)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = ratio * duration
  }

  const changeSpeed = (speed: SpeedOption) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
    setPlaybackRate(speed)
    setShowSpeedMenu(false)
  }

  const skip = (seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
  }

  // Map current time to script line
  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    setCurrentTime(audioRef.current.currentTime)

    // Try to highlight active script line based on time
    if (script.length > 0 && duration > 0) {
      const lineIndex = Math.floor((audioRef.current.currentTime / duration) * script.length)
      setActiveLine(Math.min(lineIndex, script.length - 1))
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setActiveLine(-1)
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-paper-aged">
        <Headphones size={18} className="text-ink-medium" />
        <h3 className="text-sm font-semibold text-ink-black">{t('learn.audio.title')}</h3>
      </div>

      <p className="text-xs text-ink-faint">{t('learn.audio.subtitle')}</p>

      {/* Generation buttons */}
      {!audioUrl && !isGenerating && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => handleGenerate('summary')}
            className="flex flex-col items-center gap-2 p-4 border border-paper-aged rounded-sm
                       hover:bg-paper-aged transition-colors group"
          >
            <FileText size={24} className="text-ink-medium group-hover:text-ink-black" />
            <span className="text-sm font-medium text-ink-black">{t('learn.audio.generateSummaryAudio')}</span>
            <span className="text-xs text-ink-faint">{t('learn.audio.summaryDesc')}</span>
          </button>
          <button
            onClick={() => handleGenerate('podcast')}
            className="flex flex-col items-center gap-2 p-4 border border-paper-aged rounded-sm
                       hover:bg-paper-aged transition-colors group"
          >
            <Radio size={24} className="text-ink-medium group-hover:text-ink-black" />
            <span className="text-sm font-medium text-ink-black">{t('learn.audio.generatePodcast')}</span>
            <span className="text-xs text-ink-faint">{t('learn.audio.podcastDesc')}</span>
          </button>
        </div>
      )}

      {/* Loading state */}
      {isGenerating && (
        <div className="flex flex-col items-center justify-center py-12 text-ink-medium">
          <Loader2 size={24} className="animate-spin mb-3" />
          <p className="text-sm">{t('learn.audio.generating')}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Audio player */}
      {audioUrl && (
        <div className="space-y-4">
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (audioRef.current) setDuration(audioRef.current.duration)
            }}
            onEnded={handleEnded}
          />

          {/* Progress bar */}
          <div
            ref={progressRef}
            className="w-full h-2 bg-paper-aged rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-ink-black rounded-full transition-all"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>

          {/* Time display */}
          <div className="flex justify-between text-xs text-ink-faint">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => skip(-15)}
              className="p-2 text-ink-medium hover:text-ink-black transition-colors"
              title="-15s"
            >
              <SkipBack size={18} />
            </button>

            <button
              onClick={handleStop}
              className="p-2 text-ink-medium hover:text-ink-black transition-colors"
            >
              <Square size={18} />
            </button>

            <button
              onClick={togglePlay}
              className="p-3 bg-ink-black text-paper-white rounded-full hover:bg-ink-medium transition-colors"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <button
              onClick={() => skip(15)}
              className="p-2 text-ink-medium hover:text-ink-black transition-colors"
              title="+15s"
            >
              <SkipForward size={18} />
            </button>

            {/* Speed control */}
            <div className="relative ml-4">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-ink-medium border border-paper-aged
                           rounded-sm hover:bg-paper-aged transition-colors"
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-paper-white border border-paper-aged rounded-sm shadow-md z-10">
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => changeSpeed(speed)}
                      className={`block w-full px-3 py-1 text-xs text-left hover:bg-paper-aged transition-colors ${
                        speed === playbackRate ? 'font-bold text-ink-black' : 'text-ink-medium'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Podcast script */}
          {script.length > 0 && (
            <div className="mt-4 border border-paper-aged rounded-sm">
              <button
                onClick={() => setScriptExpanded(!scriptExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-ink-black
                           hover:bg-paper-aged transition-colors"
              >
                <span>{t('learn.audio.transcriptTitle')} ({script.length})</span>
                {scriptExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {scriptExpanded && (
                <div className="max-h-64 overflow-y-auto border-t border-paper-aged">
                  {script.map((line, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-2 px-3 py-2 text-xs border-b border-paper-aged last:border-b-0 ${
                        idx === activeLine ? 'bg-ink-black/5' : ''
                      }`}
                    >
                      <span className={`shrink-0 font-medium ${
                        line.speaker === 'A' ? 'text-blue-600' : 'text-green-600'
                      }`}>
                        {line.speaker === 'A' ? t('learn.audio.speakerA') : t('learn.audio.speakerB')}:
                      </span>
                      <span className="text-ink-medium">{line.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generate new */}
          <button
            onClick={() => {
              setAudioUrl(null)
              setScript([])
              setError(null)
            }}
            className="w-full py-2 text-xs text-ink-medium border border-paper-aged rounded-sm
                       hover:bg-paper-aged transition-colors"
          >
            重新生成
          </button>
        </div>
      )}

      {/* Empty state */}
      {!audioUrl && !isGenerating && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-ink-faint py-8">
          <Headphones size={48} className="mb-4 opacity-30" />
          <p className="text-sm mb-1">{t('learn.audio.emptyTitle')}</p>
          <p className="text-xs">{t('learn.audio.emptySubtitle')}</p>
        </div>
      )}
    </div>
  )
}
