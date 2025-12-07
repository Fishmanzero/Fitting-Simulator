import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Heart, Ruler, Shirt, Info, Upload, Camera, Wand2, X, AlertCircle, Settings2, Move3d, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * 智能 AI 试衣间 (Smart AI Fitting Room) - Pro Version
 * * 更新日志：
 * 1. 模型升级：配置适配最新的视觉生成模型逻辑。
 * 2. 模式分层：新增“简单”与“细致”两种调整模式。
 * 3. 细致参数：身高(cm级)、胸围(A-H)、腰/臀/四肢(三级调节)。
 * 4. 视角控制：新增拍摄角度选项（高/低/侧/背）。
 * 5. 动态 Prompt：基于复杂参数构建高精度提示词。
 * 6. (New) 提示词强化：大幅增强对身材重塑的指令权重，确保生成的体型差异明显。
 */

const App = () => {
  // --- 状态管理 ---
  
  // 核心模式
  const [settingMode, setSettingMode] = useState('simple'); // 'simple' | 'detailed'
  const [viewMode, setViewMode] = useState('result'); // 'model', 'dress', 'result'
  
  // 简单模式参数
  const [simpleHeight, setSimpleHeight] = useState(160); // 140 - 175

  // 细致模式参数
  const [detailHeight, setDetailHeight] = useState(160); // 140 - 175
  const [bustSize, setBustSize] = useState('C'); // A - H
  const [waistLevel, setWaistLevel] = useState('normal'); // 'slender', 'normal', 'full'
  const [hipLevel, setHipLevel] = useState('normal');
  const [limbLevel, setLimbLevel] = useState('normal');

  // 通用参数
  const [cameraAngle, setCameraAngle] = useState('front'); // 'high', 'low', 'front_left', 'front_right', 'back'

  // 图片数据 (Base64)
  const [modelImage, setModelImage] = useState(null);
  const [dressImage, setDressImage] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  
  // 系统状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [logs, setLogs] = useState([]);
  
  // 历史上下文
  const [generationCount, setGenerationCount] = useState(0);

  // --- API 配置 ---
  const API_MODEL = "gemini-2.5-flash-image-preview"; 
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 

  // --- 辅助数据 ---
  const cupSizes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const bodyLevels = [
    { value: 'slender', label: '纤细' },
    { value: 'normal', label: '标准' },
    { value: 'full', label: '丰满' }
  ];
  const angles = [
    { value: 'front', label: '正视' },
    { value: 'front_left', label: '左前侧 45°' },
    { value: 'front_right', label: '右前侧 45°' },
    { value: 'high', label: '高机位俯视' },
    { value: 'low', label: '低机位仰视' },
    { value: 'back', label: '背面视角' },
  ];

  // --- 工具函数 ---
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("图片过大，请上传小于 5MB 的图片");
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      if (type === 'model') {
        setModelImage(base64);
        setViewMode('model');
      } else {
        setDressImage(base64);
        setViewMode('dress');
      }
      setErrorMsg('');
    } catch (e) {
      setErrorMsg("图片读取失败");
    }
  };

  // --- 核心生成逻辑 ---
  const generateTryOn = async () => {
    if (!modelImage || !dressImage) {
      setErrorMsg("请先上传模特和服装照片");
      return;
    }

    setIsGenerating(true);
    setErrorMsg('');
    setLogs(['初始化生成引擎...', '分析身材重塑指令...']);
    setViewMode('result');

    try {
      // 1. 构建 Prompt 参数
      const height = settingMode === 'simple' ? simpleHeight : detailHeight;
      
      let bodyPrompt = "";
      
      // 辅助函数：生成身材描述
      const getHeightDesc = (h) => {
        if (h < 150) return "VERY PETITE stature, short legs relative to torso, cute doll-like proportions, head-to-body ratio approx 1:6.";
        if (h < 158) return "SHORT stature, slightly shorter legs, petite build.";
        if (h > 172) return "VERY TALL, SUPERMODEL stature, extremely long slender legs, high fashion proportions, head-to-body ratio approx 1:8.";
        if (h > 165) return "TALL stature, long legs, elegant proportions.";
        return "AVERAGE height, balanced proportions.";
      };

      const getBustDesc = (size) => {
        if (['A', 'B'].includes(size)) return "Small bust, flat chest, modest fit, fabric lies flat against chest.";
        if (['C', 'D'].includes(size)) return "Medium bust, natural curves, fitted bodice.";
        if (['E', 'F'].includes(size)) return "Large bust, voluptuous upper body, tight fit around chest, prominent curves.";
        return "EXTREMELY LARGE bust, very heavy chest, fabric stretched tight across bust, very prominent upper body curves.";
      };

      const getLevelDesc = (level, part) => {
        if (part === 'waist') {
          if (level === 'slender') return "EXTREMELY SNATCHED WAIST, tiny waistline, hourglass figure, corseted look.";
          if (level === 'full') return "THICK WAIST, wide waistline, straight torso shape, no defined waist.";
          return "Natural waistline.";
        }
        if (part === 'hips') {
          if (level === 'slender') return "NARROW HIPS, boyish figure, straight silhouette.";
          if (level === 'full') return "WIDE HIPS, curvy pear-shaped lower body, voluptuous thighs.";
          return "Average hip width.";
        }
        if (part === 'limbs') {
          if (level === 'slender') return "VERY THIN ARMS AND LEGS, skinny, fragile look.";
          if (level === 'full') return "THICK, FLESHY ARMS AND LEGS, chubby, soft look.";
          return "Toned, average arms and legs.";
        }
        return "";
      };

      if (settingMode === 'simple') {
        // 简单模式：主要依靠身高和自动推断
        const heightDesc = getHeightDesc(simpleHeight);
        bodyPrompt = `
          **CRITICAL BODY MODIFICATION**:
          - Change the model's body structure to be: ${heightDesc}
          - Ensure the dress fits this specific body type perfectly.
        `;
      } else {
        // 细致模式：组合所有具体描述
        bodyPrompt = `
          **CRITICAL BODY RESHAPING INSTRUCTIONS (MUST FOLLOW)**:
          1. **HEIGHT/PROPORTIONS**: ${getHeightDesc(detailHeight)}
          2. **BUST/CHEST**: ${getBustDesc(bustSize)}
          3. **WAIST**: ${getLevelDesc(waistLevel, 'waist')}
          4. **HIPS**: ${getLevelDesc(hipLevel, 'hips')}
          5. **LIMBS**: ${getLevelDesc(limbLevel, 'limbs')}
          
          **OVERRIDE**: You MUST IGNORE the original model's body measurements if they conflict with the above specs. Reshape the body mesh completely to match these settings.
        `;
      }

      // 角度 Prompt
      let anglePrompt = "Front view";
      if (cameraAngle === 'front_left') anglePrompt = "Front-left side view (45 degrees), showing profile and front details.";
      if (cameraAngle === 'front_right') anglePrompt = "Front-right side view (45 degrees), showing profile and front details.";
      if (cameraAngle === 'high') anglePrompt = "High-angle shot (looking down from above), emphasizing the face and skirt spread.";
      if (cameraAngle === 'low') anglePrompt = "Low-angle shot (looking up from below), emphasizing leg length and stature.";
      if (cameraAngle === 'back') anglePrompt = "Direct Back view, showing the back design of the dress and hair details.";

      const seed = Math.floor(Math.random() * 1000000);
      
      const systemPrompt = `
        You are an expert AI Fashion Image Generator.
        
        **TASK**: Synthesize a realistic Virtual Try-On image.
        
        **INPUTS**:
        - Source Person (Reference for identity/face, but NOT body shape).
        - Source Garment (Reference for texture/design).
        
        **STRICT EXECUTION RULES**:
        1. **CLOTHING**: Apply the Source Garment onto the model. Maintain texture, pattern, and design details perfectly.
        2. **CAMERA ANGLE**: ${anglePrompt}. This is non-negotiable.
        3. **BODY SHAPE (HIGHEST PRIORITY)**:
           ${bodyPrompt}
        4. **IDENTITY**: Keep the source model's face identifiable (unless back view).
        5. **STYLE**: High-end e-commerce photography, clean background, soft lighting.
        
        **NEGATIVE CONSTRAINTS**: Do not maintain the original body shape if it contradicts the requested measurements. Do not distort the face.
        
        (Internal Seed: ${seed})
      `;

      setLogs(prev => [...prev, '正在构建重塑指令...', '上传图像数据...']);

      // 2. API 请求
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=${apiKey}`;

      const modelData = modelImage.split(',')[1];
      const dressData = dressImage.split(',')[1];

      const payload = {
        contents: [{
          parts: [
            { text: systemPrompt },
            { inlineData: { mimeType: "image/jpeg", data: modelData } },
            { inlineData: { mimeType: "image/jpeg", data: dressData } }
          ]
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          temperature: 0.4,
        }
      };

      setLogs(prev => [...prev, 'AI 正在重塑像素...', '应用物理形变...']);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "API 请求失败");
      }

      const generatedPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      
      if (generatedPart) {
        const resultBase64 = `data:${generatedPart.inlineData.mimeType};base64,${generatedPart.inlineData.data}`;
        setResultImage(resultBase64);
        setLogs(prev => [...prev, '生成完毕！']);
        setGenerationCount(prev => prev + 1);
      } else {
        throw new Error("未能生成有效图片");
      }

    } catch (error) {
      console.error(error);
      setErrorMsg(`错误: ${error.message}`);
      setLogs(prev => [...prev, '任务终止']);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- 组件: 滑块控制 ---
  const SliderControl = ({ label, value, min, max, onChange, unit = "" }) => (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-bold text-[#8d6e63]">{label}</label>
        <span className="text-xs text-[#e68aae] font-mono">{value}{unit}</span>
      </div>
      <input 
        type="range" min={min} max={max} value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e68aae]"
      />
    </div>
  );

  // --- 组件: 级别选择 ---
  const LevelSelector = ({ label, value, options, onChange }) => (
    <div className="mb-4">
      <label className="text-xs font-bold text-[#8d6e63] mb-1.5 block">{label}</label>
      <div className="flex bg-[#fff0f5] rounded-lg p-0.5">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-1.5 text-[10px] rounded-md transition-all ${value === opt.value ? 'bg-white text-[#e68aae] shadow-sm font-bold' : 'text-[#8d6e63] hover:bg-white/50'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fff0f5] font-sans text-[#5d4037] pb-12">
      {/* 背景 */}
      <div className="fixed inset-0 z-0 opacity-30 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#ffdee9 2px, transparent 2px)', backgroundSize: '24px 24px' }}>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        
        {/* Header */}
        <header className="text-center mb-8 animate-fade-in">
          <h1 className="text-3xl font-serif font-bold text-[#e68aae] flex justify-center gap-2 items-center">
            <Sparkles className="w-6 h-6 text-[#ffd700]" />
            AI Pro Fitting Room
          </h1>
          <p className="text-xs text-[#bcaaa4] mt-1 tracking-wider uppercase">Gemini Pro Image Synthesis</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-6 h-full items-start">
          
          {/* 左侧：输入与基础设置 */}
          <div className="w-full lg:w-[25%] space-y-4">
            {/* 上传卡片 */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-white">
              <h3 className="font-bold text-[#e68aae] flex items-center gap-2 mb-3 text-sm">
                <Upload size={14}/> 素材上传
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'model', img: modelImage, label: '模特' },
                  { type: 'dress', img: dressImage, label: '服装' }
                ].map(({type, img, label}) => (
                  <div key={type} className="relative aspect-[3/4] bg-gray-50 rounded-xl border border-dashed border-[#e68aae]/30 hover:border-[#e68aae] overflow-hidden group cursor-pointer">
                    {img ? (
                      <img src={img} className="w-full h-full object-cover" alt={label}/>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-[#bcaaa4]">
                        {type === 'model' ? <Heart size={20}/> : <Shirt size={20}/>}
                        <span className="text-xs mt-1">{label}</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileUpload(e, type)}/>
                  </div>
                ))}
              </div>
            </div>

            {/* 拍摄角度 */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-white">
              <h3 className="font-bold text-[#e68aae] flex items-center gap-2 mb-3 text-sm">
                <Camera size={14}/> 拍摄机位
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {angles.map(ang => (
                  <button
                    key={ang.value}
                    onClick={() => setCameraAngle(ang.value)}
                    className={`text-xs py-2 rounded-lg border transition-all ${cameraAngle === ang.value ? 'bg-[#fff0f5] border-[#e68aae] text-[#e68aae] font-bold' : 'border-transparent hover:bg-gray-50 text-[#8d6e63]'}`}
                  >
                    {ang.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 中间：画布区域 */}
          <div className="w-full lg:w-[50%]">
             <div className="relative aspect-[3/4] bg-white rounded-[2rem] shadow-xl overflow-hidden border-4 border-white">
                {/* 错误提示 */}
                {errorMsg && (
                   <div className="absolute top-4 left-4 right-4 bg-red-50 text-red-500 px-3 py-2 rounded-lg text-xs z-50 flex items-center gap-2 animate-slide-down">
                     <AlertCircle size={14} /> {errorMsg}
                     <button onClick={() => setErrorMsg('')} className="ml-auto"><X size={14}/></button>
                   </div>
                )}

                {/* 加载遮罩 */}
                {isGenerating && (
                  <div className="absolute inset-0 bg-white/95 z-40 flex flex-col items-center justify-center text-[#e68aae]">
                    <div className="w-16 h-16 border-4 border-[#fff0f5] border-t-[#e68aae] rounded-full animate-spin mb-4"></div>
                    <p className="font-bold animate-pulse">正在进行多维数据合成...</p>
                    <div className="mt-2 text-xs text-[#bcaaa4] h-12 overflow-hidden flex flex-col items-center">
                       {logs.slice(-2).map((log, i) => <span key={i}>{log}</span>)}
                    </div>
                  </div>
                )}

                {/* 图片展示 */}
                <div className="w-full h-full flex items-center justify-center bg-[#fffbf0]">
                  {resultImage && viewMode === 'result' ? (
                    <img src={resultImage} className="w-full h-full object-contain animate-fade-in" alt="Result"/>
                  ) : viewMode === 'model' && modelImage ? (
                    <img src={modelImage} className="w-full h-full object-contain" alt="Model"/>
                  ) : viewMode === 'dress' && dressImage ? (
                    <img src={dressImage} className="w-full h-full object-contain" alt="Dress"/>
                  ) : (
                    <div className="text-center text-[#bcaaa4] opacity-50">
                      <Move3d size={48} className="mx-auto mb-2"/>
                      <p className="text-sm">准备就绪</p>
                    </div>
                  )}
                </div>
                
                {/* 底部视图切换 */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex bg-white/90 backdrop-blur px-1 rounded-full shadow-md border border-[#ffe4e1]">
                   {[
                     { id: 'model', icon: <Heart size={14}/>, label: '模特' },
                     { id: 'result', icon: <Sparkles size={14}/>, label: '生成' },
                     { id: 'dress', icon: <Shirt size={14}/>, label: '服装' },
                   ].map(item => (
                     <button 
                       key={item.id}
                       onClick={() => setViewMode(item.id)}
                       disabled={!modelImage && !dressImage}
                       className={`px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition-all rounded-full my-1
                         ${viewMode === item.id ? 'bg-[#e68aae] text-white shadow-sm' : 'text-[#8d6e63] hover:bg-gray-100'}`}
                     >
                       {item.icon} {item.label}
                     </button>
                   ))}
                </div>
             </div>
          </div>

          {/* 右侧：高级参数控制 */}
          <div className="w-full lg:w-[25%] flex flex-col gap-4">
             <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 shadow-sm border border-white flex-grow">
               <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#ffe4e1]">
                 <h3 className="font-bold text-[#e68aae] flex items-center gap-2 text-sm">
                   <Settings2 size={16}/> 身材数据
                 </h3>
                 <div className="flex bg-[#fff0f5] rounded-lg p-0.5">
                   <button onClick={() => setSettingMode('simple')} className={`px-3 py-1 text-[10px] rounded-md transition-all ${settingMode === 'simple' ? 'bg-white text-[#e68aae] shadow-sm font-bold' : 'text-[#bcaaa4]'}`}>简单</button>
                   <button onClick={() => setSettingMode('detailed')} className={`px-3 py-1 text-[10px] rounded-md transition-all ${settingMode === 'detailed' ? 'bg-white text-[#e68aae] shadow-sm font-bold' : 'text-[#bcaaa4]'}`}>细致</button>
                 </div>
               </div>

               <div className="space-y-4 overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                 {settingMode === 'simple' ? (
                   <div className="py-4">
                     <SliderControl 
                       label="身高范围 (140-175cm)" 
                       value={simpleHeight} min={140} max={175} 
                       onChange={setSimpleHeight} unit="cm"
                     />
                     <p className="text-[10px] text-[#bcaaa4] mt-2 bg-gray-50 p-2 rounded">
                       * 简单模式会自动根据身高比例优化体型，适合快速生成预览。
                     </p>
                   </div>
                 ) : (
                   <div className="animate-fade-in space-y-5">
                     <SliderControl 
                       label="精确身高" 
                       value={detailHeight} min={140} max={175} 
                       onChange={setDetailHeight} unit="cm"
                     />
                     
                     <div>
                       <label className="text-xs font-bold text-[#8d6e63] mb-1.5 block">胸围 (Cup Size)</label>
                       <div className="grid grid-cols-4 gap-1">
                         {cupSizes.map(cup => (
                           <button 
                             key={cup} onClick={() => setBustSize(cup)}
                             className={`py-1.5 text-xs rounded border ${bustSize === cup ? 'bg-[#fff0f5] border-[#e68aae] text-[#e68aae] font-bold' : 'border-transparent bg-gray-50 text-[#8d6e63]'}`}
                           >
                             {cup}
                           </button>
                         ))}
                       </div>
                     </div>

                     <LevelSelector label="腰围" value={waistLevel} options={bodyLevels} onChange={setWaistLevel} />
                     <LevelSelector label="臀围" value={hipLevel} options={bodyLevels} onChange={setHipLevel} />
                     <LevelSelector label="四肢粗细" value={limbLevel} options={bodyLevels} onChange={setLimbLevel} />
                   </div>
                 )}
               </div>
             </div>

             <button 
               onClick={generateTryOn}
               disabled={isGenerating || !modelImage || !dressImage}
               className="w-full bg-[#e68aae] hover:bg-[#d67096] disabled:bg-[#f3cddb] text-white py-4 rounded-xl font-bold text-sm shadow-lg shadow-[#e68aae]/30 transition-all flex items-center justify-center gap-2"
             >
               {isGenerating ? '运算中...' : <><Wand2 size={16}/> 生成试穿照</>}
             </button>
          </div>

        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ffe4e1; border-radius: 4px; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.4s ease-out; }
      `}</style>
    </div>
  );
};

export default App;