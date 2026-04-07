import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';
import { translations, Lang } from './i18n';

interface Stat {
  name: string;
  value: number;
  max: number;
}

interface Quest {
  id: number;
  title: string;
  description: string;
  type: 'run' | 'strength' | 'vitality' | 'intelligence';
  target: number;
  progress: number;
  completed: boolean;
}

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
}

interface HistoryEntry {
  type: string;
  value: number;
  timestamp: string;
  proof?: string; // base64 image
}

const App: React.FC = () => {
  // Core states
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [stats, setStats] = useState<Stat[]>([
    { name: 'Strength', value: 10, max: 100 },
    { name: 'Agility', value: 10, max: 100 },
    { name: 'Vitality', value: 10, max: 100 },
    { name: 'Intelligence', value: 10, max: 100 },
  ]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentQuest, setCurrentQuest] = useState<Quest | null>(null);

  // Location and run tracking
  const [isTracking, setIsTracking] = useState(false);
  const [runDistance, setRunDistance] = useState(0);
  const watchIdRef = useRef<number | null>(null);

  // Camera states
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [reps, setReps] = useState(0);
  const [workoutTimer, setWorkoutTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sound effects using Web Audio API
  const playSound = (type: 'quest' | 'levelup' | 'click' | 'error') => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      switch (type) {
        case 'quest':
          osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
          break;
        case 'levelup':
          osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
          osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3); // G5
          osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.45); // C6
          gain.gain.setValueAtTime(0.4, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.8);
          break;
        case 'click':
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.05);
          break;
        case 'error':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(200, ctx.currentTime);
          osc.frequency.setValueAtTime(150, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
          break;
      }
    } catch (e) {
      // Audio not available
    }
  };

  // UI states
  const [showModal, setShowModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'quests' | 'stats' | 'history'>('home');
  const [lang, setLang] = useState<Lang>('ru');
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Translation function
  const t = (key: string): string => {
    return translations[lang]?.[key] || translations.en?.[key] || key;
  };

  // Language persistence
  useEffect(() => {
    const savedLang = localStorage.getItem('soloFitnessLang') as Lang | null;
    if (savedLang && translations[savedLang]) {
      setLang(savedLang);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('soloFitnessLang', lang);
  }, [lang]);

  const langFlags: Record<Lang, string> = {
    ru: '🇷🇺',
    tj: '🇹🇯',
    en: '🇬🇧',
    ko: '🇰🇷',
  };

  const langNames: Record<Lang, string> = {
    ru: 'Русский',
    tj: 'Тоҷикӣ',
    en: 'English',
    ko: '한국어',
  };

  // Persistence with localStorage
  useEffect(() => {
    const saved = localStorage.getItem('soloFitness');
    if (saved) {
      const data = JSON.parse(saved);
      setLevel(data.level || 1);
      setExp(data.exp || 0);
      setStats(data.stats || []);
      setHistory(data.history || []);
      // Regenerate quests based on date
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('soloFitness', JSON.stringify({
        level, exp, stats, history, quests, questDate: localStorage.getItem('questDate'),
      }));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
  }, [level, exp, stats, history, quests]);

  // Generate daily quests
  useEffect(() => {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('questDate');
    
    // Try to load saved quests first
    const saved = localStorage.getItem('soloFitness');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.questDate === today && data.quests) {
          setQuests(data.quests);
          const activeQuest = data.quests.find((q: Quest) => !q.completed);
          setCurrentQuest(activeQuest || null);
          return;
        }
      } catch (e) {
        console.warn('Failed to parse saved quests:', e);
      }
    }
    
    if (savedDate !== today) {
      const newQuests: Quest[] = [
        {
          id: 1,
          title: 'Shadow Run Quest',
          description: 'Run 3km to boost Agility like dodging monsters.',
          type: 'run',
          target: 3,
          progress: 0,
          completed: false,
        },
        {
          id: 2,
          title: 'Strength Awakening',
          description: 'Complete 50 pushups for raw power.',
          type: 'strength',
          target: 50,
          progress: 0,
          completed: false,
        },
        {
          id: 3,
          title: 'Endurance Trial',
          description: 'Hold plank for 2 minutes.',
          type: 'vitality',
          target: 120,
          progress: 0,
          completed: false,
        },
        {
          id: 4,
          title: 'Hunter Knowledge',
          description: 'Answer 3 fitness questions correctly.',
          type: 'intelligence',
          target: 3,
          progress: 0,
          completed: false,
        },
      ];
      setQuests(newQuests);
      setCurrentQuest(newQuests[0]);
      localStorage.setItem('questDate', today);
    }
  }, []);

  // Camera setup
  useEffect(() => {
    if (isCameraOn) {
      const startCamera = async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            streamRef.current = s;
          }
        } catch (err) {
          alert('Camera access denied. Enable in Android settings for workout logging.');
          setIsCameraOn(false);
        }
      };
      startCamera();

      return () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
    }
  }, [isCameraOn]);

  // Workout timer
  useEffect(() => {
    if (isCameraOn && workoutTimer > 0) {
      timerRef.current = setInterval(() => {
        setWorkoutTimer(prev => {
          const newTime = prev + 1;
          // Simulate reps: 1 rep every 3 seconds for demo
          if (newTime % 3 === 0) {
            setReps(r => r + 1);
          }
          return newTime;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCameraOn, workoutTimer]);

  // Haversine distance calculation
  const haversineDistance = (pos1: Position, pos2: Position) => {
    const R = 6371; // Earth radius in km
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Start GPS tracking for run
  const startTracking = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported. Use manual input for runs on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const initialPos: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: Date.now(),
        };
        let positions: Position[] = [initialPos];
        setIsTracking(true);

        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const newPos: Position = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              timestamp: Date.now(),
            };
            positions = [...positions, newPos];
            if (positions.length > 1) {
              const totalDist = positions.reduce((acc, curr, idx) => {
                if (idx === 0) return acc;
                return acc + haversineDistance(positions[idx-1], curr);
              }, 0);
              setRunDistance(totalDist);
              // Update quest progress
              if (currentQuest?.type === 'run') {
                updateQuestProgress('run', totalDist);
              }
            }
          },
          (err) => {
            alert(`GPS error: ${err.message}. Check Android location permissions.`);
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );

        if ('vibrate' in navigator) navigator.vibrate(200); // Haptic feedback
      },
      (err) => {
        alert(`Location access denied: ${err.message}. Enable in Android settings.`);
      },
      { enableHighAccuracy: true }
    );
  };

  // Stop tracking
  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    // Complete run quest if target met
    if (currentQuest?.type === 'run' && runDistance >= currentQuest.target) {
      completeQuest();
    }
    // Add to history
    setHistory(prev => [...prev, {
      type: 'Run',
      value: runDistance,
      timestamp: new Date().toLocaleString(),
    }]);
    setRunDistance(0);
  };

  // Update quest progress
  const updateQuestProgress = (type: Quest['type'], amount: number) => {
    setQuests(prev => prev.map(q => {
      if (q.type === type && !q.completed) {
        const newProgress = Math.min(q.progress + amount, q.target);
        return { ...q, progress: newProgress, completed: newProgress >= q.target };
      }
      return q;
    }));

    // Boost stat
    setStats(prev => prev.map(s => {
      if (s.name.toLowerCase().includes(type)) {
        return { ...s, value: Math.min(s.value + (amount / 10), s.max) };
      }
      return s;
    }));

    // Gain EXP
    setExp(prev => Math.min(prev + Math.floor(amount * 5), 100));
  };

  // Get next incomplete quest
  const getNextQuest = () => {
    const nextQuest = quests.find(q => !q.completed);
    return nextQuest || null;
  };

  // Complete quest and level up
  const completeQuest = () => {
    if (currentQuest) {
      setHistory(prev => [...prev, {
        type: currentQuest.title,
        value: currentQuest.target,
        timestamp: new Date().toLocaleString(),
      }]);
      setExp(prev => {
        const newExp = prev + 50;
        if (newExp >= 100) {
          setLevel(l => l + 1);
          setStats(prev => prev.map(s => ({ ...s, value: s.value * 1.1 })));
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
          playSound('levelup');
          setShowModal('levelup');
          setTimeout(() => setShowModal(null), 3000);
          return 0;
        }
        return newExp;
      });

      playSound('quest');
      // Auto-switch to next incomplete quest
      const nextQuest = getNextQuest();
      setCurrentQuest(nextQuest);
    }
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageData);
        // Log reps to history and update progress
        setHistory(prev => [...prev, {
          type: 'Workout Reps',
          value: reps,
          timestamp: new Date().toLocaleString(),
          proof: imageData,
        }]);
        updateQuestProgress('strength', reps / 5); // Example scaling
        setReps(0);
        setWorkoutTimer(0);
      }
    }
  };

  // Start workout session
  const startWorkout = () => {
    setIsCameraOn(true);
    setReps(0);
    setWorkoutTimer(0);
    setShowModal('workout');
  };

  // Stop workout
  const stopWorkout = () => {
    setIsCameraOn(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setWorkoutTimer(0);
    setReps(0);
    setCapturedImage(null);
    setShowModal(null);
    // Complete if enough reps
    if (currentQuest?.type === 'strength' && reps >= currentQuest.target) {
      completeQuest();
    }
  };

  // Simple intelligence quiz (manual for demo)
  const startQuiz = () => {
    // Mock quiz: Answer via button for demo
    const correct = Math.random() > 0.5; // Simulate
    if (correct) {
      updateQuestProgress('intelligence', 1);
    }
    setShowModal('quiz');
  };

  // Chart data from history (simplified)
  const chartData = history.slice(-10).map((entry, idx) => ({
    time: `T${idx}`,
    exp: exp,
    agility: stats[1].value,
  }));

  if (loading) {
    return (
      <div className="system-loading">
        <div className="system-loading-text animate-glow-text">SYSTEM</div>
        <div className="system-loading-bar"></div>
        <div className="system-loading-subtitle">{translations[lang]?.initializing || translations.ru.initializing}</div>
      </div>
    );
  }

  // ===== RENDER SCREENS =====
  const renderHome = () => (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Language Selector - Top Right */}
      <div className="fixed top-3 right-3 z-50">
        <button
          onClick={() => setShowLangMenu(!showLangMenu)}
          className="bg-black/60 backdrop-blur-sm rounded-full px-3 py-2 text-2xl hover:bg-black/80 transition-all border border-purple-500/30"
        >
          {langFlags[lang]}
        </button>
        {showLangMenu && (
          <div className="absolute top-12 right-0 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-purple-500/30 overflow-hidden animate-bounce-in min-w-[140px]">
            {(Object.keys(translations) as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => { setLang(l); setShowLangMenu(false); playSound('click'); }}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-all ${
                  l === lang
                    ? 'bg-purple-700/50 text-yellow-400'
                    : 'hover:bg-gray-700/50 text-gray-300'
                }`}
              >
                <span className="text-lg">{langFlags[l]}</span>
                <span className="text-sm">{langNames[l]}</span>
                {l === lang && <span className="ml-auto text-green-400">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <header className="text-center space-y-4 animate-slide-down">
        <h1 className="text-4xl md:text-6xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-purple-400 animate-glow-text">
          {t('appName')}
        </h1>
        <p className="text-lg opacity-80">{t('tagline')}</p>
        {/* Level & EXP Bar */}
        <div className="bg-black/50 rounded-2xl p-4 shadow-2xl animate-pulse-glow">
          <div className="flex justify-between items-center mb-2">
            <span className="text-2xl font-bold text-yellow-400">{t('level')} {level}</span>
            <span className="text-sm text-purple-300">{exp}/100 {t('exp')}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-green-500 to-emerald-400 h-5 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${exp}%` }}
            />
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
        {stats.map((stat, idx) => {
          const statKeys: Record<string, string> = {
            Strength: 'strength',
            Agility: 'agility',
            Vitality: 'vitality',
            Intelligence: 'intelligence',
          };
          return (
            <div key={stat.name} className="stat-card bg-black/40 rounded-xl p-4 text-center shadow-xl border border-purple-500/30">
              <div className="text-sm font-semibold text-purple-300">{t(statKeys[stat.name] || stat.name)}</div>
              <div className="text-3xl font-black text-yellow-400">{stat.value}</div>
              <div className="text-xs opacity-60">/ {stat.max}</div>
            </div>
          );
        })}
      </section>

      {/* Current Quest */}
      <section className="quest-card bg-gradient-to-r from-indigo-800 to-purple-800 rounded-2xl p-6 shadow-2xl border border-yellow-500/30">
        <h2 className="text-xl font-bold mb-4 text-center">{t('currentQuest')}</h2>
        {currentQuest ? (
          <div className="space-y-4">
            <div className="font-bold text-lg">{currentQuest.title}</div>
            <div className="opacity-80">{currentQuest.description}</div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-emerald-400 h-3 rounded-full transition-all duration-500"
                style={{ width: `${(currentQuest.progress / currentQuest.target) * 100}%` }}
              />
            </div>
            <div className="text-center text-sm">{t('progress')}: {currentQuest.progress}/{currentQuest.target}</div>
            {currentQuest.completed && (
              <div className="text-center text-green-400 font-bold animate-bounce-in">{t('questComplete')}</div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-xl font-bold mb-2">{t('allQuestsComplete')}</div>
            <div className="opacity-70">{t('comeBackTomorrow')}</div>
          </div>
        )}
      </section>

      {/* Action Buttons */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
        <button
          onClick={isTracking ? stopTracking : startTracking}
          className="btn-ripple bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 p-6 rounded-2xl font-bold text-xl shadow-xl transition-all transform hover:scale-105 active:scale-95"
        >
          {isTracking ? t('stopRun') : t('startRun')}
          {isTracking && <div className="text-sm mt-2">📍 {runDistance.toFixed(2)} km</div>}
        </button>
        <button
          onClick={isCameraOn ? stopWorkout : startWorkout}
          className="btn-ripple bg-gradient-to-r from-red-600 to-pink-700 hover:from-red-500 hover:to-pink-600 p-6 rounded-2xl font-bold text-xl shadow-xl transition-all transform hover:scale-105 active:scale-95"
        >
          {isCameraOn ? t('stopWorkout') : t('startWorkout')}
          {isCameraOn && <div className="text-sm mt-2">🔁 {reps} reps | ⏱️ {workoutTimer}s</div>}
        </button>
        <button
          onClick={startQuiz}
          className="btn-ripple bg-gradient-to-r from-blue-600 to-indigo-700 p-4 rounded-xl font-bold hover:bg-blue-500 transition-all"
        >
          {t('quiz')}
        </button>
        <button
          onClick={() => updateQuestProgress('vitality', 30)}
          className="btn-ripple bg-gradient-to-r from-orange-600 to-amber-700 p-4 rounded-xl font-bold hover:bg-orange-500 transition-all"
        >
          {t('endurance')}
        </button>
      </section>
    </div>
  );

  const renderQuests = () => (
    <div className="space-y-4 animate-fade-in pb-20">
      <h2 className="text-2xl font-bold text-center mb-6 animate-slide-down">{t('dailyQuests')}</h2>
      <div className="space-y-3 stagger-children">
        {quests.map((quest) => (
          <button
            key={quest.id}
            onClick={() => !quest.completed && setCurrentQuest(quest)}
            disabled={quest.completed}
            className={`quest-card w-full text-left p-4 rounded-xl transition-all ${
              quest.completed
                ? 'bg-green-900/30 opacity-60 cursor-default'
                : currentQuest?.id === quest.id
                ? 'bg-purple-700 border-2 border-yellow-500 animate-pulse-glow'
                : 'bg-gray-800/50 hover:bg-gray-700/50'
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold text-lg">{quest.title}</span>
                {quest.completed && <span className="ml-2">✅</span>}
                {currentQuest?.id === quest.id && <span className="ml-2 text-yellow-400 text-sm">{t('active')}</span>}
              </div>
              <div className="text-sm opacity-70">{quest.progress}/{quest.target}</div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-emerald-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(quest.progress / quest.target) * 100}%` }}
              />
            </div>
            <div className="text-xs opacity-60 mt-1">{quest.description}</div>
          </button>
        ))}
      </div>
      {quests.length === 0 && (
        <div className="text-center py-12 opacity-60">{t('noQuests')}</div>
      )}
    </div>
  );

  const renderStats = () => (
    <div className="space-y-6 animate-fade-in pb-20">
      <h2 className="text-2xl font-bold text-center mb-6 animate-slide-down">{t('growthChart')}</h2>
      <div className="bg-black/50 rounded-2xl p-4 shadow-xl">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" stroke="#e2e8f0" />
            <YAxis stroke="#e2e8f0" />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="exp" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="agility" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats Detail */}
      <h3 className="text-xl font-bold text-center mt-6">{t('statDetails')}</h3>
      <div className="grid grid-cols-1 gap-3 stagger-children">
        {stats.map((stat) => {
          const statKeys: Record<string, string> = {
            Strength: 'strength',
            Agility: 'agility',
            Vitality: 'vitality',
            Intelligence: 'intelligence',
          };
          return (
            <div key={stat.name} className="stat-card bg-black/40 rounded-xl p-4 shadow-xl border border-purple-500/30">
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-bold text-purple-300">{t(statKeys[stat.name] || stat.name)}</span>
                <span className="text-2xl font-black text-yellow-400">{stat.value}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-700"
                  style={{ width: `${(stat.value / stat.max) * 100}%` }}
                />
              </div>
              <div className="text-xs opacity-60 mt-1">{stat.value}/{stat.max} ({Math.round((stat.value / stat.max) * 100)}%)</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-4 animate-fade-in pb-20">
      <h2 className="text-2xl font-bold text-center mb-6 animate-slide-down">{t('questHistory')}</h2>
      <div className="max-h-96 overflow-y-auto space-y-3 bg-black/30 rounded-xl p-4">
        {history.length === 0 ? (
          <div className="text-center opacity-50 py-12">{t('noHistory')}</div>
        ) : (
          history.slice().reverse().map((entry, idx) => (
            <div key={idx} className="flex items-center space-x-3 p-3 bg-gray-800/50 rounded-lg animate-slide-left">
              <div className="flex-1">
                <div className="font-bold">{entry.type}</div>
                <div className="text-sm opacity-70">{entry.value} {t('pts')} — {entry.timestamp}</div>
              </div>
              {entry.proof && (
                <img src={entry.proof} alt="Proof" className="w-12 h-12 rounded object-cover border border-green-500" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Camera Overlay
  const cameraOverlay = isCameraOn && (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4 space-y-4 animate-fade-in">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full max-w-md rounded-xl border-4 border-yellow-500 shadow-2xl"
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className="text-center space-y-2">
        <div className="text-2xl font-bold">{t('pushupForm')}</div>
        <div>{t('keepGoing')}</div>
        <button
          onClick={capturePhoto}
          className="bg-yellow-500 text-black px-8 py-3 rounded-full font-bold text-lg hover:bg-yellow-400 transition-all btn-ripple"
        >
          {t('captureProof')}
        </button>
      </div>
      {capturedImage && (
        <img src={capturedImage} alt="Captured workout" className="w-32 h-32 rounded-full object-cover border-4 border-green-500 animate-bounce-in" />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white font-sans overflow-x-hidden">
      {/* Main Content Area */}
      <main className="p-3 md:p-6">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'quests' && renderQuests()}
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'history' && renderHistory()}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-purple-500/30 z-40">
        <div className="flex justify-around items-center py-2">
          {[
            { id: 'home' as const, icon: '🏠', label: t('home') },
            { id: 'quests' as const, icon: '⚔️', label: t('quests') },
            { id: 'stats' as const, icon: '📊', label: t('stats') },
            { id: 'history' as const, icon: '📜', label: t('history') },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { playSound('click'); setActiveTab(tab.id); }}
              className={`flex flex-col items-center px-3 py-1 rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'text-yellow-400 bg-purple-800/50 scale-110'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs mt-0.5">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Camera Overlay */}
      {cameraOverlay}

      {/* Modals */}
      {showModal === 'levelup' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl p-8 text-center space-y-4 max-w-md w-full animate-system-reveal">
            <div className="text-5xl font-black">{t('levelUp')}</div>
            <div className="text-xl">{t('levelUpText')}</div>
          </div>
        </div>
      )}
      {showModal === 'quiz' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-indigo-800 rounded-2xl p-6 text-center space-y-4 max-w-sm w-full animate-bounce-in">
            <div className="text-xl font-bold">{t('quizComplete')}</div>
            <div>{t('quizText')}</div>
            <button onClick={() => setShowModal(null)} className="bg-purple-600 px-6 py-2 rounded-full btn-ripple">{t('close')}</button>
          </div>
        </div>
      )}
      {showModal === 'workout' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40 p-4 animate-fade-in">
          <div className="bg-red-900/90 rounded-xl p-4 text-center max-w-md w-full backdrop-blur-sm">
            <div>{t('workoutInProgress')}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
