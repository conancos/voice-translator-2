'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Mic, MicOff, Volume2, RefreshCw, Globe, Trash2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

interface Session {
  id: string
  originalText: string
  translatedText: string
  timestamp: Date
}

export default function Home() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [isSupported, setIsSupported] = useState(true)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt')
  const [browserInfo, setBrowserInfo] = useState('')
  const [isBrowserTranslating, setIsBrowserTranslating] = useState(false)
  const [translationWarning, setTranslationWarning] = useState(false)
  const [narratingSessionId, setNarratingSessionId] = useState<string | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [isMobile, setIsMobile] = useState(false)
  
  // 🔥 RECONSTRUCCIÓN: Usar state como en el punto funcional
  const [transcriptionAtSessionStart, setTranscriptionAtSessionStart] = useState('')
  
  // 🔥 NUEVO: Controlar detección de nuevas sesiones dentro de la misma grabación
  const [lastEventTime, setLastEventTime] = useState<number>(0)
  const [sessionSegmentCount, setSessionSegmentCount] = useState(0)
  
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const translationRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null) // 🔥 NUEVO: Ref para scroll
  const lastTranslationLength = useRef<number>(0)

  // Keep a ref copy of finalTranscript to avoid stale closures and to build display reliably
  const finalTranscriptRef = useRef<string>('')

  // Track processed transcripts per absolute result index to detect updates
  const processedResultsRef = useRef<Map<number, { text: string; isFinal: boolean }>>(new Map())
  const lastFinalIndexRef = useRef<number>(-1)
  

  
  // 🔥 NUEVO: Controlar acumulación durante la sesión
  const lastResultIndex = useRef<number>(-1)
  
  // 🔥 BUG CRÍTICO: Controlar si la detención es manual
  const isManuallyStopping = useRef<boolean>(false)

  // Available languages for speech recognition
  const languages = [
    { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
    { code: 'es-ES', name: 'Español', flag: '🇪🇸' },
    { code: 'ca-ES', name: 'Català', flag: '🏴' },
    { code: 'fr-FR', name: 'Français', flag: '🇫🇷' },
    { code: 'de-DE', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'zh-CN', name: '中文 (简体)', flag: '🇨🇳' },
    { code: 'ru-RU', name: 'Русский', flag: '🇷🇺' },
    { code: 'uk-UA', name: 'Українська', flag: '🇺🇦' },
    { code: 'ar-SA', name: 'العربية', flag: '🇸🇦' },
    { code: 'ja-JP', name: '日本語', flag: '🇯🇵' },
    { code: 'pt-PT', name: 'Português', flag: '🇵🇹' },
    { code: 'pt-BR', name: 'Português (BR)', flag: '🇧🇷' },
    { code: 'it-IT', name: 'Italiano', flag: '🇮🇹' }
  ]

  useEffect(() => {
    // 🔥 SOLUCIÓN: Asegurar que solo se ejecute en el cliente
    if (typeof window === 'undefined') return
    
    // Detect mobile device
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    // Detect browser
    const userAgent = navigator.userAgent
    let browser = 'Unknown'
    if (userAgent.includes('Chrome')) browser = 'Chrome'
    else if (userAgent.includes('Firefox')) browser = 'Firefox'
    else if (userAgent.includes('Safari')) browser = 'Safari'
    else if (userAgent.includes('Edge')) browser = 'Edge'
    else if (userAgent.includes('Brave')) browser = 'Brave'
    
    setBrowserInfo(browser)

    // Check if browser is translating
    const checkBrowserTranslation = () => {
      // Check for common translation indicators
      const htmlElement = document.documentElement
      const translatedAttribute = htmlElement.getAttribute('translate')
      const googleTranslationBar = document.querySelector('.goog-te-banner-frame')
      const translatedClass = document.body.classList.contains('translated-ltr')
      
      // Check if page is being translated
      if (translatedAttribute === 'yes' || googleTranslationBar || translatedClass) {
        setIsBrowserTranslating(true)
        setTranslationWarning(true)
      } else {
        setIsBrowserTranslating(false)
        setTranslationWarning(false)
      }
    }

    // Check translation status periodically
    const translationCheckInterval = setInterval(checkBrowserTranslation, 1000)
    
    // Also check when DOM changes
    const observer = new MutationObserver(checkBrowserTranslation)
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true 
    })

    // Initial check
    setTimeout(checkBrowserTranslation, 500)

    // Check microphone permissions
    const checkMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
        setMicPermission('granted')
      } catch (error: any) {
        if (error.name === 'NotAllowedError') {
          setMicPermission('denied')
        } else if (error.name === 'NotReadableError') {
          setMicPermission('denied')
        } else {
          setMicPermission('prompt')
        }
      }
    }

    checkMicPermission()

    if (typeof window === 'undefined') return

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    recognition.maxAlternatives = 10 // 🔥 AUMENTADO: Más alternativas para evitar detenciones prematuras
    
    // 🔥 IMPORTANTE: Desactivar auto-detención para debugging
    // recognition.onspeechend = () => {
    //   console.log('Speech ended unexpectedly');
    // }
    
    // 🔥 CONFIGURACIÓN ESPECÍFICA PARA EVITAR DETENCIONES
    recognition.maxAlternatives = 10
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    
    // Prevent automatic stopping after 1 minute
    recognition.onstart = () => {
      console.log('Recognition started with language:', selectedLanguage, 'Mobile:', isMobile)
    }
    
    recognition.onend = () => {
      console.log('Recognition ended, checking if should restart...')
      console.log('isRecording:', isRecording, 'isBrowserTranslating:', isBrowserTranslating, 'isManuallyStopping:', isManuallyStopping.current)
      
      // 🔥 BUG CRÍTICO: No reiniciar si es detención manual O si isRecording es false
      // Restart recognition if we're still recording and browser translation is not active
      if (isRecording && !isBrowserTranslating && !isManuallyStopping.current) {
        setTimeout(() => {
          if (recognitionRef.current && isRecording && !isManuallyStopping.current) {
            try {
              recognitionRef.current.lang = selectedLanguage
              // 🔥 SOLUCIÓN MÓVIL: Reconfigurar para móviles al reiniciar
              if (isMobile) {
                recognitionRef.current.interimResults = true // 🔥 ARREGLO: Mantener tiempo real
              }
              recognitionRef.current.start()
              console.log('Recognition restarted successfully')
            } catch (error) {
              console.error('Error restarting recognition:', error)
            }
          } else {
            console.log('Conditions changed, not restarting recognition')
          }
        }, 100)
      } else {
        console.log('Not restarting recognition (stopped manually or browser translating or not recording)')
      }
    }

    recognition.onresult = (event: any) => {
      // Handle incoming speech recognition results. Keep logs minimal to avoid spam.
      const currentTime = Date.now()
      const timeSinceLastEvent = currentTime - lastEventTime
      setLastEventTime(currentTime)
      
      // Si ha pasado un tiempo largo desde el último evento, considerar que es un reinicio
      const pauseThreshold = isMobile ? 5000 : 8000 // 8s PC, 5s móvil (inactivo)
      if (timeSinceLastEvent > pauseThreshold) {
        processedResultsRef.current.clear()
        lastFinalIndexRef.current = -1
      }

      let finalTranscript = ''
      let interimTranscript = ''
      
  // 🔥 DESACTIVADO COMPLETAMENTE: Sin detección automática de pausas
  // Las sesiones se crearán solo manualmente (Stop o New Session)
      const isNewSession = false // 🔥 FORZADO: Nunca crear sesiones automáticamente
      // 🔥 DESACTIVADO: isResultIndexReset para evitar crear sesiones en cada resultado
      
  // (debug) timeSinceLastEvent and indexes are tracked in refs for behavior; no console spam
      
      // 🔥 DESACTIVADO COMPLETAMENTE: Sin creación automática de sesiones
      // Todo el texto se acumula en Transcription
      // Sesiones se crearán solo en Stop o New Session
      
      // Iterar sobre los resultados relativos, comparar con lo almacenado y procesar cambios
      let processedAny = false
      for (let j = 0; j < event.results.length; ++j) {
        const absIndex = event.resultIndex + j
        const transcript = (event.results[j][0].transcript || '').trim()
        const isFinal = !!event.results[j].isFinal

        const prev = processedResultsRef.current.get(absIndex)
        if (!prev || prev.text !== transcript || prev.isFinal !== isFinal) {
          // Actualización detectada
          processedResultsRef.current.set(absIndex, { text: transcript, isFinal })
          processedAny = true
        }

        if (isFinal) {
          // Si es final, acumular en finalTranscript y marcar índice
          if (transcript) {
            finalTranscript = finalTranscript ? finalTranscript + ' ' + transcript : transcript
          }
          lastFinalIndexRef.current = Math.max(lastFinalIndexRef.current, absIndex)
        }
      }

      // Construir interim combinando los textos no-final más recientes, en orden de índice
      const interimParts: string[] = []
      Array.from(processedResultsRef.current.keys()).sort((a, b) => a - b).forEach((idx) => {
        const entry = processedResultsRef.current.get(idx)
        if (entry && !entry.isFinal) {
          interimParts.push(entry.text)
        }
      })
      interimTranscript = interimParts.join(' ').trim()

      if (processedAny) {
        const hasNewContent = finalTranscript.trim().length > 0 || interimTranscript.trim().length > 0
        if (hasNewContent) {
          // Llamada única y sin logs excesivos
          handleResult(finalTranscript.trim(), interimTranscript.trim())
        }
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      if (event.error === 'no-speech') {
        setTimeout(() => {
          if (isRecording) {
            try {
              recognition.start()
            } catch (e) {
              console.error('Error restarting recognition:', e)
            }
          }
        }, 1000)
      } else if (event.error === 'not-allowed') {
        setMicPermission('denied')
        setIsRecording(false)
      } else if (event.error === 'aborted') {
        console.log('Recognition aborted, checking if manual stop...')
        // 🔥 BUG CRÍTICO: No reiniciar si es detención manual
        if (!isManuallyStopping.current && isRecording) {
          console.log('Auto-restarting recognition after abort...')
          setTimeout(() => {
            if (isRecording && !isManuallyStopping.current) {
              try {
                recognition.start()
              } catch (e) {
                console.error('Error restarting after abort:', e)
                setIsRecording(false)
              }
            }
          }, 2000)
        } else {
          console.log('Manual stop detected, not restarting')
        }
      } else if (event.error === 'network') {
        console.log('Network error, retrying...')
        setTimeout(() => {
          if (isRecording) {
            try {
              recognition.start()
            } catch (e) {
              console.error('Error restarting after network error:', e)
            }
          }
        }, 3000)
      }
    }

    recognitionRef.current = recognition

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      setVoices(availableVoices)
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      if (recognitionRef.current && isRecording) {
        recognitionRef.current.stop()
      }
      clearInterval(translationCheckInterval)
      observer.disconnect()
      window.removeEventListener('resize', checkMobile)
      

    }
  }, [isRecording, isMobile])

  // 🔥 SOLUCIÓN DEFINITIVA: Acumulación pura sin limpiezas
  const handleResult = useCallback((final: string, interim: string) => {
    // Always build the visible text as: currentFinal + (interim ? ' ' + interim : '')
    // Do NOT append interim fragments to previous displayed content; recompute each time.
    const hasFinal = !!final && final.trim().length > 0

    if (hasFinal) {
      // Append the newly-finalized piece to the finalTranscript state
      const finalTrim = final.trim()
      setFinalTranscript(prev => {
        const prevTrim = (prev || '').trim()

        // If identical to previous, skip
        if (prevTrim && finalTrim === prevTrim) {
          const display = prevTrim + (interim ? ' ' + interim : '')
          setTranscript(display)
          if (translationRef.current) translationRef.current.textContent = display
          return prev
        }

        // If prev already ends with finalTrim, skip
        if (prevTrim && finalTrim && prevTrim.endsWith(finalTrim)) {
          const display = prevTrim + (interim ? ' ' + interim : '')
          setTranscript(display)
          if (translationRef.current) translationRef.current.textContent = display
          return prev
        }

        // If finalTrim starts with prevTrim, only append the suffix to avoid duplicating the shared part
        let suffix = finalTrim
        if (prevTrim && finalTrim.startsWith(prevTrim)) {
          suffix = finalTrim.slice(prevTrim.length).trim()
        } else if (prevTrim && finalTrim.includes(prevTrim)) {
          // If final contains prev somewhere, append only the part after the previous occurrence
          const idx = finalTrim.indexOf(prevTrim)
          suffix = finalTrim.slice(idx + prevTrim.length).trim()
        } else if (prevTrim) {
          // Try to find the longest overlap between the end of prev and start of finalTrim
          const maxK = Math.min(prevTrim.length, finalTrim.length)
          let found = false
          for (let k = maxK; k > 0; k--) {
            if (prevTrim.slice(prevTrim.length - k) === finalTrim.slice(0, k)) {
              suffix = finalTrim.slice(k).trim()
              found = true
              break
            }
          }
          // if no overlap found, suffix stays as full finalTrim
        }

        // If nothing new after removing overlap, just rebuild display
        if (!suffix) {
          const display = prevTrim + (interim ? ' ' + interim : '')
          setTranscript(display)
          if (translationRef.current) translationRef.current.textContent = display
          return prev
        }

        const next = prevTrim ? (prevTrim + ' ' + suffix) : suffix
        finalTranscriptRef.current = next

        const display = next + (interim ? ' ' + interim : '')
        setTranscript(display)
        if (translationRef.current) translationRef.current.textContent = display
        lastTranslationLength.current = next.length
        return next
      })
    } else {
      // No new final piece: compute display from latest finalTranscriptRef + interim
      const base = finalTranscriptRef.current || ''
      const display = base + (interim ? (base ? ' ' + interim : interim) : '')
      setTranscript(display)
      if (translationRef.current) translationRef.current.textContent = display
    }

    // Scroll automático
    if (scrollAreaRef.current) {
      setTimeout(() => {
        if (scrollAreaRef.current) {
          const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') || scrollAreaRef.current
          try {
            scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'smooth' })
          } catch {}
        }
      }, 50)
    }

    // Cleanup processed entries up to last final index to avoid re-processing
    if (lastFinalIndexRef.current >= 0) {
      Array.from(processedResultsRef.current.keys()).forEach((k) => {
        if (k <= lastFinalIndexRef.current) processedResultsRef.current.delete(k)
      })
    }
  }, [])

  // Keep ref in sync with state (for other callbacks that read current final transcript)
  useEffect(() => {
    finalTranscriptRef.current = finalTranscript
  }, [finalTranscript])

  const startRecording = async () => {
    try {
      // Check if browser translation is active
      if (isBrowserTranslating) {
        alert('⚠️ Please disable browser translation before recording.\n\nBrowser translation conflicts with speech recognition and may cause errors.\n\nTo fix:\n1. Click the translation icon in your browser\n2. Select "Show original" or "Turn off translation"\n3. Then try recording again.')
        return
      }
      
      if (!recognitionRef.current) {
        alert('Speech recognition is not available in this browser.')
        return
      }
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
        setMicPermission('granted')
      } catch (error: any) {
        if (error.name === 'NotAllowedError') {
          setMicPermission('denied')
          alert('Please allow microphone access to use this feature.')
          return
        } else {
          alert('Error accessing microphone: ' + error.message)
          return
        }
      }
      
      // 🔥 SIMPLIFICADO: Iniciar grabación
  // Limpiar estados de índice/procesados al iniciar nueva grabación
  processedResultsRef.current.clear()
  lastFinalIndexRef.current = -1
  setTranscriptionAtSessionStart(finalTranscript);
  setTranscript(finalTranscript);
      lastTranslationLength.current = finalTranscript.length;
      setLastEventTime(Date.now());
      setSessionSegmentCount(0);
      lastResultIndex.current = -1;
      setIsRecording(true);
      
      setTimeout(() => {
        try {
          if (recognitionRef.current) {
            recognitionRef.current.lang = selectedLanguage
            recognitionRef.current.start()
            console.log('Recognition started successfully')
          }
        } catch (error: any) {
          console.error('Error starting recognition:', error)
          setIsRecording(false)
          
          if (error.message && error.message.includes('started')) {
            alert('Recognition is already started. Stop and try again.')
          } else {
            alert('Error starting recognition: ' + (error.message || 'Unknown error'))
          }
        }
      }, 100)
    } catch (error) {
      console.error('Unexpected error in startRecording:', error)
      alert('An unexpected error occurred. Please try again.')
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (!recognitionRef.current) return
    
    // 🔥 BUG CRÍTICO: Marcar como detención manual INMEDIATAMENTE
    isManuallyStopping.current = true
    
    setIsRecording(false)
    try {
      recognitionRef.current.stop()
      console.log('Recognition stopped successfully')
    } catch (error) {
      console.error('Error stopping recognition:', error)
    }
    // Note: sessions are saved only via "New Session" action. Do not auto-save on Stop.
    
    // 🔥 BUG CRÍTICO: Mantener flag de detención manual por más tiempo
    setTimeout(() => {
      isManuallyStopping.current = false
      console.log('Manual stop flag reset')
    }, 3000) // Aumentado a 3 segundos para asegurar que no reinicie
  }

  const resetRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // Ignore error if already stopped
      }
    }
    // Finalizar sesión actual y preparar nueva (no loguear el texto transcrito por privacidad)
    const currentContent = translationRef.current?.textContent?.trim() || ''

    if (currentContent) {
      // Guardar sesión completa (sin imprimir su contenido en consola)
      const newSession: Session = {
        id: Date.now().toString(),
        originalText: currentContent,
        translatedText: currentContent,
        timestamp: new Date()
      }
      setSessions(prev => [...prev, newSession])
    }
    
    // Limpiar todo para nueva sesión
    
    setTranscript('')
  setFinalTranscript('')
  setTranscriptionAtSessionStart('')
    lastTranslationLength.current = 0
    setLastEventTime(0)
    setSessionSegmentCount(0)
    lastResultIndex.current = -1
    // Limpiar datos procesados
    processedResultsRef.current.clear()
    lastFinalIndexRef.current = -1
    
    // 🔥 NUEVO: Limpiar contenedor de traducción inmediatamente
    if (translationRef.current) {
      translationRef.current.textContent = ''
    }
    
    setTimeout(() => {
      if (recognitionRef.current) {
        recognitionRef.current.lang = selectedLanguage
      }
    }, 100)
  }

  const speakText = (text: string, sessionId?: string) => {
    try {
      if ('speechSynthesis' in window) {
        // Check if we're currently narrating this session
        if (sessionId && narratingSessionId === sessionId) {
          // Stop narration
          window.speechSynthesis.cancel()
          setNarratingSessionId(null)
          return
        }

        // Stop any current narration
        window.speechSynthesis.cancel()
        
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'es-ES'
        
        // Find Spanish voice
        const voice = voices.find(v => v.lang.startsWith('es'))
        if (voice) {
          utterance.voice = voice
        }
        
        utterance.rate = 0.9
        utterance.pitch = 1
        utterance.volume = 1
        
        // Set up event handlers
        utterance.onend = () => {
          setNarratingSessionId(null)
        }
        
        utterance.onerror = () => {
          setNarratingSessionId(null)
        }
        
        window.speechSynthesis.speak(utterance)
        
        // Set the narrating session ID
        if (sessionId) {
          setNarratingSessionId(sessionId)
        }
      }
    } catch (error) {
      console.error('Error speaking text:', error)
      setNarratingSessionId(null)
    }
  }

  const deleteSession = (id: string) => {
    // Find the session to get its content for the confirmation message
    const session = sessions.find(s => s.id === id)
    if (!session) return
    
    // Create confirmation dialog
    const confirmMessage = `¿Estás seguro de que quieres borrar esta sesión?\n\nContenido:\n"${session.translatedText.substring(0, 100)}${session.translatedText.length > 100 ? '...' : ''}"\n\nEsta acción no se puede deshacer.`
    
    if (confirm(confirmMessage)) {
      // Stop narration if this session is currently being narrated
      if (narratingSessionId === id) {
        window.speechSynthesis.cancel()
        setNarratingSessionId(null)
      }
      
      setSessions(prev => prev.filter(session => session.id !== id))
    }
  }

  if (!isSupported) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <Globe className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-semibold mb-2">Browser Not Supported</h2>
            <p className="text-gray-600 mb-4">
              Your browser does not support speech recognition. Please use Chrome or Edge for the best experience.
            </p>
            <div className="text-sm text-gray-500">
              <p>Detected browser: <strong>{browserInfo}</strong></p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-6">
          <div className="flex justify-end mb-4">
            <ThemeToggle />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2 dark:text-gray-100">Real-Time Voice Translator</h1>
          <p className="text-gray-600 dark:text-gray-300">Record, transcribe, and translate instantly</p>
          <div className="mt-4 flex justify-center gap-4 text-sm flex-wrap">
            <Badge variant={micPermission === 'granted' ? 'default' : micPermission === 'denied' ? 'destructive' : 'secondary'}>
              Microphone: {micPermission === 'granted' ? '✅ Allowed' : micPermission === 'denied' ? '❌ Denied' : '⏳ Pending'}
            </Badge>
            <Badge variant="outline">
              Browser: {browserInfo}
            </Badge>
            <Badge variant={isBrowserTranslating ? 'destructive' : 'secondary'}>
              Translation: {isBrowserTranslating ? '🔄 Active (Recording Disabled)' : '⏸️ Inactive'}
            </Badge>
          </div>
        </div>

        {/* Translation Instructions */}
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-blue-500 mt-1">💡</div>
              <div>
                <h3 className="font-semibold text-blue-800 dark:text-blue-200">Traducción del Navegador Requerida</h3>
                <p className="text-blue-700 text-sm mt-1 dark:text-blue-300">
                  Haz clic derecho en la página y selecciona "Traducir a [tu idioma]" para activar la traducción automática. 
                  El contenido será traducido automáticamente por tu navegador.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Translation Warning */}
        {translationWarning && (
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="text-red-500 mt-1">⚠️</div>
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-200">Browser Translation Detected</h3>
                  <p className="text-red-700 text-sm mt-1 dark:text-red-300">
                    Browser translation is active and may interfere with speech recognition. 
                    Please disable translation to use the recording feature.
                  </p>
                  <p className="text-red-600 text-xs mt-2 dark:text-red-400">
                    Click the translation icon in your browser and select "Show original" or "Turn off translation"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-medium" translate="no">
                    Recording Language:
                  </span>
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage} disabled={isRecording}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          <span className="flex items-center gap-2">
                            <span>{lang.flag}</span>
                            <span>{lang.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 🔥 NUEVO: Indicador de segmentos */}
                {isRecording && sessionSegmentCount > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      📝 {sessionSegmentCount} segment{sessionSegmentCount !== 1 ? 's' : ''} auto-saved
                    </Badge>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    onClick={isRecording ? stopRecording : startRecording}
                    size="lg"
                    className={isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
                    id="record-button"
                    disabled={isBrowserTranslating}
                    translate="no"
                  >
                    <span translate="no" className="flex items-center gap-2">
                      {isRecording ? (
                        <>
                          <MicOff className="w-5 h-5" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-5 h-5" />
                          <span>{isBrowserTranslating ? 'Recording Disabled' : 'Record'}</span>
                        </>
                      )}
                    </span>
                  </Button>
                  
                  <Button
                    onClick={resetRecognition}
                    size="lg"
                    variant="outline"
                    disabled={isRecording}
                    translate="no"
                  >
                    <span translate="no" className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5" />
                      <span>New Session</span>
                    </span>
                  </Button>
                </div>
              </div>
            
            {isRecording && (
              <div className="mt-4 flex items-center gap-2" translate="no">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-red-600 font-medium">Recording...</span>
                <span className="text-gray-400">
                  {languages.find(lang => lang.code === selectedLanguage)?.flag} {languages.find(lang => lang.code === selectedLanguage)?.name}
                </span>
              </div>
            )}
          </div>
          </CardContent>
        </Card>

        {/* Translation Container Only */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" translate="no">
              <Globe className="w-5 h-5" />
              Transcription
              <Badge variant="secondary">Live</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
              <ScrollArea ref={scrollAreaRef} className="h-64 w-full rounded-md border p-4">
                <div className="space-y-2">
                  <p
                    ref={translationRef}
                    className={transcript ? "text-gray-800 whitespace-pre-wrap dark:text-gray-200" : "text-gray-400 italic dark:text-gray-500"}
                    lang="es-ES"
                    translate="no"
                  >
                    {transcript}
                  </p>
                </div>
              </ScrollArea>
          </CardContent>
          </Card>

        {/* Sessions */}
        {sessions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle translate="no">
                Saved Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sessions.map((session, index) => (
                  <div key={session.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">
                            Español
                          </Badge>
                          {narratingSessionId === session.id && (
                            <Badge variant="secondary" className="animate-pulse">
                              🔊 Narrando...
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm text-gray-500">
                          {session.timestamp.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={narratingSessionId === session.id ? "destructive" : "outline"}
                          onClick={() => speakText(session.translatedText, session.id)}
                          translate="no"
                          className="flex-1 min-w-0"
                        >
                          <span translate="no" className="flex items-center gap-1">
                            {narratingSessionId === session.id ? (
                              <>
                                <Volume2 className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">Detener</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">Narrar</span>
                              </>
                            )}
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteSession(session.id)}
                          translate="no"
                          className="flex-1 min-w-0"
                        >
                          <span translate="no" className="truncate">
                            Borrar
                          </span>
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm bg-blue-50 p-3 rounded border border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                        <p lang="es-ES" className="text-gray-800 leading-relaxed dark:text-gray-200">
                          {session.translatedText}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}