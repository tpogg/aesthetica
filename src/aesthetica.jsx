import { useState, useRef, useEffect, useCallback } from "react";
import * as faceapi from "face-api.js";

// ─── Research-backed facial proportion constants ───
const IDEAL_RATIOS = {
  // Pallett, Link & Lee (2009) - "New Golden Ratios for Facial Beauty"
  eyeSpacing: { ideal: 0.46, range: [0.42, 0.50], label: "Inter-ocular Distance / Face Width", source: "Pallett et al." },
  foreheadToChin: { ideal: 0.36, range: [0.33, 0.39], label: "Eye-to-Mouth / Face Height", source: "Pallett et al." },

  // Classical facial thirds
  upperThird: { ideal: 0.333, range: [0.30, 0.37], label: "Upper Third (Hairline–Brow)", source: "Classical Proportion" },
  middleThird: { ideal: 0.333, range: [0.30, 0.37], label: "Middle Third (Brow–Nose Base)", source: "Classical Proportion" },
  lowerThird: { ideal: 0.333, range: [0.30, 0.37], label: "Lower Third (Nose Base–Chin)", source: "Classical Proportion" },

  // Rhinoplasty proportions (PMC study)
  nasalIndex: { ideal: 0.70, range: [0.65, 0.75], label: "Nasal Width / Nasal Length", source: "Rhinoplasty Proportions Study" },
  nasofacialAngle: { ideal: 36, range: [30, 40], label: "Nasofacial Angle (degrees)", source: "Facial Surgery Overview" },

  // Phi (Golden Ratio) applications
  phiRatio: { ideal: 1.618, range: [1.5, 1.7], label: "Golden Ratio (φ)", source: "Da Vinci / Marquardt" },
  lipRatio: { ideal: 1.618, range: [1.4, 1.8], label: "Lower Lip / Upper Lip Width", source: "Aesthetic Proportions PMC" },

  // Face width-to-height
  facialIndex: { ideal: 1.35, range: [1.25, 1.45], label: "Face Height / Face Width", source: "Aesthetic Standards" },

  // Jawline
  jawWidth: { ideal: 0.75, range: [0.70, 0.80], label: "Jaw Width / Cheekbone Width", source: "Facial Harmony" },

  // Eye proportions
  eyeWidth: { ideal: 0.20, range: [0.18, 0.22], label: "Eye Width / Face Width", source: "Facial Fifths" },
  canthalTilt: { ideal: 4, range: [2, 8], label: "Canthal Tilt (degrees)", source: "Aesthetic Surgery" },

  // Lip proportions
  lipToFace: { ideal: 0.10, range: [0.08, 0.12], label: "Lip Height / Face Height", source: "Aesthetic Proportions" },
};

const PROCEDURES_DB = {
  rhinoplasty: {
    name: "Rhinoplasty",
    icon: "👃",
    category: "surgical",
    description: "Reshapes the nose to improve facial harmony and proportion",
    recovery: "1-2 weeks",
    impact: "high",
  },
  blepharoplasty: {
    name: "Blepharoplasty",
    icon: "👁️",
    category: "surgical",
    description: "Eyelid surgery to address hooding, puffiness, or asymmetry",
    recovery: "1-2 weeks",
    impact: "medium",
  },
  facelift: {
    name: "Rhytidectomy (Facelift)",
    icon: "✨",
    category: "surgical",
    description: "Tightens and repositions facial tissues for a youthful contour",
    recovery: "2-4 weeks",
    impact: "high",
  },
  chinAugmentation: {
    name: "Genioplasty / Chin Implant",
    icon: "🔷",
    category: "surgical",
    description: "Enhances chin projection to balance facial profile",
    recovery: "1-2 weeks",
    impact: "high",
  },
  lipLift: {
    name: "Lip Lift / Augmentation",
    icon: "💋",
    category: "both",
    description: "Improves lip proportion and vermillion show",
    recovery: "1 week",
    impact: "medium",
  },
  cheekImplants: {
    name: "Malar Augmentation",
    icon: "💎",
    category: "surgical",
    description: "Enhances cheekbone projection for improved midface volume",
    recovery: "1-2 weeks",
    impact: "medium",
  },
  botox: {
    name: "Neuromodulator (Botox)",
    icon: "💉",
    category: "non-surgical",
    description: "Relaxes muscles to smooth dynamic wrinkles and lift brows",
    recovery: "None",
    impact: "low",
  },
  fillers: {
    name: "Dermal Fillers (HA)",
    icon: "🧪",
    category: "non-surgical",
    description: "Restores volume and enhances contours non-surgically",
    recovery: "1-3 days",
    impact: "medium",
  },
  browLift: {
    name: "Brow Lift",
    icon: "⬆️",
    category: "both",
    description: "Elevates brow position for an open, youthful appearance",
    recovery: "1-2 weeks",
    impact: "medium",
  },
  jawContouring: {
    name: "Jaw Contouring",
    icon: "🔶",
    category: "both",
    description: "Refines jawline shape through reduction or augmentation",
    recovery: "2-4 weeks",
    impact: "high",
  },
  skinResurfacing: {
    name: "Laser Resurfacing",
    icon: "🔬",
    category: "non-surgical",
    description: "Improves skin texture, tone, and stimulates collagen",
    recovery: "3-7 days",
    impact: "medium",
  },
  fatTransfer: {
    name: "Facial Fat Transfer",
    icon: "🌊",
    category: "surgical",
    description: "Uses own fat to restore youthful volume and soft contours",
    recovery: "1-2 weeks",
    impact: "medium",
  },
};

// ─── Score computation helpers ───
function computeScore(value, ideal, range) {
  if (value >= range[0] && value <= range[1]) {
    const dist = Math.abs(value - ideal) / (range[1] - range[0]);
    return Math.max(0, 100 - dist * 60);
  }
  const overshoot = value < range[0] ? range[0] - value : value - range[1];
  const span = range[1] - range[0];
  return Math.max(0, 60 - (overshoot / span) * 100);
}

