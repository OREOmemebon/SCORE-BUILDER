import React, { useState, useEffect, useRef } from 'react';
import { 
  Music, 
  Upload, 
  Search, 
  Image as ImageIcon, 
  Edit3, 
  ChevronLeft, 
  Download, 
  Play, 
  Pause,
  Loader2,
  Trash2,
  RotateCcw,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import abcjs from 'abcjs';
import { useDropzone } from 'react-dropzone';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// --- Types ---
type Feature = 'audio' | 'title' | 'image' | 'editor';
type Difficulty = 'Elementary' | 'Intermediate' | 'Advanced';
type ContentType = 'Melody' | 'Accompaniment';
type Clef = 'treble' | 'bass';

// --- Helper Functions ---
const shiftABCNote = (note: string, offset: number): string => {
  if (note === "z" || note === "|") return note;
  let result = note;
  if (offset > 0) {
    for (let i = 0; i < offset; i++) {
       if (result.endsWith(",")) {
         result = result.slice(0, -1);
       } else if (result.match(/^[A-G]$/)) {
         result = result.toLowerCase();
       } else {
         result += "'";
       }
    }
  } else if (offset < 0) {
    for (let i = 0; i < Math.abs(offset); i++) {
       if (result.endsWith("'")) {
         result = result.slice(0, -1);
       } else if (result.match(/^[a-g]$/)) {
         result = result.toUpperCase();
       } else {
         result += ",";
       }
    }
  }
  return result;
};

const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result?.toString().split(',')[1] || '');
    reader.onerror = (error) => reject(error);
  });
};

// --- Components ---

