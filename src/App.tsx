import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Upload, Wand2, Image as ImageIcon, Download, Sparkles, Loader2, RefreshCw } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TEMPLATES = [
  'https://picsum.photos/seed/meme1/600/400',
  'https://picsum.photos/seed/meme2/600/400',
  'https://picsum.photos/seed/meme3/600/400',
];

async function getBase64FromUrl(url: string): Promise<{ data: string, mimeType: string }> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const data = base64data.split(',')[1];
      const mimeType = base64data.split(';')[0].split(':')[1];
      resolve({ data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  position: 'top' | 'bottom'
) {
  const words = text.split(' ');
  let line = '';
  const lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  let currentY = position === 'top' ? y : y - (lines.length - 1) * lineHeight;

  for (let i = 0; i < lines.length; i++) {
    ctx.strokeText(lines[i].trim(), x, currentY);
    ctx.fillText(lines[i].trim(), x, currentY);
    currentY += lineHeight;
  }
}

export default function App() {
  const [image, setImage] = useState<{ data: string, mimeType: string } | null>(null);
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [captions, setCaptions] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const maxWidth = 800;
      const maxHeight = 800;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (maxHeight / height) * width;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);

      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = Math.max(3, width / 80);
      ctx.lineJoin = 'round';

      const fontSize = Math.max(32, width / 10);
      ctx.font = `bold ${fontSize}px Impact, sans-serif`;
      const lineHeight = fontSize * 1.2;

      if (topText) {
        ctx.textBaseline = 'top';
        wrapText(ctx, topText.toUpperCase(), width / 2, 20, width - 40, lineHeight, 'top');
      }

      if (bottomText) {
        ctx.textBaseline = 'bottom';
        wrapText(ctx, bottomText.toUpperCase(), width / 2, height - 20, width - 40, lineHeight, 'bottom');
      }
    };
    img.src = `data:${image.mimeType};base64,${image.data}`;
  }, [image, topText, bottomText]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const data = base64data.split(',')[1];
      const mimeType = base64data.split(';')[0].split(':')[1];
      setImage({ data, mimeType });
      setCaptions([]);
    };
    reader.readAsDataURL(file);
  };

  const loadTemplate = async (url: string) => {
    try {
      const { data, mimeType } = await getBase64FromUrl(url);
      setImage({ data, mimeType });
      setCaptions([]);
      setTopText('');
      setBottomText('');
    } catch (err: any) {
      console.error("Failed to load template", err);
      alert(`Failed to load template: ${err.message || 'Permission denied'}`);
    }
  };

  const handleMagicCaption = async () => {
    if (!image) return;
    setIsAnalyzing(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: image.data,
                mimeType: image.mimeType
              }
            },
            {
              text: "Analyze this image and suggest 5 funny, relevant meme captions. Return a JSON array of strings. Keep them punchy and formatted as a single line of text."
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        setCaptions(parsed);
      }
    } catch (err: any) {
      console.error("Failed to generate captions", err);
      alert(`Error generating captions: ${err.message || 'Permission denied or API error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEditImage = async () => {
    if (!image || !editPrompt) return;
    setIsEditing(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: image.data,
                mimeType: image.mimeType,
              },
            },
            {
              text: editPrompt,
            },
          ],
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setImage({
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType
          });
          break;
        }
      }
    } catch (err: any) {
      console.error("Failed to edit image", err);
      alert(`Error editing image: ${err.message || 'Permission denied or API error'}`);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    try {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meme.png';
      a.click();
    } catch (err) {
      console.error("Download failed", err);
      alert("Download blocked by browser. You can right-click the image and select 'Save image as...'");
    }
  };

  const handleReset = () => {
    setImage(null);
    setTopText('');
    setBottomText('');
    setCaptions([]);
    setEditPrompt('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between pb-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-xl">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AI Meme Generator</h1>
          </div>
          <div className="flex items-center gap-3">
            {image && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg font-medium hover:bg-zinc-800 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
            )}
            {image && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Canvas */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 min-h-[400px] flex items-center justify-center relative overflow-hidden">
              {!image ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-800 mb-2">
                    <ImageIcon className="w-8 h-8 text-zinc-400" />
                  </div>
                  <p className="text-zinc-400">Upload an image or select a template</p>
                  <label className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium cursor-pointer transition-colors">
                    <Upload className="w-5 h-5" />
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-[600px] object-contain rounded-lg shadow-2xl"
                />
              )}
            </div>

            {/* Templates */}
            {!image && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Trending Templates</h3>
                <div className="grid grid-cols-3 gap-4">
                  {TEMPLATES.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => loadTemplate(url)}
                      className="relative aspect-video rounded-xl overflow-hidden border border-zinc-800 hover:border-indigo-500 transition-colors group"
                    >
                      <img src={url} alt={`Template ${i}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" crossOrigin="anonymous" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Controls */}
          <div className="lg:col-span-5 space-y-6">
            {/* Text Controls */}
            <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 ${!image ? 'opacity-50 pointer-events-none' : ''}`}>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-400" />
                Meme Text
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Top Text</label>
                  <input
                    type="text"
                    value={topText}
                    onChange={e => setTopText(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    placeholder="Enter top text..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Bottom Text</label>
                  <input
                    type="text"
                    value={bottomText}
                    onChange={e => setBottomText(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    placeholder="Enter bottom text..."
                  />
                </div>
              </div>
            </div>

            {/* Magic Captions */}
            <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 ${!image ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-purple-400" />
                  Magic Captions
                </h2>
                <button
                  onClick={handleMagicCaption}
                  disabled={!image || isAnalyzing}
                  className="px-4 py-2 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
                >
                  {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isAnalyzing ? 'Analyzing...' : 'Generate'}
                </button>
              </div>

              {captions.length > 0 ? (
                <div className="space-y-2">
                  {captions.map((caption, i) => (
                    <button
                      key={i}
                      onClick={() => setBottomText(caption)}
                      className="w-full text-left px-4 py-3 bg-zinc-950 border border-zinc-800 hover:border-purple-500/50 rounded-xl text-sm text-zinc-300 hover:text-white transition-colors"
                    >
                      {caption}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  Upload an image and click Generate to get AI-powered caption suggestions based on the image context.
                </p>
              )}
            </div>

            {/* AI Image Edit */}
            <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 ${!image ? 'opacity-50 pointer-events-none' : ''}`}>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                AI Image Edit
              </h2>
              <p className="text-sm text-zinc-400">
                Use text prompts to edit the image (e.g., "Add a retro filter", "Remove the background").
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                  placeholder="What do you want to change?"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
                <button
                  onClick={handleEditImage}
                  disabled={!image || !editPrompt || isEditing}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  {isEditing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
