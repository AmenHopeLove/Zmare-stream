import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Upload, 
  Play, 
  Settings, 
  Zap, 
  FileVideo, 
  Key, 
  Globe, 
  Activity,
  CheckCircle2,
  RadioTower,
  StopCircle,
  Clock,
  RefreshCw,
  User,
  Users,
  TrendingUp,
  Trash2,
  Image as ImageIcon,
  Wand2,
  Download,
  Sparkles
} from 'lucide-react';

interface ActiveStream {
  id: string;
  inputPath: string;
  rtmpUrl: string;
  startTime: string;
  node?: 'local' | 'cloud';
}

interface StreamMetrics {
  bitrate: number;
  speed: number;
  frames: number;
}

interface Profile {
  id: string;
  title: string;
  thumbnail: string;
}

const Studio = () => {
  const [activeStreams, setActiveStreams] = useState<ActiveStream[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [streamLogs, setStreamLogs] = useState<Record<string, string[]>>({});
  const [streamMetrics, setStreamMetrics] = useState<Record<string, StreamMetrics>>({});
  const [showConsole, setShowConsole] = useState<Record<string, boolean>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [isFetchingKey, setIsFetchingKey] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab] = useState<'upload' | 'target' | 'history' | 'analytics'>('upload');
  const [sourceType, setSourceType] = useState<'computer' | 'gdrive' | 'dropbox' | 'youtube'>('computer');
  const [videoPath, setVideoPath] = useState<string>('');
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [directPath, setDirectPath] = useState('');
  const [cloudSuccess, setCloudSuccess] = useState(false);
  const [rtmpUrl, setRtmpUrl] = useState('rtmps://a.rtmp.youtube.com:443/live2');
  const [streamKey, setStreamKey] = useState('');
  const [manualAccount, setManualAccount] = useState({ title: '', id: '' });
  const [showManualAccount, setShowManualAccount] = useState(false);
  const [serverConfig, setServerConfig] = useState<{supabase: boolean | string, youtube: boolean} | null>(null);
  const [targetMode, setTargetMode] = useState<'local' | 'cloud'>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thumbnail generator states
  const [thumbPrompt, setThumbPrompt] = useState('');
  const [genThumbnailUrl, setGenThumbnailUrl] = useState<string | null>(null);
  const [isGeneratingThumb, setIsGeneratingThumb] = useState(false);

  // Helper to resolve non-direct links (Google Drive, Dropbox)
  const resolveDirectLink = (url: string) => {
    if (!url) return '';
    
    // Google Drive
    if (url.includes('drive.google.com')) {
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://drive.google.com/uc?export=download&id=${match[1]}`;
      }
    }
    
    // Dropbox
    if (url.includes('dropbox.com')) {
      return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('?dl=1', '');
    }
    
    return url;
  };

  const getApiBase = () => targetMode === 'cloud' ? 'https://amen4-zmare-dashboard.hf.space/api' : '/api';
  const API_BASE = '/api'; // keep for generic ops like auth
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  const getUptime = (startTime: string) => {
    const start = new Date(startTime).getTime();
    const now = new Date().getTime();
    const diff = Math.floor((now - start) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const fetchActiveStreams = async () => {
    try {
      const [localRes, cloudRes] = await Promise.allSettled([
        axios.get('/api/stream/active'),
        axios.get('https://amen4-zmare-dashboard.hf.space/api/stream/active')
      ]);
      
      let allStreams: ActiveStream[] = [];
      if (localRes.status === 'fulfilled') {
        allStreams = [...allStreams, ...localRes.value.data.streams.map((s: any) => ({ ...s, node: 'local' }))];
      }
      if (cloudRes.status === 'fulfilled') {
        allStreams = [...allStreams, ...cloudRes.value.data.streams.map((s: any) => ({ ...s, node: 'cloud' }))];
      }
      setActiveStreams(allStreams);
    } catch (err) {
      console.error('Failed to fetch active streams:', err);
    }
  };

  useEffect(() => {
    fetchActiveStreams();
    const interval = setInterval(fetchActiveStreams, 3000);
    
    const fetchProfiles = async () => {
      try {
        const res = await axios.get('/api/auth/profiles');
        setProfiles(res.data.profiles);
        if (res.data.profiles.length > 0 && !selectedProfileId) {
          setSelectedProfileId(res.data.profiles[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
      }
    };

    // Fetch saved profiles on mount
    fetchProfiles();

    const fetchConfig = async () => {
      try {
        const res = await axios.get('/health');
        setServerConfig(res.data.config);
      } catch (err) {
        console.error('Failed to fetch server config:', err);
      }
    };
    fetchConfig();

    // Listen for OAuth Success from the popup
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data.type === 'AUTH_SUCCESS') {
        fetchProfiles();
      }
    };
    window.addEventListener('message', handleAuthMessage);

    const localSocket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 10
    });
    
    const cloudSocket = io('https://amen4-zmare-dashboard.hf.space', {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 10
    });
    
    const handleLog = ({ streamId, message }: any) => {
      setStreamLogs(prev => ({
        ...prev,
        [streamId]: [...(prev[streamId] || []).slice(-49), message]
      }));
    };

    const handleProgress = ({ streamId, ...metrics }: any) => {
      setStreamMetrics(prev => ({
        ...prev,
        [streamId]: metrics as StreamMetrics
      }));
    };
    
    localSocket.on('stream:log', handleLog);
    cloudSocket.on('stream:log', handleLog);
    localSocket.on('stream:progress', handleProgress);
    cloudSocket.on('stream:progress', handleProgress);

    localSocket.on('upload:progress', ({ progress }) => {
      setUploadProgress(progress);
    });
    cloudSocket.on('upload:progress', ({ progress }) => {
      setUploadProgress(progress);
    });

    return () => {
      clearInterval(interval);
      localSocket.disconnect();
      cloudSocket.disconnect();
    };
  }, []);

  // Sync Playlist when profile changes
  useEffect(() => {
    if (selectedProfile) {
      axios.get(`${API_BASE}/stream/playlist/${selectedProfile.id}`)
        .then(res => setPlaylist(res.data.items))
        .catch(err => console.error('Playlist Fetch Error:', err));
    }
  }, [selectedProfile]);

  // Save Playlist when it changes
  useEffect(() => {
    if (selectedProfile && playlist.length > 0) {
      axios.post(`${API_BASE}/stream/playlist/${selectedProfile.id}`, { items: playlist })
        .catch(err => console.error('Playlist Sync Error:', err));
    }
  }, [playlist, selectedProfile]);

  // Fetch Analytics when tab is active
  useEffect(() => {
    if (activeTab === 'analytics' && selectedProfile) {
      axios.get(`${API_BASE}/stream/analytics/${selectedProfile.id}`)
        .then(res => setAnalyticsData(res.data.metrics))
        .catch(err => console.error('Analytics Fetch Error:', err));
    }
  }, [activeTab, selectedProfile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      setUploadStatus('idle');
      setUploadProgress(0);
      setErrorMessage(null);
      setSourceType('computer');
    }
  };

  const handleStopStream = async (streamId: string, node?: 'local' | 'cloud') => {
    try {
      const targetApi = node === 'cloud' ? 'https://amen4-zmare-dashboard.hf.space/api' : '/api';
      await axios.post(`${targetApi}/stream-legacy/stop`, { streamId });
      fetchActiveStreams();
    } catch (err) {
      console.error('Stop failed:', err);
    }
  };

  const handleFetchKey = async () => {
    if (!selectedProfileId) return;
    setIsFetchingKey(true);
    try {
      const res = await axios.get(`${API_BASE}/auth/broadcast-key/${selectedProfileId}`);
      setStreamKey(res.data.key);
      // Force RTMPS for Hugging Face environment compatibility
      const secureUrl = res.data.url.replace('rtmp://', 'rtmps://').replace(':1935', ':443');
      setRtmpUrl(secureUrl.includes(':443') ? secureUrl : secureUrl.replace('/live2', ':443/live2'));
    } catch (err) {
      console.error('Failed to fetch key:', err);
    } finally {
      setIsFetchingKey(false);
    }
  };

  const handleRemoveProfile = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/auth/profile/${id}`);
      setProfiles(profiles.filter(p => p.id !== id));
      if (selectedProfileId === id) setSelectedProfileId(null);
    } catch (err) {
      console.error('Failed to remove profile:', err);
    }
  };

  const handleUpload = async () => {
    if (!videoFile) return;
    setUploadStatus('uploading');
    setUploadProgress(0);
    setErrorMessage(null);
    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const res = await axios.post(`${getApiBase()}/upload/video`, formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded));
          setUploadProgress(percentCompleted);
        }
      });
      setUploadedPath(res.data.path);
      setVideoPath(res.data.path);
      setUploadStatus('success');
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadStatus('error');
      setErrorMessage(err.response?.data?.error || err.message || 'Upload failed.');
    }
  };

  const handleCloudImport = async () => {
    if (!directPath) return;
    setUploadStatus('uploading');
    setUploadProgress(0);
    setErrorMessage(null);

    try {
      const resolved = resolveDirectLink(directPath);
      const res = await axios.post(`${getApiBase()}/upload/fetch-cloud`, { url: resolved });
      setUploadedPath(res.data.path);
      setVideoPath(res.data.path);
      setUploadStatus('success');
      setCloudSuccess(true);
      setTimeout(() => setCloudSuccess(false), 3000);
    } catch (err: any) {
      console.error('Cloud Import failed:', err);
      setUploadStatus('error');
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to import from cloud.');
    }
  };

  const handleYouTubeImport = async () => {
    if (!directPath) return;
    setUploadStatus('uploading');
    setUploadProgress(0);
    setErrorMessage(null);

    try {
      const res = await axios.post(`${getApiBase()}/upload/fetch-youtube`, { url: directPath });
      setUploadedPath(res.data.path);
      setVideoPath(res.data.path);
      setUploadStatus('success');
      setCloudSuccess(true);
      setTimeout(() => setCloudSuccess(false), 3000);
    } catch (err: any) {
      console.error('YouTube Import failed:', err);
      setUploadStatus('error');
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to import from YouTube.');
    }
  };

  const handleStartLoop = async () => {
    if ((!videoPath && playlist.length === 0) || !streamKey) return;
    setIsStarting(true);
    try {
      const paths = playlist.length > 0 ? playlist : [videoPath || (sourceType !== 'computer' ? directPath : uploadedPath)];
      await axios.post(`${getApiBase()}/stream/start-loop`, {
        videoPaths: paths,
        rtmpUrl: rtmpUrl,
        streamKey: streamKey
      });
      setStreamKey(''); // Clear security key after start
      await fetchActiveStreams();
    } catch (err) {
      console.error('Failed to start loop:', err);
    } finally {
      setIsStarting(false);
    }
  };

  const handleConnectYouTube = () => {
    window.open('/api/auth/login', '_blank', 'width=600,height=600');
  };

  const handleManualAddAccount = async () => {
    if (!manualAccount.title || !manualAccount.id) return;
    try {
      await axios.post('/api/auth/profile/manual', manualAccount);
      setProfiles(prev => [...prev, { ...manualAccount, thumbnail: 'https://i.pravatar.cc/150?u=' + manualAccount.id }]);
      setManualAccount({ title: '', id: '' });
      setShowManualAccount(false);
    } catch (err) {
      console.error('Failed to add manual account:', err);
    }
  };

  const generateThumbnail = () => {
    if (!thumbPrompt) return;
    setIsGeneratingThumb(true);
    setGenThumbnailUrl(null);
    
    const seed = Math.floor(Math.random() * 10000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(thumbPrompt)}?width=1280&height=720&nologo=true&seed=${seed}`;
    
    const img = new Image();
    img.src = url;
    img.onload = () => {
      setGenThumbnailUrl(url);
      setIsGeneratingThumb(false);
    };
    img.onerror = () => {
      setIsGeneratingThumb(false);
      setErrorMessage('Failed to generate thumbnail via AI pipeline. Please try again.');
    };
  };

  const downloadThumbnail = async () => {
    if (!genThumbnailUrl) return;
    try {
      const response = await fetch(genThumbnailUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zmare-thumbnail-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-yellow-500/30 overflow-hidden">
      {/* Top Header */}
      <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
            <Zap className="w-6 h-6 text-black fill-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase italic drop-shadow-sm">Zmare 24/7</h1>
            <p className="text-[10px] text-yellow-500/60 uppercase tracking-[0.2em] font-medium leading-none mt-0.5">Multi-Account Playout Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {serverConfig && (
             <div className="hidden lg:flex items-center gap-4 text-[9px] font-bold uppercase tracking-widest">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
                   <div className={`w-1.5 h-1.5 rounded-full ${serverConfig.supabase === true ? 'bg-green-500' : (serverConfig.supabase === 'fallback' ? 'bg-yellow-500' : 'bg-red-500')}`} />
                   <span className="opacity-50">Local DB:</span>
                   <span className={serverConfig.supabase === true ? 'text-green-500' : 'text-yellow-500'}>
                     {serverConfig.supabase === true ? 'CLOUD' : 'ACTIVE'}
                   </span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
                   <div className={`w-1.5 h-1.5 rounded-full ${serverConfig.youtube ? 'bg-green-500' : 'bg-red-500'}`} />
                   <span className="opacity-50">YouTube API:</span>
                   <span className={serverConfig.youtube ? 'text-green-500' : 'text-red-500'}>
                     {serverConfig.youtube ? 'READY' : 'OFFLINE'}
                   </span>
                </div>
             </div>
          )}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className={`w-2 h-2 rounded-full ${activeStreams.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[11px] font-mono uppercase tracking-wider text-white/70">
              {activeStreams.length} Active Node{activeStreams.length !== 1 && 's'}
            </span>
          </div>
          <button className="p-2.5 rounded-full hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
            <Settings className="w-5 h-5 text-white/50" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full space-y-12">
        {/* Top Section: Builder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Upload & Config */}
          <div className="space-y-8">
            
            {/* Target Engine Toggle */}
            <div className="flex bg-black/40 border border-white/10 rounded-2xl p-1.5 relative overflow-hidden">
              <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-xl transition-all duration-300 ${targetMode === 'local' ? 'left-1.5 bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'left-[calc(50%+4.5px)] bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'}`} />
              <button onClick={() => setTargetMode('local')} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest z-10 transition-colors ${targetMode === 'local' ? 'text-black' : 'text-white/40 hover:text-white/70'}`} >
                 <Activity size={14} /> Local CPU Engine
              </button>
              <button onClick={() => setTargetMode('cloud')} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest z-10 transition-colors ${targetMode === 'cloud' ? 'text-black' : 'text-white/40 hover:text-white/70'}`} >
                 <Globe size={14} /> HuggingFace Cloud
              </button>
            </div>

            <section className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-md shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Upload className="w-12 h-12" />
               </div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
                    <FileVideo className="w-4 h-4" /> 1. Video Content Source
                  </h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSourceType('computer')}
                      className={`text-[9px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${sourceType === 'computer' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}
                    >
                      <Upload size={12} /> Computer
                    </button>
                    <button 
                      onClick={() => setSourceType('gdrive')}
                      className={`text-[9px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${sourceType === 'gdrive' ? 'bg-[#3573E0]/20 border-[#3573E0]/40 text-[#3573E0]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}
                    >
                      <Globe size={12} /> Google Drive
                    </button>
                    <button 
                      onClick={() => setSourceType('dropbox')}
                      className={`text-[9px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${sourceType === 'dropbox' ? 'bg-[#0061FF]/20 border-[#0061FF]/40 text-[#0061FF]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}
                    >
                      <Activity size={12} /> Dropbox
                    </button>
                    <button 
                      onClick={() => setSourceType('youtube')}
                      className={`text-[9px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${sourceType === 'youtube' ? 'bg-[#FF0000]/20 border-[#FF0000]/40 text-[#FF0000]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}
                    >
                      <Play size={12} /> YouTube
                    </button>
                  </div>
                </div>
               
                {sourceType === 'computer' ? (
                  <div className="space-y-6">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`
                        border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer
                        ${videoFile ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-white/10 hover:border-white/20 hover:bg-white/2'}
                      `}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept="video/*" 
                        className="hidden" 
                      />
                      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                          <Upload className={`w-8 h-8 ${videoFile ? 'text-yellow-500' : 'text-white/20'}`} />
                      </div>
                      <div className="text-center">
                          <p className="text-sm font-bold">{videoFile ? videoFile.name : 'Drop video here or click to browse'}</p>
                          <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">MP4, MKV, MOV up to 100GB</p>
                      </div>
                    </div>

                    {videoFile && uploadStatus !== 'success' && (
                      <div className="space-y-4">
                        {uploadStatus === 'uploading' && (
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/40">
                              <span>Pushing to Cloud Node</span>
                              <span className="text-yellow-500">{uploadProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-yellow-500 transition-all duration-300" 
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <button 
                          onClick={handleUpload}
                          disabled={uploadStatus === 'uploading'}
                          className="w-full bg-white text-black py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-yellow-500 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" /> CONFIRM LOCAL UPLOAD
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                     <div className="relative group">
                       <FileVideo className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-hover:text-yellow-500 transition-colors" />
                       <input 
                         type="text" 
                         placeholder={sourceType === 'gdrive' ? "Paste Shared Google Drive Link" : sourceType === 'youtube' ? "Paste YouTube Video Link" : "Paste Shared Dropbox Link"}
                         value={directPath}
                         onChange={(e) => setDirectPath(e.target.value)}
                         className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-mono focus:border-yellow-500 focus:outline-none transition-all placeholder:text-white/10"
                       />
                     </div>
                     {uploadStatus === 'uploading' && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                           <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/40">
                             <span>Fetching Cloud Media</span>
                             <span className="text-yellow-500">{uploadProgress}%</span>
                           </div>
                           <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                             <div className="h-full bg-yellow-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                           </div>
                        </div>
                     )}
                     <button 
                        onClick={sourceType === 'youtube' ? handleYouTubeImport : handleCloudImport}
                        disabled={!directPath || uploadStatus === 'uploading'}
                        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                     >
                       <RefreshCw className={uploadStatus === 'uploading' ? 'animate-spin' : ''} size={14} /> 
                       {uploadStatus === 'uploading' ? 'Importing System Media...' : 'Import to Zmare Engine'}
                     </button>

                     {cloudSuccess && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-[10px] text-green-500 font-bold uppercase tracking-widest text-center">
                           ✨ Cloud Media Locked & Ready!
                        </div>
                     )}
                  </div>
               )}

               {errorMessage && (
                  <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-[10px] text-red-500 font-bold uppercase tracking-widest text-center">
                    ❌ {errorMessage}
                  </div>
               )}
            </section>
          </div>

          {/* Right Column: Key Config & Launch */}
          <div className="space-y-8 flex flex-col">
            <section className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-md shadow-2xl flex-1 flex flex-col">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/40 mb-6 flex items-center gap-2">
                <Key className="w-4 h-4" /> 2. Account Target
              </h2>
              
              <div className="space-y-6 flex-1">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 ml-2">RTMP Base URL</label>
                  <div className="relative group">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-hover:text-blue-500 transition-colors" />
                    <input 
                      type="text" 
                      value={rtmpUrl}
                      onChange={(e) => setRtmpUrl(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-mono focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                   <div className="flex justify-between items-center px-2">
                     <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Connect YouTube Profile</label>
                     <button 
                        onClick={handleConnectYouTube}
                        className="text-[9px] font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                      >
                        <Users className="w-3 h-3" /> Add Account
                      </button>
                   </div>
                   
                   {!serverConfig?.youtube && profiles.length === 0 && (
                     <div className="mx-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
                        <p className="text-[10px] text-yellow-500/80 font-medium leading-relaxed">
                          ⚠️ YouTube API keys missing in .env. Automated login is disabled, but you can still use **Manual RTMP Mode** below.
                        </p>
                     </div>
                   )}
                   
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {profiles.map(profile => (
                        <div 
                          key={profile.id}
                          onClick={() => setSelectedProfileId(profile.id)}
                          className={`
                            relative p-3 rounded-2xl border transition-all cursor-pointer flex flex-col items-center text-center gap-2
                            ${selectedProfileId === profile.id ? 'bg-yellow-500/10 border-yellow-500/40 shadow-lg shadow-yellow-500/5' : 'bg-white/2 border-white/5 hover:border-white/10'}
                          `}
                        >
                          <img src={profile.thumbnail} alt={profile.title} className="w-10 h-10 rounded-full border border-white/10" />
                          <span className="text-[9px] font-bold truncate w-full opacity-60 leading-tight">{profile.title}</span>
                          {selectedProfileId === profile.id && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                              <CheckCircle2 className="w-3 h-3 text-black" />
                            </div>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleRemoveProfile(profile.id); }}
                            className="absolute bottom-1 right-1 p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                          >
                             <Trash2 className="w-2 h-2" />
                          </button>
                        </div>
                      ))}
                      {profiles.length === 0 && (
                        <div className="col-span-full py-6 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center gap-2 opacity-30">
                          <User className="w-6 h-6" />
                          <span className="text-[9px] uppercase font-bold">No accounts linked</span>
                        </div>
                      )}
                   </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center px-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Targeting Account Details</label>
                    <div className="flex gap-2">
                      <button 
                         onClick={handleFetchKey}
                         disabled={isFetchingKey || !selectedProfileId}
                         className="text-[9px] font-bold uppercase tracking-wider text-yellow-500 hover:text-yellow-400 transition-colors flex items-center gap-1 disabled:opacity-20"
                      >
                        <RefreshCw className={`w-3 h-3 ${isFetchingKey ? 'animate-spin' : ''}`} /> Sync Secure Key
                      </button>
                    </div>
                  </div>
                  <div className="relative group">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-hover:text-yellow-500 transition-colors" />
                    <input 
                      type="password" 
                      placeholder="••••-••••-••••-••••"
                      value={streamKey}
                      onChange={(e) => setStreamKey(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-mono focus:border-yellow-500 focus:outline-none transition-all placeholder:text-white/10"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-white/5">
                 <button 
                  onClick={handleStartLoop}
                  disabled={isStarting || (!streamKey) || (playlist.length === 0 && !videoPath && !uploadedPath && !directPath)}
                  className="w-full px-12 py-5 rounded-2xl bg-yellow-500 text-black font-bold uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-yellow-500/20 disabled:opacity-20 disabled:grayscale flex items-center justify-center gap-3"
                 >
                  <Play className="w-5 h-5 fill-current" />
                  {isStarting ? 'Initiating Node...' : 'Launch New Playout Node'}
                 </button>
                 {!streamKey && (
                    <p className="text-[9px] text-center text-white/20 uppercase tracking-widest mt-4">
                      Sync Secure Key to enable launch
                    </p>
                 )}
              </div>
            </section>
          </div>
        </div>

        {/* AI Thumbnail Studio Section */}
        <section className="bg-gradient-to-r from-indigo-900/40 via-purple-900/40 to-black border border-indigo-500/20 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 mix-blend-screen pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <Wand2 className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold uppercase tracking-[0.2em] text-white flex items-center gap-2">
                  AI Thumbnail Studio <Sparkles className="w-4 h-4 text-yellow-500" />
                </h2>
                <p className="text-[10px] text-indigo-300/60 uppercase tracking-widest font-medium mt-1">Synthesize 4K Stream Thumbnails instantly</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-[1fr,400px] gap-8">
              <div className="space-y-4 flex flex-col justify-center">
                <div className="relative">
                  <textarea
                    placeholder="Describe your perfect thumbnail... (e.g. Cyberpunk DJ playing music on a neon stage, octane render, 8k)"
                    value={thumbPrompt}
                    onChange={(e) => setThumbPrompt(e.target.value)}
                    className="w-full bg-black/40 border border-indigo-500/20 rounded-2xl p-4 min-h-[120px] text-sm focus:border-indigo-500 focus:outline-none transition-all placeholder:text-white/20 custom-scrollbar resize-none"
                  />
                </div>
                <button 
                   onClick={generateThumbnail}
                   disabled={!thumbPrompt || isGeneratingThumb}
                   className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingThumb ? <RefreshCw className="animate-spin w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
                  {isGeneratingThumb ? 'Synthesizing Matrix...' : 'Generate AI Thumbnail'}
                </button>
              </div>
              
              <div className="bg-black/50 border border-white/5 rounded-2xl aspect-video relative flex items-center justify-center overflow-hidden">
                {genThumbnailUrl ? (
                  <>
                    <img src={genThumbnailUrl} alt="Generated Thumbnail" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-6">
                      <button 
                        onClick={downloadThumbnail}
                        className="bg-white text-black px-6 py-3 rounded-full font-bold uppercase tracking-widest text-[10px] flex items-center gap-2 hover:bg-yellow-500 transition-colors shadow-2xl"
                      >
                        <Download className="w-4 h-4" /> Save HD Image
                      </button>
                    </div>
                  </>
                ) : isGeneratingThumb ? (
                  <div className="flex flex-col items-center gap-4">
                     <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                     <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Rendering Pixels...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 opacity-30">
                    <ImageIcon className="w-12 h-12" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-center px-4">Preview Window<br/>Your generated thumbnail will appear here</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Bottom Section: Active Streams */}
        <section className="space-y-6">
          <div className="flex justify-between items-end border-b border-white/10 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-[0.2em] text-white flex items-center gap-3">
              <RadioTower className="w-6 h-6 text-green-500" /> Active Playout Fleet
            </h2>
            <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              Live Instances: <span className="text-white bg-white/10 px-2 py-1 rounded-full ml-1">{activeStreams.length}</span>
            </div>
          </div>

          {activeStreams.length === 0 ? (
            <div className="p-16 border border-white/5 rounded-[2.5rem] bg-white/2 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <Activity className="w-10 h-10 text-white/20" />
              </div>
              <h3 className="text-lg font-bold uppercase italic text-white/40">No Systems Active</h3>
              <p className="text-xs text-white/20 mt-2 tracking-widest uppercase">Configure a target above to launch the first stream node.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {activeTab === 'analytics' && (
                <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
                  <div className="glass-panel p-8 rounded-3xl">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                      <TrendingUp className="text-indigo-400" /> Audience Insights
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                      <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
                        <p className="text-slate-400 text-sm mb-1">Live Viewers</p>
                        <p className="text-3xl font-bold text-white">42</p>
                        <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                          <TrendingUp size={12} /> +12% from last hour
                        </p>
                      </div>
                      <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
                        <p className="text-slate-400 text-sm mb-1">Peak Concurrent</p>
                        <p className="text-3xl font-bold text-white">156</p>
                        <p className="text-xs text-slate-500 mt-2">Reached 2 hours ago</p>
                      </div>
                      <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
                        <p className="text-slate-400 text-sm mb-1">New Subscribers</p>
                        <p className="text-3xl font-bold text-white">+8</p>
                        <p className="text-xs text-indigo-400 mt-2">During this stream</p>
                      </div>
                    </div>

                    <div className="h-64 relative bg-slate-900/30 rounded-3xl border border-slate-800/50 overflow-hidden p-6">
                      <div className="absolute inset-0 flex items-end justify-between px-6 pb-6 gap-1">
                        {analyticsData.length === 0 ? (
                          <div className="w-full h-full flex items-center justify-center text-slate-600 italic">No data points recorded yet. Streaming sessions track every 5 minutes.</div>
                        ) : (
                          analyticsData.map((d, i) => (
                            <div 
                              key={i} 
                              className="flex-1 bg-indigo-500/40 hover:bg-indigo-400 rounded-t-sm transition-all duration-300 relative group"
                              style={{ height: `${Math.min(100, (d.viewer_count / (Math.max(...analyticsData.map(x => x.viewer_count)) || 10)) * 100)}%` }}
                            >
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                                {d.viewer_count} Viewers
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="absolute top-4 left-6 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-xs font-bold text-indigo-400 tracking-wider">REAL-TIME TRAFFIC ({analyticsData.length} pts)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeStreams.map(stream => {
                 const metrics = streamMetrics[stream.id];
                 const logs = streamLogs[stream.id] || [];
                 const isConsoleOpen = showConsole[stream.id];

                 return (
                   <div key={stream.id} className="relative bg-black border border-white/10 rounded-[2rem] p-6 shadow-2xl overflow-hidden group flex flex-col">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                     <div className="absolute top-4 right-4 flex items-center gap-2">
                       <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${stream.node === 'cloud' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-green-500/20 text-green-400 border-green-500/40'}`}>
                         {stream.node === 'cloud' ? 'CLOUD' : 'LOCAL'}
                       </span>
                       <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                       <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">Live</span>
                     </div>

                     <div className="mb-6">
                        <h3 className="text-sm font-bold uppercase tracking-widest truncate max-w-[80%] opacity-80" title={stream.inputPath}>
                          Source ID: {(stream.inputPath || 'Unknown Media').split(/[/\\]/).pop()}
                        </h3>
                        <p className="text-[10px] font-mono text-white/30 mt-1 truncate" title={stream.rtmpUrl}>
                          TARGET: {(stream.rtmpUrl || '').replace(/live2\/.*$/, 'live2/••••••••••••')}
                        </p>
                     </div>

                     <div className="space-y-4 flex-1">
                       <div className="grid grid-cols-2 gap-3">
                         <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col">
                            <span className="text-[9px] uppercase font-bold text-white/20 tracking-widest mb-1">Bitrate</span>
                            <span className="text-xs font-mono font-bold text-yellow-500">{metrics?.bitrate || 0} kbps</span>
                         </div>
                         <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col">
                            <span className="text-[9px] uppercase font-bold text-white/20 tracking-widest mb-1">Speed</span>
                            <span className="text-xs font-mono font-bold text-blue-500">{metrics?.speed || 0} fps</span>
                         </div>
                       </div>

                       <div className="bg-white/5 rounded-xl p-4 border border-white/5 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <Clock className="w-4 h-4 text-white/20" />
                           <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Uptime</span>
                         </div>
                         <span className="text-sm font-mono font-bold text-white/60">{getUptime(stream.startTime)}</span>
                       </div>

                       {isConsoleOpen && (
                         <div className="bg-black/80 rounded-xl p-3 border border-white/5 font-mono text-[9px] h-32 overflow-y-auto space-y-1 custom-scrollbar">
                           {logs.length === 0 && <span className="text-white/10 italic">Awaiting telemetry...</span>}
                           {logs.map((log, idx) => (
                             <div key={idx} className="text-white/40 break-all border-b border-white/5 pb-1">
                               <span className="text-yellow-500/40 mr-2">[{idx}]</span> {log}
                             </div>
                           ))}
                         </div>
                       )}

                       <div className="flex gap-2">
                         <button 
                           onClick={() => setShowConsole(prev => ({ ...prev, [stream.id]: !isConsoleOpen }))}
                           className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 font-bold uppercase tracking-[0.2em] text-[9px] hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
                         >
                           <Activity className="w-4 h-4" /> {isConsoleOpen ? 'Hide Console' : 'View Console'}
                         </button>
                         <button 
                           onClick={() => handleStopStream(stream.id, stream.node)}
                           className="px-4 py-3 rounded-xl bg-red-600/10 border border-red-600/20 text-red-500 font-bold hover:bg-red-600 hover:text-white transition-all"
                         >
                           <StopCircle className="w-4 h-4" />
                         </button>
                       </div>
                     </div>
                   </div>
                 );
               })}
            </div>
          )}
        </section>
      </main>

      <footer className="h-10 border-t border-white/5 bg-black/60 flex items-center justify-between px-8 text-[10px] text-white/20 uppercase tracking-[0.2em] font-medium">
        <div>Zmare Cloud Fleet v2.0.0 • Dual Engine Infrastructure</div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-yellow-500 transition-colors">Safety</a>
          <a href="#" className="hover:text-yellow-500 transition-colors">API Keys</a>
          <a href="#" className="hover:text-yellow-500 transition-colors">Logs</a>
        </div>
      </footer>
    </div>
  );
};

export default Studio;