export default function App() {
  const [view, setView] = useState<'selection' | 'detail'>('selection');
  const [activeFeature, setActiveFeature] = useState<Feature | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('Intermediate');
  const [contentType, setContentType] = useState<ContentType>('Melody');
  
  // Editor State
  const [scoreTitle, setScoreTitle] = useState('マイ・スコア');
  const [clef, setClef] = useState<Clef>('treble');
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [accidental, setAccidental] = useState<'none' | '^' | '_'>('none');
  const [notesArray, setNotesArray] = useState<string[]>([]);
  const [abcNotation, setAbcNotation] = useState<string>('');
  
  // App State
  const [inputTitle, setInputTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<string>('1'); 
  const [connectToPrevious, setConnectToPrevious] = useState(false);
  const [octaveOffset, setOctaveOffset] = useState<number>(0); // -1: Low, 0: Normal, 1: High
  
  const scoreRef = useRef<HTMLDivElement>(null);

  // Rebuild ABC Notation string whenever metadata or notes change
  useEffect(() => {
    if (activeFeature === 'editor') {
      const header = `X:1\nT:${scoreTitle}\nM:${timeSignature}\nL:1/4\nK:C clef=${clef}\n`;
      // We join notes. To handle beaming, we can suggest users to not space, 
      // but let's provide a "beam" concept: notes joined without space are beamed.
      // For now, let's just join with spaces but allow manual space control or automatic 4/4 grouping?
      // Actually, let's just join them. ABCJS handles 8th/16th beaming if they are adjacent.
      const content = notesArray.join(' ');
      setAbcNotation(header + content);
    }
  }, [scoreTitle, clef, timeSignature, notesArray, activeFeature]);

  // Render Score whenever abcNotation changes
  useEffect(() => {
    if (abcNotation && scoreRef.current) {
      abcjs.renderAbc(scoreRef.current, abcNotation, {
        responsive: 'resize',
        add_classes: true,
        staffwidth: 800,
      });
    }
  }, [abcNotation, view]);

  const handleFeatureSelect = (feature: Feature) => {
    setActiveFeature(feature);
    setView('detail');
    if (feature === 'editor') {
      setNotesArray(['|']);
      setScoreTitle('マイ・スコア');
    } else {
      setAbcNotation('');
    }
  };

  const addNote = (note: string) => {
    let notationToAdd = note;
    
    // Add accidental if not a bar line or rest
    if (note !== '|' && note !== 'z') {
      if (accidental === '^') notationToAdd = '^' + notationToAdd;
      if (accidental === '_') notationToAdd = '_' + notationToAdd;
    }

    // Add duration
    if (selectedDuration !== '1' && notationToAdd !== '|') {
      notationToAdd += selectedDuration;
    }
    
    setNotesArray(prev => {
      const next = [...prev];
      if (connectToPrevious && next.length > 0) {
        // Find last element and append without space
        const last = next.pop()!;
        next.push(last + notationToAdd);
      } else {
        next.push(notationToAdd);
      }
      return next;
    });
    // Reset accidental after use
    setAccidental('none');
  };

  const deleteLast = () => {
    setNotesArray(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next.pop();
      return next;
    });
  };

  const handleStaffClick = (e: React.MouseEvent) => {
    if (activeFeature !== 'editor' || !scoreRef.current) return;
    
    const rect = scoreRef.current.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const height = rect.height;
    
    // Correct ABC Notation mapping
    // Treble: Middle C is 'C'. Ledger lines up to c'' (C6) and down to G, (G3)
    const treblePitches = ['c\'\'', 'b\'', 'a\'', 'g\'', 'f\'', 'e\'', 'd\'', 'c\'', 'b', 'a', 'g', 'f', 'e', 'd', 'C', 'B,', 'A,', 'G,'];
    
    // Bass: Middle C is 'C'. Staff is around C2 to C4.
    const bassPitches = ['c', 'b', 'a', 'g', 'f', 'e', 'd', 'C', 'B,', 'A,', 'G,', 'F,', 'E,', 'D,', 'C,', 'B,,', 'A,,', 'G,,', 'F,,', 'E,,'];
    
    const pitches = clef === 'treble' ? treblePitches : bassPitches;
    
    // Logic to calculate pitch based on click height
    // Staff lines are typically in the middle of the rendered SVG.
    // This is an approximation.
    const index = Math.floor((relativeY / height) * pitches.length);
    const pitch = pitches[Math.min(Math.max(index, 0), pitches.length - 1)];
    
    addNote(pitch);
  };

  const handleGenerate = async (file?: File) => {
    setLoading(true);
    setError(null);
    try {
      let payload: any = {};
      if (activeFeature === 'audio' || activeFeature === 'image') {
        if (!file) {
          setError('Please upload a file.');
          setLoading(false);
          return;
        }
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result?.toString().split(',')[1] || '');
          reader.readAsDataURL(file);
        });
        payload = { data: base64, mimeType: file.type };
      } else if (activeFeature === 'title') {
        if (!inputTitle) {
          setError('Please enter a song title.');
          setLoading(false);
          return;
        }
        payload = { title: inputTitle };
      }

      const response = await fetch('/api/generate-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeFeature,
          payload,
          difficulty,
          contentType
        }),
      });

      const data = await response.json();
      if (data.abc) {
        setAbcNotation(data.abc);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('An error occurred during generation.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!scoreRef.current) return;
    const canvas = await html2canvas(scoreRef.current);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save('score.pdf');
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8f7ff] text-slate-800 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="h-16 flex items-center justify-between px-8 bg-white border-b border-purple-100 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-200">
            <Music className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900 italic underline decoration-violet-400">
            スコアビルダー <span className="text-violet-600 font-black">SCORE BUILDER</span>
          </span>
        </div>
        <div className="flex gap-4">
          <button className="px-5 py-2 rounded-full border-2 border-violet-100 text-violet-700 font-semibold text-sm hover:bg-violet-50 transition-colors">
            履歴を表示
          </button>
          {abcNotation && (
            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-violet-600 text-white font-bold text-sm shadow-md hover:bg-violet-700 transition-all"
            >
              <Download className="w-4 h-4" />
              PDFで保存
            </button>
          )}
        </div>
      </nav>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'selection' ? (
            <motion.main
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 p-10 flex flex-col overflow-y-auto"
            >
              <header className="mb-8">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">生成方法を選択してください</h1>
                <p className="text-slate-500 mt-1">作成したいデータの形式に合わせて機能を選んでください</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl">
                <FeatureCard 
                  icon={<Music className="w-8 h-8" />}
                  title="音声データから生成"
                  description="録音データやMP3/WAVファイルから、メロディを解析して楽譜に変換します。"
                  color="violet"
                  onClick={() => handleFeatureSelect('audio')}
                  actionText="アップロードを開始"
                />
                <FeatureCard 
                  icon={<Search className="w-8 h-8" />}
                  title="楽曲タイトルから生成"
                  description="曲名を入力するだけで、Google検索経由で情報を取得し楽譜を構築します。"
                  color="blue"
                  onClick={() => handleFeatureSelect('title')}
                  actionText="タイトルを入力"
                />
                <FeatureCard 
                  icon={<ImageIcon className="w-8 h-8" />}
                  title="楽譜画像から読み込み"
                  description="紙の楽譜の画像(PNG)やPDFをAIがスキャンし、編集可能なデータに復元します。"
                  color="orange"
                  onClick={() => handleFeatureSelect('image')}
                  actionText="スキャンを開始"
                />
                <FeatureCard 
                  icon={<Edit3 className="w-8 h-8" />}
                  title="自ら楽譜を作る"
                  description="真っ白な五線譜に、音符や音楽記号を自由に配置して独自の曲を作成します。"
                  color="emerald"
                  onClick={() => handleFeatureSelect('editor')}
                  actionText="エディタを開く"
                />
              </div>

              {/* Floating Hint */}
              <div className="mt-12 flex items-center justify-center gap-6 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-mono uppercase tracking-widest">
                  <span className="px-1.5 py-0.5 bg-slate-200 rounded border-b border-slate-400 text-slate-600">F1</span> Help Center
                </span>
                <span className="flex items-center gap-1 font-mono uppercase tracking-widest">
                  <span className="px-1.5 py-0.5 bg-slate-200 rounded border-b border-slate-400 text-slate-600">Cmd</span> + <span className="px-1.5 py-0.5 bg-slate-200 rounded border-b border-slate-400 text-slate-600">S</span> Save Draft
                </span>
              </div>
            </motion.main>
          ) : (
            <motion.div
              key="detail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 min-h-0"
            >
              {/* Left Sidebar: Settings */}
              <aside className="w-80 bg-white border-r border-purple-100 p-6 flex flex-col gap-8 shadow-sm overflow-y-auto shrink-0">
                <button 
                  onClick={() => setView('selection')}
                  className="flex items-center text-violet-600 hover:text-violet-800 transition-colors font-bold text-sm mb-4"
                >
                  <ChevronLeft className="w-5 h-5 mr-1" />
                  機能選択に戻る
                </button>

                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">1. 楽譜の詳細設定</h3>
                  
                  <div className="mb-8">
                    <label className="block text-sm font-bold text-slate-700 mb-3">難易度を選択</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1 rounded-xl">
                      {(['Elementary', 'Intermediate', 'Advanced'] as Difficulty[]).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDifficulty(d)}
                          className={`py-2 text-sm font-bold rounded-lg transition-all ${
                            difficulty === d 
                              ? 'bg-white text-violet-600 shadow-sm border border-violet-100' 
                              : 'text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {d === 'Elementary' ? '小' : d === 'Intermediate' ? '中' : '高'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-bold text-slate-700 mb-3">構成内容</label>
                    <div className="space-y-2">
                      {(['Melody', 'Accompaniment'] as ContentType[]).map((c) => (
                        <label 
                          key={c}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                            contentType === c 
                              ? 'border-violet-500 bg-violet-50' 
                              : 'border-transparent bg-slate-50 hover:bg-slate-100'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="comp" 
                            checked={contentType === c}
                            onChange={() => setContentType(c)}
                            className="accent-violet-600"
                          />
                          <span className={`text-sm font-bold ${contentType === c ? 'text-violet-900' : 'text-slate-700'}`}>
                            {c === 'Melody' ? 'メロディのみ' : '伴奏あり (ピアノ)'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 my-6" />

                  {/* Feature Specific Input */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">2. 入力データ</h3>
                    
                    {activeFeature === 'editor' ? (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">プロジェクト名</label>
                          <input 
                            type="text" 
                            value={scoreTitle}
                            onChange={(e) => setScoreTitle(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm bg-slate-50 font-bold"
                          />
                        </div>
                        <div className="p-4 bg-violet-50 rounded-2xl border border-violet-100">
                          <p className="text-[11px] text-violet-600/70 font-medium leading-relaxed font-serif italic">
                            エディタの上部パネルで音符を選択し、譜面をクリックして配置してください。ドレミボタンでも簡単に入力できます。
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center px-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ABC Code (Editable)</label>
                          </div>
                          <textarea 
                            value={abcNotation}
                            onChange={(e) => setAbcNotation(e.target.value)}
                            className="w-full h-40 p-4 font-mono text-[9px] rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 bg-slate-50 resize-none overflow-y-auto"
                          />
                          <p className="text-[9px] text-slate-400 italic">※上級者向け。直接コードを編集して微調整が可能です。</p>
                        </div>
                      </div>
                    ) : ( 
                      <>
                        {activeFeature === 'title' && (
                          <div className="space-y-3">
                            <input 
                              type="text" 
                              value={inputTitle}
                              onChange={(e) => setInputTitle(e.target.value)}
                              placeholder="楽曲タイトルを入力..."
                              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm bg-slate-50"
                            />
                            <button 
                              onClick={() => handleGenerate()}
                              disabled={loading}
                              className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 transition-all flex items-center justify-center shadow-lg shadow-violet-200"
                            >
                              {loading ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 w-4 h-4 fill-current transition-transform group-hover:scale-110" />}
                              楽譜を生成
                            </button>
                          </div>
                        )}

                        {(activeFeature === 'audio' || activeFeature === 'image') && (
                          <DropzoneArea 
                            type={activeFeature} 
                            onUpload={handleGenerate} 
                            loading={loading} 
                          />
                        )}
                      </>
                    )}

                    {error && (
                      <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl font-medium">
                        {error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto p-4 bg-violet-50 rounded-2xl border border-violet-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                    <span className="text-xs font-bold text-violet-700">AIエンジン稼働中</span>
                  </div>
                  <p className="text-[11px] text-violet-600/70 font-medium leading-relaxed font-serif italic">
                    {activeFeature === 'editor' 
                      ? '譜面をクリックすることで音符を配置できます。' 
                      : '高精度なAIがオーディオデータを解析し、即座にピアノ譜を生成します。'}
                  </p>
                </div>
              </aside>

              {/* Main Workspace: Score Preview */}
              <main className="flex-1 bg-slate-50 flex flex-col p-8 overflow-hidden">
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 flex-1 flex flex-col border border-white overflow-hidden relative">
                  <div className="h-14 flex items-center justify-between px-6 border-b border-slate-100 bg-slate-50/50 z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-violet-100 rounded text-violet-600 flex items-center justify-center">
                        <Music className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {loading ? 'AI生成中...' : activeFeature === 'editor' ? 'インタラクティブ・エディタ' : '楽譜プレビュー'}
                      </span>
                    </div>
                    {activeFeature === 'editor' && (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200">
                           <span className="text-[10px] font-bold text-slate-400">音部記号:</span>
                           <select 
                            value={clef}
                            onChange={(e) => setClef(e.target.value as Clef)}
                            className="bg-transparent text-[10px] font-bold outline-none text-violet-600 cursor-pointer"
                          >
                            <option value="treble">ト音</option>
                            <option value="bass">ヘ音</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200">
                           <span className="text-[10px] font-bold text-slate-400">拍子:</span>
                           <select 
                            value={timeSignature}
                            onChange={(e) => setTimeSignature(e.target.value)}
                            className="bg-transparent text-[10px] font-bold outline-none text-violet-600 cursor-pointer"
                          >
                            <option value="4/4">4/4</option>
                            <option value="3/4">3/4</option>
                            <option value="2/4">2/4</option>
                          </select>
                        </div>
                        <div className="text-[11px] font-black text-violet-400 animate-pulse uppercase tracking-wider hidden md:block">
                          クリックで音符を入力
                        </div>
                      </div>
                    )}
                  </div>

                  {activeFeature === 'editor' && (
                    <div className="bg-white border-b border-slate-100 p-4 space-y-4">
                      {/* Editor Toolbar */}
                      <div className="flex flex-wrap items-center gap-6 justify-center">
                        {/* Note Entry (Do Re Mi) */}
                        <div className="flex flex-col gap-2">
                           <label className="text-[9px] font-black text-slate-400 uppercase text-center">音域と音名 (ドレミ)</label>
                           <div className="flex flex-col gap-2">
                             {/* Octave Selection */}
                             <div className="flex gap-1 justify-center">
                               {[
                                 { label: '低', val: -1 },
                                 { label: '普', val: 0 },
                                 { label: '高', val: 1 },
                               ].map((o) => (
                                 <button
                                   key={o.val}
                                   onClick={() => setOctaveOffset(o.val)}
                                   className={`w-10 py-1 text-[9px] font-bold rounded-lg border transition-all ${
                                     octaveOffset === o.val 
                                       ? 'bg-violet-500 text-white border-violet-500' 
                                       : 'bg-white text-slate-400 border-slate-200 hover:border-violet-300'
                                   }`}
                                 >
                                   {o.label}
                                 </button>
                               ))}
                             </div>

                             <div className="flex gap-1">
                               {[
                                 { name: 'ド', sol: 'Do', note: clef === 'treble' ? 'C' : 'C,' },
                                 { name: 'レ', sol: 'Re', note: clef === 'treble' ? 'D' : 'D,' },
                                 { name: 'ミ', sol: 'Mi', note: clef === 'treble' ? 'E' : 'E,' },
                                 { name: 'ファ', sol: 'Fa', note: clef === 'treble' ? 'F' : 'F,' },
                                 { name: 'ソ', sol: 'Sol', note: clef === 'treble' ? 'G' : 'G,' },
                                 { name: 'ラ', sol: 'La', note: clef === 'treble' ? 'A' : 'A,' },
                                 { name: 'シ', sol: 'Si', note: clef === 'treble' ? 'B' : 'B,' },
                                 { name: 'ド', sol: 'Do+', note: clef === 'treble' ? 'c' : 'C' },
                               ].map((n) => (
                                 <button
                                   key={n.sol}
                                   onClick={() => addNote(shiftABCNote(n.note, octaveOffset))}
                                   className="flex flex-col items-center justify-center w-10 h-12 bg-slate-50 border border-slate-200 rounded-lg hover:border-violet-500 hover:bg-violet-50 transition-all group"
                                 >
                                   <span className="text-[10px] font-black text-slate-800">{n.name}</span>
                                   <span className="text-[8px] text-slate-400 group-hover:text-violet-500">{n.sol}</span>
                                 </button>
                               ))}
                             </div>
                           </div>
                        </div>

                        <div className="w-px h-10 bg-slate-100" />

                        {/* Duration */}
                        <div className="flex flex-col gap-2">
                           <label className="text-[9px] font-black text-slate-400 uppercase text-center">長さ</label>
                           <div className="flex gap-1">
                             {[
                                { label: '1/16', val: '/4' },
                                { label: '1/8', val: '/2' },
                                { label: '1/4', val: '1' },
                                { label: '1/2', val: '2' },
                                { label: '全', val: '4' },
                             ].map((d) => (
                               <button
                                onClick={() => setSelectedDuration(d.val)}
                                className={`w-8 h-8 rounded-lg border text-[9px] font-bold transition-all ${
                                  selectedDuration === d.val 
                                    ? 'bg-violet-600 text-white border-violet-600 shadow-md' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'
                                }`}
                               >
                                 {d.label}
                               </button>
                             ))}
                           </div>
                        </div>

                        <div className="w-px h-10 bg-slate-100" />

                        {/* Accidentals */}
                        <div className="flex flex-col gap-2">
                           <label className="text-[9px] font-black text-slate-400 uppercase text-center">臨時記号</label>
                           <div className="flex gap-1">
                             {[
                                { label: '♯', val: '^' as const },
                                { label: '♭', val: '_' as const },
                                { label: '♮', val: 'none' as const },
                             ].map((a) => (
                               <button
                                onClick={() => setAccidental(a.val as any)}
                                className={`w-8 h-8 rounded-lg border text-sm font-bold transition-all ${
                                  accidental === a.val 
                                    ? 'bg-violet-100 border-violet-600 text-violet-600' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'
                                }`}
                               >
                                 {a.label}
                               </button>
                             ))}
                           </div>
                        </div>

                        <div className="w-px h-10 bg-slate-100" />

                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                           <label className="text-[9px] font-black text-slate-400 uppercase text-center">操作</label>
                           <div className="flex gap-1">
                             <button onClick={() => addNote('z')} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-[10px] font-bold" title="休符">R</button>
                             <button onClick={() => addNote('|')} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:text-violet-600 text-[10px] font-bold" title="小節線">|</button>
                             <button 
                               onClick={() => setConnectToPrevious(!connectToPrevious)} 
                               className={`w-8 h-8 flex items-center justify-center rounded-lg border text-[10px] transition-all ${connectToPrevious ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}
                               title="ビーム接続"
                             >
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 18h16V2H4v16zm2-14h12v12H6V4z"/></svg>
                             </button>
                             <button onClick={deleteLast} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 transition-all font-bold" title="削除">
                               <RotateCcw className="w-3.5 h-3.5" />
                             </button>
                           </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div 
                    className={`flex-1 p-8 overflow-y-auto score-container relative ${activeFeature === 'editor' ? 'cursor-crosshair' : ''}`}
                    onClick={handleStaffClick}
                  >
                    {!abcNotation && !loading && (
                      <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 text-slate-300 pointer-events-none">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                          <Music className="w-10 h-10" />
                        </div>
                        <p className="font-medium text-sm">入力内容に基づいて楽譜が表示されます</p>
                      </div>
                    )}
                    
                    {loading && (
                      <div className="absolute inset-0 flex items-center justify-center flex-col gap-6 bg-white/80 backdrop-blur-sm z-20 pointer-events-none">
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Music className="w-6 h-6 text-violet-600 animate-pulse" />
                          </div>
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-lg font-bold text-slate-900 animate-pulse text-violet-600 capitalize">
                            AI is creating your score
                          </p>
                          <p className="text-xs text-slate-400 font-medium italic">
                            まもなく高品質な楽譜が完成します...
                          </p>
                        </div>
                      </div>
                    )}

                    <div 
                      ref={scoreRef} 
                      className={`w-full max-w-4xl mx-auto ${loading ? 'opacity-20 translate-y-4' : 'opacity-100 translate-y-0'} transition-all duration-700 abcjs-rendered`}
                    />

                    {/* Hint for Editor */}
                    {activeFeature === 'editor' && !loading && abcNotation.length < 50 && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none bg-black/5 px-4 py-2 rounded-full border border-black/5 animate-bounce">
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
                          <Plus className="w-3 h-3" /> Click staff to input
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description, 
  color, 
  onClick, 
  actionText 
}: { 
  icon: React.ReactNode, 
  title: string, 
  description: string, 
  color: 'violet' | 'blue' | 'orange' | 'emerald',
  onClick: () => void,
  actionText: string
}) {
  const colorMap = {
    violet: { bg: 'bg-violet-50', iconBg: 'bg-violet-100', icon: 'text-violet-600', border: 'hover:border-violet-400', accent: 'text-violet-600' },
    blue: { bg: 'bg-blue-50', iconBg: 'bg-blue-100', icon: 'text-blue-600', border: 'hover:border-blue-400', accent: 'text-blue-600' },
    orange: { bg: 'bg-orange-50', iconBg: 'bg-orange-100', icon: 'text-orange-600', border: 'hover:border-orange-400', accent: 'text-orange-600' },
    emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', icon: 'text-emerald-600', border: 'hover:border-emerald-400', accent: 'text-emerald-600' },
  };

  const theme = colorMap[color];

  return (
    <motion.button
      whileHover={{ y: -8, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative bg-white rounded-3xl border-2 border-transparent ${theme.border} p-8 shadow-md shadow-slate-200/60 transition-all flex flex-col justify-between overflow-hidden cursor-pointer h-72 text-left`}
    >
      <div className={`absolute -right-4 -top-4 w-40 h-40 ${theme.bg} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity`} />
      
      <div>
        <div className={`w-14 h-14 ${theme.iconBg} rounded-2xl flex items-center justify-center mb-6 relative z-10`}>
          <div className={theme.icon}>{icon}</div>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2 relative z-10">{title}</h2>
        <p className="text-sm text-slate-500 leading-relaxed relative z-10">{description}</p>
      </div>

      <div className={`flex items-center ${theme.accent} font-bold text-sm gap-1 relative z-10 group-hover:translate-x-1 transition-transform`}>
        {actionText} <Play className="w-4 h-4 ml-1 fill-current" />
      </div>
    </motion.button>
  );
}

function DropzoneArea({ type, onUpload, loading }: { type: 'audio' | 'image', onUpload: (file: File) => void, loading: boolean }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) {
        onUpload(acceptedFiles[0]);
      }
    },
    accept: (type === 'audio' 
      ? { 'audio/*': ['.mp3', '.wav', '.m4a'] } 
      : { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] }) as any,
    multiple: false,
    disabled: loading
  } as any);

  return (
    <div 
      {...getRootProps()} 
      className={`p-6 border-2 border-dashed rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3 ${
        isDragActive ? 'border-violet-600 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-violet-400'
      } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center">
        <Upload className={`w-6 h-6 ${isDragActive ? 'text-violet-600' : 'text-slate-400'}`} />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-700">
          {type === 'audio' ? '音声をドロップ' : '楽譜をドロップ'}
        </p>
        <p className="text-[10px] text-slate-400 font-medium">またはクリックして選択</p>
      </div>
    </div>
  );
}