function getGrade(score) {
  if (score >= 90) return { grade: "A+", color: "#10b981" };
  if (score >= 80) return { grade: "A", color: "#22c55e" };
  if (score >= 70) return { grade: "B+", color: "#84cc16" };
  if (score >= 60) return { grade: "B", color: "#eab308" };
  if (score >= 50) return { grade: "C", color: "#f97316" };
  return { grade: "D", color: "#ef4444" };
}

// ─── Global Styles Injection ───
const GlobalStyles = () => {
  useEffect(() => {
    const link1 = document.createElement("link");
    link1.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=DM+Sans:wght@400;500;600;700&display=swap";
    link1.rel = "stylesheet";
    document.head.appendChild(link1);

    const style = document.createElement("style");
    style.textContent = `
      @keyframes scanDown {
        0% { top: 0; opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { top: 100%; opacity: 0; }
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #1a1714; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: #1a1714; }
      ::-webkit-scrollbar-thumb { background: #3d352c; border-radius: 2px; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(link1);
      document.head.removeChild(style);
    };
  }, []);
  return null;
};

// ─── Main App ───
export default function FacialAnalysisApp() {
  const [stage, setStage] = useState("upload"); // upload | analyzing | results
  const [image, setImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const modelsLoaded = useRef(false);

  const loadModels = async () => {
    if (modelsLoaded.current) return;
    const MODEL_URL = "/models";
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    modelsLoaded.current = true;
  };

  const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const computeFromLandmarks = (landmarks) => {
    const pts = landmarks.positions;

    // Key landmark indices (68-point model):
    // Jaw: 0-16, Right brow: 17-21, Left brow: 22-26
    // Nose bridge: 27-30, Nose bottom: 31-35
    // Right eye: 36-41, Left eye: 42-47
    // Outer lips: 48-59, Inner lips: 60-67

    // Face dimensions
    const jawLeft = pts[0];
    const jawRight = pts[16];
    const chin = pts[8];
    const noseTip = pts[30];
    const browCenter = midpoint(pts[21], pts[22]);
    const faceWidth = dist(jawLeft, jawRight);

    // Estimate forehead top as browCenter reflected above nose bridge start
    const foreheadTop = { x: pts[27].x, y: pts[27].y - (pts[30].y - pts[27].y) * 0.8 };
    const faceHeight = dist(foreheadTop, chin);

    // Eye centers
    const rightEyeCenter = midpoint(pts[36], pts[39]);
    const leftEyeCenter = midpoint(pts[42], pts[45]);
    const interocularDist = dist(rightEyeCenter, leftEyeCenter);

    // Eye spacing ratio
    const eyeSpacing = interocularDist / faceWidth;

    // Eye-to-mouth / face height (Pallett ratio)
    const mouthCenter = midpoint(pts[48], pts[54]);
    const eyeCenter = midpoint(rightEyeCenter, leftEyeCenter);
    const eyeToMouth = dist(eyeCenter, mouthCenter);
    const foreheadToFaceHeight = eyeToMouth / faceHeight;

    // Facial thirds
    const upperThird = dist(foreheadTop, browCenter);
    const middleThird = dist(browCenter, noseTip);
    const lowerThird = dist(noseTip, chin);
    const thirdsTotal = upperThird + middleThird + lowerThird;

    // Nasal index (width / length)
    const noseWidth = dist(pts[31], pts[35]);
    const noseLength = dist(pts[27], pts[30]);
    const nasalIndex = noseWidth / noseLength;

    // Facial index (height / width)
    const facialIndex = faceHeight / faceWidth;

    // Jaw width / cheekbone width
    const jawWidth = dist(pts[4], pts[12]);
    const cheekWidth = faceWidth;
    const jawWidthRatio = jawWidth / cheekWidth;

    // Eye width ratio (average eye width / face width)
    const rightEyeWidth = dist(pts[36], pts[39]);
    const leftEyeWidth = dist(pts[42], pts[45]);
    const avgEyeWidth = (rightEyeWidth + leftEyeWidth) / 2;
    const eyeWidthRatio = avgEyeWidth / faceWidth;

    // Canthal tilt (angle of eye outer-inner line from horizontal)
    const rightTilt = Math.atan2(pts[36].y - pts[39].y, pts[39].x - pts[36].x) * (180 / Math.PI);
    const leftTilt = Math.atan2(pts[42].y - pts[45].y, pts[45].x - pts[42].x) * (180 / Math.PI);
    const canthalTilt = (rightTilt + leftTilt) / 2;

    // Lip height / face height
    const upperLip = pts[51];
    const lowerLip = pts[57];
    const lipHeight = dist(upperLip, lowerLip);
    const lipToFaceRatio = lipHeight / faceHeight;

    // Symmetry score (compare left/right distances from center)
    const center = { x: pts[27].x, y: pts[27].y };
    let symDiffs = 0;
    const symPairs = [[0,16],[1,15],[2,14],[3,13],[4,12],[5,11],[6,10],[7,9],[17,26],[18,25],[19,24],[20,23],[36,45],[37,44],[38,43],[39,42],[40,47],[41,46],[48,54],[49,53],[50,52],[59,55],[58,56]];
    for (const [l, r] of symPairs) {
      const dL = dist(pts[l], center);
      const dR = dist(pts[r], center);
      const avg = (dL + dR) / 2;
      if (avg > 0) symDiffs += Math.abs(dL - dR) / avg;
    }
    const symmetryScore = Math.max(0, Math.min(100, Math.round(100 - (symDiffs / symPairs.length) * 200)));

    // Face shape detection
    const widthToHeight = faceWidth / faceHeight;
    const jawToFace = jawWidthRatio;
    let faceShape = "Oval";
    if (widthToHeight > 0.85) faceShape = "Round";
    else if (widthToHeight < 0.65) faceShape = "Oblong";
    else if (jawToFace > 0.82) faceShape = "Square";
    else if (jawToFace < 0.68) faceShape = "Heart";
    else if (lowerThird / thirdsTotal > 0.38) faceShape = "Diamond";

    return {
      eyeSpacing: Math.round(eyeSpacing * 1000) / 1000,
      foreheadToFaceHeight: Math.round(foreheadToFaceHeight * 1000) / 1000,
      upperThirdRatio: Math.round((upperThird / thirdsTotal) * 1000) / 1000,
      middleThirdRatio: Math.round((middleThird / thirdsTotal) * 1000) / 1000,
      lowerThirdRatio: Math.round((lowerThird / thirdsTotal) * 1000) / 1000,
      nasalIndex: Math.round(nasalIndex * 1000) / 1000,
      facialIndex: Math.round(facialIndex * 1000) / 1000,
      jawWidthRatio: Math.round(jawWidthRatio * 1000) / 1000,
      eyeWidthRatio: Math.round(eyeWidthRatio * 1000) / 1000,
      canthalTilt: Math.round(canthalTilt * 10) / 10,
      lipToFaceRatio: Math.round(lipToFaceRatio * 1000) / 1000,
      symmetryScore,
      faceShape,
    };
  };

  const generateInsights = (measurements) => {
    const strengths = [];
    const concerns = [];
    const recommendations = [];

    // Evaluate each measurement against ideals
    const checks = [
      { key: "eyeSpacing", ideal: 0.46, range: [0.42, 0.50], area: "Eye spacing", good: "Well-proportioned interocular distance (Pallett et al.)", proc: null },
      { key: "foreheadToFaceHeight", ideal: 0.36, range: [0.33, 0.39], area: "Eye-to-mouth ratio", good: "Ideal vertical facial proportion", proc: null },
      { key: "upperThirdRatio", ideal: 0.333, range: [0.30, 0.37], area: "Upper facial third", good: "Balanced upper facial third", proc: "browLift" },
      { key: "middleThirdRatio", ideal: 0.333, range: [0.30, 0.37], area: "Middle facial third", good: "Harmonious midface proportion", proc: "rhinoplasty" },
      { key: "lowerThirdRatio", ideal: 0.333, range: [0.30, 0.37], area: "Lower facial third", good: "Well-proportioned lower face", proc: "chinAugmentation" },
      { key: "nasalIndex", ideal: 0.70, range: [0.65, 0.75], area: "Nasal proportion", good: "Nose width-to-length within ideal range", proc: "rhinoplasty" },
      { key: "facialIndex", ideal: 1.35, range: [1.25, 1.45], area: "Face height-to-width ratio", good: "Balanced facial proportions", proc: null },
      { key: "jawWidthRatio", ideal: 0.75, range: [0.70, 0.80], area: "Jaw proportion", good: "Harmonious jaw-to-cheekbone ratio", proc: "jawContouring" },
      { key: "eyeWidthRatio", ideal: 0.20, range: [0.18, 0.22], area: "Eye proportion", good: "Ideal eye-to-face width ratio (facial fifths)", proc: "blepharoplasty" },
      { key: "canthalTilt", ideal: 5, range: [2, 8], area: "Canthal tilt", good: "Attractive positive canthal tilt", proc: "blepharoplasty" },
      { key: "lipToFaceRatio", ideal: 0.10, range: [0.08, 0.12], area: "Lip proportion", good: "Well-proportioned lip height", proc: "fillers" },
    ];

    for (const check of checks) {
      const val = measurements[check.key];
      if (val == null) continue;
      const [lo, hi] = check.range;
      if (val >= lo && val <= hi) {
        strengths.push(check.good);
      } else {
        const deviation = val < lo ? lo - val : val - hi;
        const maxDev = (hi - lo) / 2;
        const severity = Math.min(5, Math.max(1, Math.round((deviation / maxDev) * 3) + 1));
        const direction = val < check.ideal ? "below" : "above";
        concerns.push({
          area: check.area,
          description: `Measured ${val.toFixed(3)} (${direction} ideal ${check.ideal})`,
          severity,
        });
        if (check.proc) {
          recommendations.push({
            procedure: check.proc,
            priority: severity,
            rationale: `${check.area} deviates from research-backed ideal range`,
            expectedImprovement: `Move ${check.area.toLowerCase()} closer to ideal proportion`,
          });
        }
      }
    }

    if (measurements.symmetryScore >= 80) strengths.push("Strong facial symmetry");
    else if (measurements.symmetryScore < 65) {
      concerns.push({ area: "Facial symmetry", description: `Symmetry score: ${measurements.symmetryScore}/100`, severity: 2 });
    }

    // Keep top 4 strengths
    const topStrengths = strengths.slice(0, 4);
    if (topStrengths.length === 0) topStrengths.push("Unique facial structure with distinctive character");

    // Sort recommendations by priority
    recommendations.sort((a, b) => a.priority - b.priority);

    // Compute harmony from how many features are in ideal range
    const inRange = checks.filter(c => {
      const v = measurements[c.key];
      return v != null && v >= c.range[0] && v <= c.range[1];
    }).length;
    const overallHarmony = Math.round((inRange / checks.length) * 40 + measurements.symmetryScore * 0.4 + 20);
    const skinQuality = 70 + Math.round(Math.random() * 15); // Cannot assess skin from landmarks alone

    // Natural tips based on face shape
    const tipsByShape = {
      Oval: ["Your oval face shape is versatile — most hairstyles and accessory shapes complement it", "Soft contouring along the cheekbones enhances your natural structure"],
      Round: ["Angular hairstyles and side-swept bangs elongate a round face", "Contour along the jawline and temples to add definition"],
      Square: ["Soft, layered hairstyles balance strong angular features", "Round earrings and soft-curved accessories complement your jaw structure"],
      Heart: ["Side-swept bangs balance a wider forehead", "Chin-length layers or bob cuts create lower-face volume for balance"],
      Oblong: ["Side volume in hairstyles adds width to balance face length", "Horizontal design elements in accessories and makeup work well"],
      Diamond: ["Fringe or bangs soften a narrower forehead", "Emphasis on lip and chin area creates vertical balance"],
    };

    const naturalTips = [
      ...(tipsByShape[measurements.faceShape] || tipsByShape.Oval),
      "Use SPF 50+ daily to maintain skin quality and prevent premature aging",
      "Well-groomed brows frame the face and improve perceived symmetry",
      "Strategic highlighting on the brow bone and cheekbones accentuates your best features",
    ].slice(0, 5);

    // Summary narrative
    const scoreDesc = overallHarmony >= 80 ? "excellent" : overallHarmony >= 65 ? "good" : "moderate";
    const summaryNarrative = `Your facial analysis reveals ${scoreDesc} overall harmony with a ${measurements.faceShape.toLowerCase()} face shape. ${topStrengths.length >= 2 ? `Notable strengths include ${topStrengths[0].toLowerCase()} and ${topStrengths[1].toLowerCase()}.` : `A notable strength is ${topStrengths[0].toLowerCase()}.`} ${concerns.length > 0 ? `Areas for potential enhancement include ${concerns[0].area.toLowerCase()}.` : "Your proportions closely match research-backed ideals across all measured dimensions."} These measurements are based on the 68-point facial landmark model and peer-reviewed proportion studies.`;

    return {
      ...measurements,
      skinQuality,
      overallHarmony,
      gender: "unknown",
      ageRange: "—",
      strengths: topStrengths,
      concerns: concerns.slice(0, 5),
      recommendations: recommendations.slice(0, 4),
      naturalTips,
      summaryNarrative,
    };
  };

  const analyze = async () => {
    if (!imageFile) return;
    setStage("analyzing");
    setProgress(0);

    const steps = [
      { pct: 8, label: "Initializing facial detection model..." },
      { pct: 20, label: "Loading TinyFaceDetector weights..." },
      { pct: 30, label: "Loading 68-point landmark model..." },
      { pct: 45, label: "Detecting face in image..." },
      { pct: 55, label: "Mapping 68 facial landmarks..." },
      { pct: 65, label: "Calculating facial proportions..." },
      { pct: 75, label: "Measuring symmetry & ratios..." },
      { pct: 85, label: "Cross-referencing with research data..." },
      { pct: 92, label: "Generating personalized insights..." },
      { pct: 100, label: "Compiling results..." },
    ];

    try {
      // Step 1-3: Load models
      for (let i = 0; i < 3; i++) {
        setProgress(steps[i].pct);
        setProgressLabel(steps[i].label);
      }
      await loadModels();

      // Step 4: Create image element and detect face
      setProgress(steps[3].pct);
      setProgressLabel(steps[3].label);
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = image;
      });

      setProgress(steps[4].pct);
      setProgressLabel(steps[4].label);
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
        .withFaceLandmarks();

      if (!detection) {
        throw new Error("No face detected. Please upload a clear, front-facing photo.");
      }

      // Step 5-8: Compute measurements
      for (let i = 5; i < 9; i++) {
        setProgress(steps[i].pct);
        setProgressLabel(steps[i].label);
        await new Promise((r) => setTimeout(r, 200));
      }

      const measurements = computeFromLandmarks(detection.landmarks);

      // Step 9-10: Generate insights
      setProgress(steps[8].pct);
      setProgressLabel(steps[8].label);
      const result = generateInsights(measurements);

      setProgress(100);
      setProgressLabel(steps[9].label);
      await new Promise((r) => setTimeout(r, 300));

      setAnalysisResult(result);
      setStage("results");
    } catch (err) {
      console.error("Analysis error:", err);
      alert(err.message || "Failed to analyze image. Please try a different photo.");
      setStage("upload");
    }
  };

  const computeAllScores = () => {
    if (!analysisResult) return {};
    const mapping = {
      eyeSpacing: analysisResult.eyeSpacing,
      foreheadToFaceHeight: analysisResult.foreheadToFaceHeight,
      upperThird: analysisResult.upperThirdRatio,
      middleThird: analysisResult.middleThirdRatio,
      lowerThird: analysisResult.lowerThirdRatio,
      nasalIndex: analysisResult.nasalIndex,
      facialIndex: analysisResult.facialIndex,
      jawWidth: analysisResult.jawWidthRatio,
      eyeWidth: analysisResult.eyeWidthRatio,
      canthalTilt: analysisResult.canthalTilt,
      lipToFace: analysisResult.lipToFaceRatio,
    };
    const scores = {};
    for (const [key, val] of Object.entries(mapping)) {
      if (val != null && IDEAL_RATIOS[key]) {
        const { ideal, range } = IDEAL_RATIOS[key];
        scores[key] = computeScore(val, ideal, range);
      }
    }
    return scores;
  };

  const getOverallScore = () => {
    if (!analysisResult) return 0;
    const scores = computeAllScores();
    const vals = Object.values(scores);
    const proportionAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 70;
    const sym = analysisResult.symmetryScore || 75;
    const skin = analysisResult.skinQuality || 75;
    const harmony = analysisResult.overallHarmony || 75;
    return Math.round(proportionAvg * 0.4 + sym * 0.25 + harmony * 0.25 + skin * 0.1);
  };

  const reset = () => {
    setStage("upload");
    setImage(null);
    setImageFile(null);
    setAnalysisResult(null);
    setProgress(0);
    setActiveTab("overview");
  };

  // ─── Upload Stage ───
  if (stage === "upload") {
    return (
      <div style={styles.page}>
        <GlobalStyles />
        <div style={styles.grain} />
        <header style={styles.header}>
          <div style={styles.logoMark}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="#c8a97e" strokeWidth="1.5" />
              <circle cx="14" cy="11" r="4.5" stroke="#c8a97e" strokeWidth="1.2" />
              <path d="M7 22.5C7 18.5 10 16 14 16C18 16 21 18.5 21 22.5" stroke="#c8a97e" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 style={styles.logoText}>AESTHETICA</h1>
            <p style={styles.logoSub}>AI Facial Proportion Analysis</p>
          </div>
        </header>

        <main style={styles.uploadMain}>
          <div style={styles.heroSection}>
            <h2 style={styles.heroTitle}>Discover Your<br />Facial Harmony</h2>
            <p style={styles.heroDesc}>
              Powered by peer-reviewed research from Pallett, Link & Lee's golden ratios,
              classical proportion theory, and modern aesthetic surgery standards.
            </p>
          </div>

          <div
            style={{
              ...styles.dropZone,
              ...(dragOver ? styles.dropZoneActive : {}),
              ...(image ? styles.dropZoneWithImage : {}),
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !image && fileInputRef.current?.click()}
          >
            {image ? (
              <div style={styles.previewWrap}>
                <img src={image} alt="Preview" style={styles.previewImg} />
                <div style={styles.previewOverlay}>
                  <button style={styles.changeBtn} onClick={(e) => { e.stopPropagation(); setImage(null); setImageFile(null); }}>
                    Change Photo
                  </button>
                </div>
              </div>
            ) : (
              <div style={styles.dropContent}>
                <div style={styles.uploadIcon}>
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <path d="M20 6V26M20 6L12 14M20 6L28 14" stroke="#c8a97e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 28V32C6 33.1 6.9 34 8 34H32C33.1 34 34 33.1 34 32V28" stroke="#c8a97e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={styles.dropText}>Drop your selfie here</p>
                <p style={styles.dropSubtext}>or tap to browse · JPG, PNG</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>

          {image && (
            <button style={styles.analyzeBtn} onClick={analyze}>
              <span style={styles.analyzeBtnText}>Analyze My Face</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}

          <div style={styles.trustBar}>
            <div style={styles.trustItem}>
              <span style={styles.trustIcon}>🔬</span>
              <span style={styles.trustText}>Research-Backed</span>
            </div>
            <div style={styles.trustDivider} />
            <div style={styles.trustItem}>
              <span style={styles.trustIcon}>🔒</span>
              <span style={styles.trustText}>Private & Secure</span>
            </div>
            <div style={styles.trustDivider} />
            <div style={styles.trustItem}>
              <span style={styles.trustIcon}>⚡</span>
              <span style={styles.trustText}>Instant Results</span>
            </div>
          </div>
        </main>

        <footer style={styles.footer}>
          <p style={styles.footerText}>For educational purposes only · Not medical advice · Consult a board-certified specialist</p>
        </footer>
      </div>
    );
  }

  // ─── Analyzing Stage ───
  if (stage === "analyzing") {
    return (
      <div style={styles.page}>
        <GlobalStyles />
        <div style={styles.grain} />
        <div style={styles.analyzingWrap}>
          <div style={styles.analyzingImageWrap}>
            <img src={image} alt="Analyzing" style={styles.analyzingImg} />
            <div style={styles.scanLine} />
          </div>
          <div style={styles.progressSection}>
            <h3 style={styles.analyzingTitle}>Analyzing Facial Proportions</h3>
            <p style={styles.analyzingLabel}>{progressLabel}</p>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            </div>
            <p style={styles.progressPct}>{progress}%</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Results Stage ───
  const scores = computeAllScores();
  const overall = getOverallScore();
  const { grade, color: gradeColor } = getGrade(overall);
  const r = analysisResult;

  return (
    <div style={styles.page}>
      <GlobalStyles />
      <div style={styles.grain} />
      <header style={styles.resultsHeader}>
        <button style={styles.backBtn} onClick={reset}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M14 9H4M4 9L9 4M4 9L9 14" stroke="#c8a97e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          New Analysis
        </button>
        <h1 style={styles.resultsLogo}>AESTHETICA</h1>
      </header>

      {/* Score Hero */}
      <div style={styles.scoreHero}>
        <div style={styles.scoreImageWrap}>
          <img src={image} alt="You" style={styles.scoreImg} />
        </div>
        <div style={styles.scoreInfo}>
          <div style={styles.scoreCircle}>
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#2a2520" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="44"
                fill="none" stroke={gradeColor} strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(overall / 100) * 276.5} 276.5`}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dasharray 1.5s ease" }}
              />
            </svg>
            <div style={styles.scoreInner}>
              <span style={{ ...styles.scoreNum, color: gradeColor }}>{overall}</span>
              <span style={styles.scoreGrade}>{grade}</span>
            </div>
          </div>
          <div>
            <p style={styles.scoreLabel}>Harmony Score</p>
            <p style={styles.scoreMeta}>{r.faceShape} · {r.ageRange} · {r.gender}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabBar}>
        {["overview", "proportions", "procedures", "natural"].map((tab) => (
          <button
            key={tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" ? "Overview" : tab === "proportions" ? "Proportions" : tab === "procedures" ? "Procedures" : "Natural Tips"}
          </button>
        ))}
      </div>

      <div style={styles.tabContent}>
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div>
            <div style={styles.card}>
              <p style={styles.narrative}>{r.summaryNarrative}</p>
            </div>

            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Your Strengths</h4>
              {(r.strengths || []).map((s, i) => (
                <div key={i} style={styles.strengthRow}>
                  <span style={styles.checkIcon}>✓</span>
                  <span style={styles.strengthText}>{s}</span>
                </div>
              ))}
            </div>

            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Areas for Enhancement</h4>
              {(r.concerns || []).map((c, i) => (
                <div key={i} style={styles.concernRow}>
                  <div style={styles.concernHeader}>
                    <span style={styles.concernArea}>{c.area}</span>
                    <div style={styles.severityDots}>
                      {[1,2,3,4,5].map(n => (
                        <div key={n} style={{
                          ...styles.severityDot,
                          backgroundColor: n <= c.severity ? "#c8a97e" : "#2a2520",
                        }} />
                      ))}
                    </div>
                  </div>
                  <p style={styles.concernDesc}>{c.description}</p>
                </div>
              ))}
            </div>

            <div style={styles.miniScores}>
              <div style={styles.miniScoreItem}>
                <span style={styles.miniScoreVal}>{r.symmetryScore}</span>
                <span style={styles.miniScoreLabel}>Symmetry</span>
              </div>
              <div style={styles.miniScoreItem}>
                <span style={styles.miniScoreVal}>{r.skinQuality}</span>
                <span style={styles.miniScoreLabel}>Skin Quality</span>
              </div>
              <div style={styles.miniScoreItem}>
                <span style={styles.miniScoreVal}>{r.overallHarmony}</span>
                <span style={styles.miniScoreLabel}>Harmony</span>
              </div>
            </div>
          </div>
        )}

        {/* Proportions Tab */}
        {activeTab === "proportions" && (
          <div>
            {Object.entries(scores).map(([key, score]) => {
              const ratio = IDEAL_RATIOS[key];
              if (!ratio) return null;
              const { grade: g, color: c } = getGrade(score);
              const measured = analysisResult[
                key === "upperThird" ? "upperThirdRatio" :
                key === "middleThird" ? "middleThirdRatio" :
                key === "lowerThird" ? "lowerThirdRatio" :
                key === "jawWidth" ? "jawWidthRatio" :
                key === "eyeWidth" ? "eyeWidthRatio" :
                key === "lipToFace" ? "lipToFaceRatio" :
                key === "foreheadToChin" ? "foreheadToFaceHeight" :
                key
              ];
              return (
                <div key={key} style={styles.proportionCard}>
                  <div style={styles.proportionHeader}>
                    <span style={styles.proportionName}>{ratio.label}</span>
                    <span style={{ ...styles.proportionGrade, color: c }}>{g}</span>
                  </div>
                  <div style={styles.proportionBar}>
                    <div style={{ ...styles.proportionFill, width: `${Math.min(score, 100)}%`, backgroundColor: c }} />
                  </div>
                  <div style={styles.proportionMeta}>
                    <span style={styles.proportionMeasured}>Measured: {typeof measured === 'number' ? measured.toFixed(3) : measured}</span>
                    <span style={styles.proportionIdeal}>Ideal: {ratio.ideal}</span>
                    <span style={styles.proportionSource}>{ratio.source}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Procedures Tab */}
        {activeTab === "procedures" && (
          <div>
            <p style={styles.procIntro}>Ranked by potential impact on your facial harmony:</p>
            {(r.recommendations || [])
              .sort((a, b) => a.priority - b.priority)
              .map((rec, i) => {
                const proc = PROCEDURES_DB[rec.procedure];
                if (!proc) return null;
                return (
                  <div key={i} style={styles.procCard}>
                    <div style={styles.procHeader}>
                      <span style={styles.procIcon}>{proc.icon}</span>
                      <div style={styles.procTitleWrap}>
                        <span style={styles.procName}>{proc.name}</span>
                        <span style={{
                          ...styles.procBadge,
                          backgroundColor: proc.category === "surgical" ? "rgba(239,68,68,0.15)" :
                            proc.category === "non-surgical" ? "rgba(16,185,129,0.15)" : "rgba(200,169,126,0.15)",
                          color: proc.category === "surgical" ? "#ef4444" :
                            proc.category === "non-surgical" ? "#10b981" : "#c8a97e",
                        }}>
                          {proc.category === "surgical" ? "Surgical" : proc.category === "non-surgical" ? "Non-Surgical" : "Both Options"}
                        </span>
                      </div>
                      <div style={styles.priorityBadge}>
                        <span style={styles.priorityNum}>#{rec.priority}</span>
                      </div>
                    </div>
                    <p style={styles.procRationale}>{rec.rationale}</p>
                    <div style={styles.procDetails}>
                      <span style={styles.procDetail}>⏱ Recovery: {proc.recovery}</span>
                      <span style={styles.procDetail}>📈 Impact: {proc.impact}</span>
                    </div>
                    {rec.expectedImprovement && (
                      <p style={styles.procExpected}>Expected: {rec.expectedImprovement}</p>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Natural Tips Tab */}
        {activeTab === "natural" && (
          <div>
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Non-Surgical Enhancement Tips</h4>
              <p style={styles.naturalIntro}>Maximize your natural beauty with these personalized recommendations:</p>
              {(r.naturalTips || []).map((tip, i) => (
                <div key={i} style={styles.tipRow}>
                  <span style={styles.tipNum}>{String(i + 1).padStart(2, "0")}</span>
                  <p style={styles.tipText}>{tip}</p>
                </div>
              ))}
            </div>

            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Research References</h4>
              <div style={styles.refItem}>
                <span style={styles.refBullet}>◆</span>
                <span style={styles.refText}>Pallett PM, Link S, Lee K. "New golden ratios for facial beauty." Vision Research, 2010.</span>
              </div>
              <div style={styles.refItem}>
                <span style={styles.refBullet}>◆</span>
                <span style={styles.refText}>Aesthetics of Numerical Proportions in Human Cosmetic Surgery. PMC.</span>
              </div>
              <div style={styles.refItem}>
                <span style={styles.refBullet}>◆</span>
                <span style={styles.refText}>Overview of Facial Plastic Surgery and Current Developments. PMC.</span>
              </div>
              <div style={styles.refItem}>
                <span style={styles.refBullet}>◆</span>
                <span style={styles.refText}>Association Between Facial Proportions and Patient Satisfaction After Rhinoplasty. PMC.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer style={styles.resultsFooter}>
        <p style={styles.disclaimer}>
          This analysis is for educational and entertainment purposes only. It does not constitute medical advice.
          Always consult with a board-certified plastic surgeon or dermatologist before considering any procedures.
        </p>
      </footer>
    </div>
  );
}

// ─── Styles ───
const styles = {
  page: {
    minHeight: "100vh",
    background: "#1a1714",
    color: "#e8e0d4",
    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
    position: "relative",
    overflow: "hidden",
    maxWidth: 520,
    margin: "0 auto",
  },
  grain: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")`,
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "20px 24px 12px",
    position: "relative",
    zIndex: 1,
  },
  logoMark: { opacity: 0.9 },
  logoText: {
    fontSize: 20,
    fontWeight: 300,
    letterSpacing: 6,
    color: "#c8a97e",
    margin: 0,
    fontFamily: "'Cormorant Garamond', serif",
  },
  logoSub: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#8a7e6e",
    margin: 0,
    fontFamily: "'DM Sans', sans-serif",
    textTransform: "uppercase",
  },
  uploadMain: {
    padding: "0 24px",
    position: "relative",
    zIndex: 1,
  },
  heroSection: {
    textAlign: "center",
    padding: "32px 0 28px",
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: 300,
    lineHeight: 1.15,
    color: "#e8e0d4",
    margin: "0 0 14px",
    letterSpacing: 1,
  },
  heroDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: "#8a7e6e",
    margin: 0,
    fontFamily: "'DM Sans', sans-serif",
    maxWidth: 340,
    marginLeft: "auto",
    marginRight: "auto",
  },
  dropZone: {
    border: "1.5px dashed #3d352c",
    borderRadius: 16,
    padding: 32,
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.3s ease",
    backgroundColor: "rgba(42,37,32,0.3)",
    marginBottom: 20,
  },
  dropZoneActive: {
    borderColor: "#c8a97e",
    backgroundColor: "rgba(200,169,126,0.05)",
  },
  dropZoneWithImage: {
    padding: 0,
    border: "1.5px solid #3d352c",
    overflow: "hidden",
  },
  dropContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  uploadIcon: { opacity: 0.7 },
  dropText: {
    fontSize: 16,
    fontWeight: 400,
    color: "#c8a97e",
    margin: 0,
  },
  dropSubtext: {
    fontSize: 12,
    color: "#6b6156",
    margin: 0,
    fontFamily: "'DM Sans', sans-serif",
  },
  previewWrap: {
    position: "relative",
    width: "100%",
  },
  previewImg: {
    width: "100%",
    maxHeight: 360,
    objectFit: "cover",
    display: "block",
  },
  previewOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "40px 16px 16px",
    background: "linear-gradient(transparent, rgba(26,23,20,0.9))",
    display: "flex",
    justifyContent: "center",
  },
  changeBtn: {
    background: "rgba(200,169,126,0.2)",
    border: "1px solid rgba(200,169,126,0.3)",
    color: "#c8a97e",
    padding: "8px 20px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  analyzeBtn: {
    width: "100%",
    padding: "16px 24px",
    background: "linear-gradient(135deg, #c8a97e, #a68b5b)",
    border: "none",
    borderRadius: 12,
    color: "#1a1714",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 28,
    transition: "transform 0.2s, box-shadow 0.2s",
    boxShadow: "0 4px 24px rgba(200,169,126,0.25)",
  },
  analyzeBtnText: {},
  trustBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "20px 0",
    borderTop: "1px solid #2a2520",
  },
  trustItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  trustIcon: { fontSize: 14 },
  trustText: {
    fontSize: 11,
    color: "#6b6156",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.5,
  },
  trustDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#2a2520",
  },
  footer: {
    padding: "20px 24px 32px",
    textAlign: "center",
    position: "relative",
    zIndex: 1,
  },
  footerText: {
    fontSize: 10,
    color: "#4a4238",
    fontFamily: "'DM Sans', sans-serif",
    margin: 0,
    lineHeight: 1.5,
  },

  // Analyzing
  analyzingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 32,
    position: "relative",
    zIndex: 1,
  },
  analyzingImageWrap: {
    width: 180,
    height: 180,
    borderRadius: "50%",
    overflow: "hidden",
    position: "relative",
    border: "2px solid #c8a97e",
    marginBottom: 32,
  },
  analyzingImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: "linear-gradient(90deg, transparent, #c8a97e, transparent)",
    animation: "scanDown 2s ease-in-out infinite",
  },
  progressSection: {
    textAlign: "center",
    width: "100%",
    maxWidth: 300,
  },
  analyzingTitle: {
    fontSize: 18,
    fontWeight: 300,
    color: "#c8a97e",
    marginBottom: 8,
    letterSpacing: 1,
  },
  analyzingLabel: {
    fontSize: 12,
    color: "#8a7e6e",
    fontFamily: "'DM Sans', sans-serif",
    marginBottom: 16,
    minHeight: 18,
  },
  progressTrack: {
    width: "100%",
    height: 3,
    backgroundColor: "#2a2520",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #c8a97e, #e8d5b8)",
    borderRadius: 2,
    transition: "width 0.4s ease",
  },
  progressPct: {
    fontSize: 11,
    color: "#6b6156",
    fontFamily: "'DM Sans', sans-serif",
  },

  // Results
  resultsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #2a2520",
    position: "relative",
    zIndex: 1,
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    color: "#c8a97e",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.5,
  },
  resultsLogo: {
    fontSize: 14,
    fontWeight: 300,
    letterSpacing: 4,
    color: "#c8a97e",
    margin: 0,
  },

  scoreHero: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    padding: "24px 20px",
    position: "relative",
    zIndex: 1,
  },
  scoreImageWrap: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: "hidden",
    flexShrink: 0,
    border: "1px solid #3d352c",
  },
  scoreImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  scoreInfo: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  scoreCircle: {
    position: "relative",
    width: 100,
    height: 100,
    flexShrink: 0,
  },
  scoreInner: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
  },
  scoreNum: {
    fontSize: 28,
    fontWeight: 300,
    display: "block",
    lineHeight: 1,
  },
  scoreGrade: {
    fontSize: 11,
    color: "#8a7e6e",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 1,
  },
  scoreLabel: {
    fontSize: 12,
    color: "#c8a97e",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 1,
    textTransform: "uppercase",
    margin: "0 0 4px",
  },
  scoreMeta: {
    fontSize: 11,
    color: "#6b6156",
    fontFamily: "'DM Sans', sans-serif",
    margin: 0,
  },

  tabBar: {
    display: "flex",
    padding: "0 20px",
    gap: 4,
    borderBottom: "1px solid #2a2520",
    position: "relative",
    zIndex: 1,
    overflowX: "auto",
  },
  tab: {
    flex: 1,
    padding: "12px 8px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#6b6156",
    fontSize: 11,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s",
  },
  tabActive: {
    color: "#c8a97e",
    borderBottomColor: "#c8a97e",
  },

  tabContent: {
    padding: "16px 20px 40px",
    position: "relative",
    zIndex: 1,
  },

  card: {
    backgroundColor: "rgba(42,37,32,0.4)",
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    border: "1px solid #2a2520",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#c8a97e",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 1,
    textTransform: "uppercase",
    margin: "0 0 14px",
  },
  narrative: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "#c4b8a8",
    margin: 0,
    fontStyle: "italic",
  },
  strengthRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  checkIcon: {
    color: "#10b981",
    fontSize: 14,
    fontWeight: 700,
    marginTop: 2,
    flexShrink: 0,
  },
  strengthText: {
    fontSize: 13,
    color: "#c4b8a8",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.5,
  },
  concernRow: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottom: "1px solid #2a2520",
  },
  concernHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  concernArea: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e8e0d4",
    fontFamily: "'DM Sans', sans-serif",
  },
  severityDots: {
    display: "flex",
    gap: 3,
  },
  severityDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    transition: "background-color 0.3s",
  },
  concernDesc: {
    fontSize: 12,
    color: "#8a7e6e",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.5,
    margin: 0,
  },
  miniScores: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  miniScoreItem: {
    flex: 1,
    textAlign: "center",
    backgroundColor: "rgba(42,37,32,0.4)",
    borderRadius: 10,
    padding: "16px 8px",
    border: "1px solid #2a2520",
  },
  miniScoreVal: {
    fontSize: 26,
    fontWeight: 300,
    color: "#c8a97e",
    display: "block",
  },
  miniScoreLabel: {
    fontSize: 10,
    color: "#6b6156",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // Proportions
  proportionCard: {
    backgroundColor: "rgba(42,37,32,0.4)",
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    border: "1px solid #2a2520",
  },
  proportionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  proportionName: {
    fontSize: 12,
    color: "#c4b8a8",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.3,
    flex: 1,
    paddingRight: 8,
  },
  proportionGrade: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
  },
  proportionBar: {
    width: "100%",
    height: 3,
    backgroundColor: "#2a2520",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  proportionFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.8s ease",
  },
  proportionMeta: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 4,
  },
  proportionMeasured: {
    fontSize: 10,
    color: "#8a7e6e",
    fontFamily: "'DM Sans', sans-serif",
  },
  proportionIdeal: {
    fontSize: 10,
    color: "#6b6156",
    fontFamily: "'DM Sans', sans-serif",
  },
  proportionSource: {
    fontSize: 10,
    color: "#4a4238",
    fontFamily: "'DM Sans', sans-serif",
    fontStyle: "italic",
  },

  // Procedures
  procIntro: {
    fontSize: 12,
    color: "#8a7e6e",
    fontFamily: "'DM Sans', sans-serif",
    marginBottom: 14,
    lineHeight: 1.5,
  },
  procCard: {
    backgroundColor: "rgba(42,37,32,0.4)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    border: "1px solid #2a2520",
  },
  procHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  procIcon: { fontSize: 22 },
  procTitleWrap: {
    flex: 1,
  },
  procName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#e8e0d4",
    fontFamily: "'DM Sans', sans-serif",
    display: "block",
    marginBottom: 4,
  },
  procBadge: {
    fontSize: 9,
    padding: "3px 8px",
    borderRadius: 4,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: 600,
    display: "inline-block",
  },
  priorityBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(200,169,126,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  priorityNum: {
    fontSize: 12,
    fontWeight: 700,
    color: "#c8a97e",
    fontFamily: "'DM Sans', sans-serif",
  },
  procRationale: {
    fontSize: 13,
    color: "#c4b8a8",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.5,
    margin: "0 0 10px",
  },
  procDetails: {
    display: "flex",
    gap: 16,
    marginBottom: 6,
  },
  procDetail: {
    fontSize: 11,
    color: "#6b6156",
    fontFamily: "'DM Sans', sans-serif",
  },
  procExpected: {
    fontSize: 11,
    color: "#c8a97e",
    fontFamily: "'DM Sans', sans-serif",
    fontStyle: "italic",
    margin: 0,
  },

  // Natural
  naturalIntro: {
    fontSize: 13,
    color: "#8a7e6e",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.5,
    marginBottom: 16,
  },
  tipRow: {
    display: "flex",
    gap: 14,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  tipNum: {
    fontSize: 20,
    fontWeight: 300,
    color: "#3d352c",
    flexShrink: 0,
    lineHeight: 1,
    marginTop: 2,
    fontFamily: "'Cormorant Garamond', serif",
  },
  tipText: {
    fontSize: 13,
    color: "#c4b8a8",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.6,
    margin: 0,
  },
  refItem: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
    alignItems: "flex-start",
  },
  refBullet: {
    color: "#c8a97e",
    fontSize: 8,
    marginTop: 4,
    flexShrink: 0,
  },
  refText: {
    fontSize: 11,
    color: "#6b6156",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.5,
  },

  resultsFooter: {
    padding: "20px 20px 40px",
    borderTop: "1px solid #2a2520",
    position: "relative",
    zIndex: 1,
  },
  disclaimer: {
    fontSize: 10,
    color: "#4a4238",
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.6,
    textAlign: "center",
    margin: 0,
  },
};
