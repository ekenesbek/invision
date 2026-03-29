import { useState, useEffect, useRef } from "react";
import {
  GraduationCap, Search, AlertTriangle, Users, TrendingUp,
  ShieldCheck, Brain, BarChart3, Download, Cpu, Sparkles, X,
  UserPlus, Upload, FileJson, Plus, Trash2, ChevronRight,
  Settings, Eye, Zap, Table, ChevronDown, Check, ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const API = "/api";

// ─── Types ──────────────────────────────────────────────

interface Activity { title: string; description: string; role: string; year: number | null; impact: string; }
interface Candidate {
  id: string; full_name: string; age: number; city: string; school_name: string; gpa: number | null;
  education_level: string; essay_motivation: string; essay_leadership: string; essay_challenge: string;
  activities: Activity[]; languages: string[]; skills: string[];
  why_invision: string; future_goals: string; community_contribution: string;
}
interface DimensionData { name: string; score: number; weight: number; key_signals?: string[]; }
interface AIDetection { is_likely_ai_generated: boolean; confidence: number; indicators: string[]; }
interface ScoringResult {
  candidate_id: string; candidate_name: string; total_score: number; rank: number;
  recommendation: string; recommendation_label: string; dimensions: DimensionData[];
  ai_detection: AIDetection; summary: string; strengths: string[]; areas_for_review: string[];
  scoring_method?: string; baseline_score?: number;
  llm_analysis?: { hidden_strengths?: string[]; concerns?: string[]; interview_questions?: string[]; };
}
interface ConfigState { has_api_key: boolean; model: string; available_models: string[]; }
type Page = "candidates" | "settings" | "result";

// ─── Helpers ────────────────────────────────────────────

let _idCounter = 100;
const nextId = () => `C${++_idCounter}`;

function exportCSV(results: ScoringResult[]) {
  const header = "Rank,ID,Name,Score,Recommendation,Method,AI Flagged\n";
  const rows = results.map(r => `${r.rank},"${r.candidate_id}","${r.candidate_name}",${r.total_score},"${r.recommendation_label}","${r.scoring_method}",${r.ai_detection.is_likely_ai_generated}`).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "invision_candidates.csv"; a.click();
}

// ─── Score Circle ───────────────────────────────────────

function ScoreCircle({ score, size = 90 }: { score: number; size?: number }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, o = c - (score / 100) * c;
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900">{Math.round(score)}</span>
        <span className="text-[9px] text-gray-400 uppercase">балл</span>
      </div>
    </div>
  );
}

// ─── Result Detail ──────────────────────────────────────

function ResultView({ result, onBack }: { result: ScoringResult; onBack: () => void }) {
  const recColors: Record<string, string> = {
    strong_recommend: "bg-green-50 text-green-700 border-green-200",
    recommend: "bg-blue-50 text-blue-700 border-blue-200",
    review: "bg-amber-50 text-amber-700 border-amber-200",
    not_recommended: "bg-red-50 text-red-700 border-red-200",
  };
  const isLLM = result.scoring_method === "llm";
  const llm = result.llm_analysis;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-lg font-bold text-gray-900">{result.candidate_name}</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${isLLM ? "border-orange-200 bg-orange-50 text-orange-600" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
          {isLLM ? <><Sparkles className="w-3 h-3" /> LLM</> : <><Cpu className="w-3 h-3" /> Эвристика</>}
        </span>
        <span className={`ml-auto text-xs font-semibold px-3 py-1.5 rounded-full border ${recColors[result.recommendation] || ""}`}>
          {result.recommendation_label}
        </span>
      </div>

      <div className="p-6 max-w-4xl">
        {/* Score + Summary */}
        <div className="flex items-start gap-6 mb-6">
          <ScoreCircle score={result.total_score} />
          <div className="flex-1">
            <p className="text-sm text-gray-600 leading-relaxed">{result.summary}</p>
            {result.baseline_score != null && (
              <div className="mt-2 flex items-center gap-4 text-xs">
                <span className="text-gray-400">Baseline: <span className="text-gray-600 font-medium">{result.baseline_score}</span></span>
                <span className="text-gray-400">AI Score: <span className="text-gray-900 font-medium">{Math.round(result.total_score)}</span></span>
                <span className={result.total_score > result.baseline_score ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                  {result.total_score > result.baseline_score ? "+" : ""}{Math.round(result.total_score - result.baseline_score)} vs baseline
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dimensions */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-orange-500" /> Критерии оценки
          </h3>
          {result.dimensions.map((dim, i) => {
            const pct = Math.round(dim.weight * 100);
            const barColor = dim.score >= 60 ? "bg-gradient-to-r from-green-500 to-green-400" : dim.score >= 35 ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-red-500 to-red-400";
            return (
              <div key={i} className="mb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">{dim.name} <span className="text-[10px] text-gray-400">{pct}%</span></span>
                  <span className="text-sm font-bold text-gray-900">{Math.round(dim.score)}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${dim.score}%` }} transition={{ duration: 0.5 }} className={`h-full rounded-full ${barColor}`} />
                </div>
                {dim.key_signals && dim.key_signals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {dim.key_signals.slice(0, 4).map((s, j) => <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{s}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* AI Detection */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-orange-500" /> AI-детекция
          </h3>
          {result.ai_detection.is_likely_ai_generated ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1"><AlertTriangle className="w-4 h-4" /> AI обнаружен ({Math.round(result.ai_detection.confidence * 100)}%)</div>
              <ul className="ml-6">{result.ai_detection.indicators.map((ind, i) => <li key={i} className="text-xs text-red-600/70 list-disc">{ind}</li>)}</ul>
            </div>
          ) : (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2 text-green-700 text-sm">
              <ShieldCheck className="w-4 h-4" /> AI не обнаружен
            </div>
          )}
        </div>

        {/* LLM Analysis */}
        {llm && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-orange-500" /> LLM-анализ</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {llm.hidden_strengths && llm.hidden_strengths.length > 0 && (
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                  <div className="text-[11px] text-orange-600 uppercase font-semibold mb-2">Скрытые сильные стороны</div>
                  <ul className="space-y-1">{llm.hidden_strengths.map((s, i) => <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="w-1 h-1 rounded-full bg-orange-400 shrink-0 mt-1.5" />{s}</li>)}</ul>
                </div>
              )}
              {llm.interview_questions && llm.interview_questions.length > 0 && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="text-[11px] text-blue-600 uppercase font-semibold mb-2">Вопросы для интервью</div>
                  <ul className="space-y-1">{llm.interview_questions.map((q, i) => <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-blue-500 shrink-0">{i + 1}.</span>{q}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Strengths & Areas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h4 className="text-xs font-semibold text-green-600 uppercase mb-3">Сильные стороны</h4>
            <ul className="space-y-1.5">{result.strengths.length > 0 ? result.strengths.map((s, i) => <li key={i} className="text-sm text-gray-600 flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 mt-1.5" />{s}</li>) : <li className="text-sm text-gray-400">—</li>}</ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h4 className="text-xs font-semibold text-amber-600 uppercase mb-3">Зоны для рассмотрения</h4>
            <ul className="space-y-1.5">{result.areas_for_review.length > 0 ? result.areas_for_review.map((a, i) => <li key={i} className="text-sm text-gray-600 flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />{a}</li>) : <li className="text-sm text-gray-400">—</li>}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Results View ─────────────────────────────────

function BatchResultsView({ results, onBack, onViewCandidate }: { results: ScoringResult[]; onBack: () => void; onViewCandidate: (r: ScoringResult) => void }) {
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.total_score, 0) / results.length) : 0;
  const recommended = results.filter(r => r.recommendation === "strong_recommend" || r.recommendation === "recommend").length;
  const aiFlag = results.filter(r => r.ai_detection.is_likely_ai_generated).length;
  const method = results[0]?.scoring_method || "heuristic";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-lg font-bold text-gray-900">Результаты оценки</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${method === "llm" ? "border-orange-200 bg-orange-50 text-orange-600" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
          {method === "llm" ? <><Sparkles className="w-3 h-3" /> LLM</> : <><Cpu className="w-3 h-3" /> Эвристика</>}
        </span>
        <button onClick={() => exportCSV(results)} className="ml-auto text-xs px-3 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>

      <div className="p-6 max-w-5xl">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{results.length}</div><div className="text-[11px] text-gray-400">Всего</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{recommended}</div><div className="text-[11px] text-gray-400">Рекомендованы</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{avg}</div><div className="text-[11px] text-gray-400">Средний балл</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{aiFlag}</div><div className="text-[11px] text-gray-400">AI-флаг</div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[40px_1fr_80px_100px_140px_60px] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase font-medium">
            <span>#</span><span>Кандидат</span><span>Балл</span><span>Метод</span><span>Рекомендация</span><span></span>
          </div>
          {results.map(r => {
            const scoreColor = r.total_score >= 70 ? "text-green-700 bg-green-50" : r.total_score >= 45 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
            return (
              <div key={r.candidate_id} className="grid grid-cols-[40px_1fr_80px_100px_140px_60px] gap-2 px-4 py-3 border-b border-gray-100 items-center hover:bg-gray-50 text-sm">
                <span className="text-gray-400 font-medium">{r.rank}</span>
                <div>
                  <span className="font-medium text-gray-800">{r.candidate_name}</span>
                  {r.ai_detection.is_likely_ai_generated && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">AI</span>}
                </div>
                <span className={`font-bold text-center rounded py-0.5 ${scoreColor}`}>{Math.round(r.total_score)}</span>
                <span className="text-xs text-gray-500">{r.scoring_method === "llm" ? "LLM" : "Эвристика"}</span>
                <span className="text-xs text-gray-600">{r.recommendation_label}</span>
                <button onClick={() => onViewCandidate(r)} className="text-orange-500 hover:text-orange-700"><Eye className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Add Candidate Modal ────────────────────────────────

function AddCandidateModal({ onAdd, onClose }: { onAdd: (c: Candidate) => void; onClose: () => void }) {
  const [form, setForm] = useState({ full_name: "", age: "17", city: "", school_name: "", gpa: "", essay_motivation: "", essay_leadership: "", essay_challenge: "", why_invision: "", future_goals: "", community_contribution: "", languages: "", skills: "" });
  const [acts, setActs] = useState<{ title: string; role: string; impact: string }[]>([{ title: "", role: "", impact: "" }]);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inp = "w-full px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 bg-white";
  const lbl = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1";

  const submit = () => {
    if (!form.full_name.trim()) return;
    onAdd({
      id: nextId(), full_name: form.full_name, age: parseInt(form.age) || 17, city: form.city,
      school_name: form.school_name, gpa: form.gpa ? parseFloat(form.gpa) : null, education_level: "school",
      essay_motivation: form.essay_motivation, essay_leadership: form.essay_leadership, essay_challenge: form.essay_challenge,
      activities: acts.filter(a => a.title).map(a => ({ title: a.title, description: "", role: a.role, year: null, impact: a.impact })),
      languages: form.languages.split(",").map(s => s.trim()).filter(Boolean),
      skills: form.skills.split(",").map(s => s.trim()).filter(Boolean),
      why_invision: form.why_invision, future_goals: form.future_goals, community_contribution: form.community_contribution,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-[900px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Добавить кандидата</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-6">
          {/* Left */}
          <div className="space-y-4">
            <div><label className={lbl}>ФИО *</label><input className={inp} value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Айгерим Нурланова" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className={lbl}>Возраст</label><input className={inp} type="number" value={form.age} onChange={e => set("age", e.target.value)} /></div>
              <div><label className={lbl}>Город</label><input className={inp} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Алматы" /></div>
              <div><label className={lbl}>GPA</label><input className={inp} type="number" step="0.1" min="0" max="5" value={form.gpa} onChange={e => set("gpa", e.target.value)} /></div>
            </div>
            <div><label className={lbl}>Школа</label><input className={inp} value={form.school_name} onChange={e => set("school_name", e.target.value)} /></div>
            <div><label className={lbl}>Языки</label><input className={inp} value={form.languages} onChange={e => set("languages", e.target.value)} placeholder="Казахский, Русский, English" /></div>
            <div><label className={lbl}>Навыки</label><input className={inp} value={form.skills} onChange={e => set("skills", e.target.value)} placeholder="Python, Leadership" /></div>
            <div>
              <div className="flex items-center justify-between mb-1"><label className={lbl + " !mb-0"}>Активности</label>
                <button onClick={() => setActs(a => [...a, { title: "", role: "", impact: "" }])} className="text-[10px] text-orange-600 hover:underline">+ Добавить</button>
              </div>
              {acts.map((a, i) => (
                <div key={i} className="flex gap-1.5 mb-1.5">
                  <input className={inp + " flex-1"} placeholder="Название" value={a.title} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                  <input className={inp + " w-28"} placeholder="Роль" value={a.role} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
                  <input className={inp + " w-28"} placeholder="Результат" value={a.impact} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, impact: e.target.value } : x))} />
                  {acts.length > 1 && <button onClick={() => setActs(ar => ar.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 px-1"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
          </div>
          {/* Right — essays */}
          <div className="space-y-4">
            <div><label className={lbl}>Эссе: Мотивация</label><textarea className={inp + " min-h-[80px] resize-y"} value={form.essay_motivation} onChange={e => set("essay_motivation", e.target.value)} placeholder="Почему вы хотите учиться в inVision U?" /></div>
            <div><label className={lbl}>Эссе: Лидерство</label><textarea className={inp + " min-h-[80px] resize-y"} value={form.essay_leadership} onChange={e => set("essay_leadership", e.target.value)} placeholder="Расскажите о ситуации лидерства..." /></div>
            <div><label className={lbl}>Эссе: Вызовы</label><textarea className={inp + " min-h-[80px] resize-y"} value={form.essay_challenge} onChange={e => set("essay_challenge", e.target.value)} placeholder="Самый сложный вызов..." /></div>
            <div><label className={lbl}>Почему inVision U?</label><textarea className={inp + " min-h-[50px] resize-y"} value={form.why_invision} onChange={e => set("why_invision", e.target.value)} /></div>
            <div><label className={lbl}>Цели на 5 лет</label><textarea className={inp + " min-h-[50px] resize-y"} value={form.future_goals} onChange={e => set("future_goals", e.target.value)} /></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Отмена</button>
          <button onClick={submit} disabled={!form.full_name.trim()} className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50">Добавить</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Settings Page ──────────────────────────────────────

function SettingsPage({ config, onUpdate }: { config: ConfigState; onUpdate: (c: ConfigState) => void }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(config.model);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const body: any = { model };
    if (key) body.openai_api_key = key;
    const res = await fetch(`${API}/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    onUpdate(data);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Настройки</h2>
      <p className="text-xs text-gray-400 mb-6">Настройте API ключ и модель для AI-оценки кандидатов</p>

      <div className="max-w-lg space-y-6">
        {/* API Key */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-500" /> OpenAI API Key
          </h3>
          <input type="password" value={key} onChange={e => setKey(e.target.value)}
            placeholder={config.has_api_key ? "••••••••••••••••••• (уже задан)" : "sk-proj-..."}
            className="w-full px-3 py-2.5 rounded-md border border-gray-300 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 bg-white font-mono" />
          <div className="mt-2 flex items-center gap-2">
            {config.has_api_key ? (
              <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Ключ задан</span>
            ) : (
              <span className="text-xs text-gray-400">Вставьте ключ для AI-оценки</span>
            )}
          </div>
        </div>

        {/* Model */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-orange-500" /> Модель
          </h3>
          <div className="space-y-2">
            {(config.available_models || []).map(m => (
              <label key={m} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${model === m ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${model === m ? "border-orange-500" : "border-gray-300"}`}>
                  {model === m && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                </div>
                <span className="text-sm text-gray-800 font-mono">{m}</span>
                {m === "gpt-4o-mini" && <span className="text-[10px] text-gray-400 ml-auto">быстрый, дешёвый</span>}
                {m === "gpt-4o" && <span className="text-[10px] text-gray-400 ml-auto">мощный</span>}
                {m === "gpt-4.1-mini" && <span className="text-[10px] text-gray-400 ml-auto">новый, быстрый</span>}
                {m === "gpt-4.1-nano" && <span className="text-[10px] text-gray-400 ml-auto">сверхбыстрый</span>}
                {m === "gpt-4.1" && <span className="text-[10px] text-gray-400 ml-auto">максимум качества</span>}
                <input type="radio" name="model" value={m} checked={model === m} onChange={() => setModel(m)} className="hidden" />
              </label>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Сохранено</> : "Сохранить настройки"}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>("candidates");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [config, setConfig] = useState<ConfigState>({ has_api_key: false, model: "gpt-4o-mini", available_models: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, ScoringResult>>(new Map());
  const [viewResult, setViewResult] = useState<ScoringResult | null>(null);
  const [batchResults, setBatchResults] = useState<ScoringResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load demo candidates + config
  useEffect(() => {
    Promise.all([
      fetch(`${API}/config`).then(r => r.json()).catch(() => ({ has_api_key: false, model: "gpt-4o-mini", available_models: [] })),
      fetch(`${API}/demo/raw`).then(r => r.json()).catch(() => []),
    ]).then(([cfg, raw]) => {
      setConfig(cfg);
      if (Array.isArray(raw) && raw.length > 0) {
        setCandidates(raw.map((c: any) => ({
          id: c.id || nextId(), full_name: c.full_name || "", age: c.age || 17, city: c.city || "",
          school_name: c.school_name || "", gpa: c.gpa ?? null, education_level: c.education_level || "school",
          essay_motivation: c.essay_motivation || "", essay_leadership: c.essay_leadership || "", essay_challenge: c.essay_challenge || "",
          activities: (c.activities || []).map((a: any) => ({ title: a.title || "", description: a.description || "", role: a.role || "", year: a.year || null, impact: a.impact || "" })),
          languages: c.languages || [], skills: c.skills || [],
          why_invision: c.why_invision || "", future_goals: c.future_goals || "", community_contribution: c.community_contribution || "",
        })));
      }
      setLoading(false);
    });
  }, []);

  const addCandidate = (c: Candidate) => setCandidates(cs => [...cs, c]);
  const removeCandidate = (id: string) => {
    setCandidates(cs => cs.filter(c => c.id !== id));
    setResults(rs => { const n = new Map(rs); n.delete(id); return n; });
  };

  // Score single candidate
  const scoreOne = async (c: Candidate, withAI: boolean) => {
    if (withAI && !config.has_api_key) { setPage("settings"); return; }
    setScoringId(c.id);
    try {
      const endpoint = withAI ? `${API}/score` : `${API}/score`;
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
      const data = await res.json();
      setResults(rs => new Map(rs).set(c.id, data));
      setViewResult(data);
      setPage("result");
    } catch (e: any) { alert("Ошибка: " + e.message); }
    setScoringId(null);
  };

  // Score all candidates
  const scoreAll = async (withAI: boolean) => {
    if (withAI && !config.has_api_key) { setPage("settings"); return; }
    if (!candidates.length) return;
    setScoring(true);
    try {
      const res = await fetch(`${API}/score/batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates }),
      });
      const data = await res.json();
      const newResults = new Map(results);
      for (const r of data.results) newResults.set(r.candidate_id, r);
      setResults(newResults);
      setBatchResults(data.results);
      setPage("result");
    } catch (e: any) { alert("Ошибка: " + e.message); }
    setScoring(false);
  };

  // Import JSON file
  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const arr = Array.isArray(raw) ? raw : [raw];
      const newCandidates = arr.map((c: any) => ({
        id: c.id || nextId(), full_name: c.full_name || "Без имени", age: c.age || 17, city: c.city || "",
        school_name: c.school_name || "", gpa: c.gpa ?? null, education_level: c.education_level || "school",
        essay_motivation: c.essay_motivation || "", essay_leadership: c.essay_leadership || "", essay_challenge: c.essay_challenge || "",
        activities: (c.activities || []).map((a: any) => ({ title: a.title || "", description: a.description || "", role: a.role || "", year: a.year || null, impact: a.impact || "" })),
        languages: c.languages || [], skills: c.skills || [],
        why_invision: c.why_invision || "", future_goals: c.future_goals || "", community_contribution: c.community_contribution || "",
      }));
      setCandidates(cs => [...cs, ...newCandidates]);
    } catch { alert("Ошибка чтения JSON файла"); }
  };

  const sidebarItems = [
    { id: "candidates" as Page, label: "Кандидаты", icon: <Table className="w-4 h-4" /> },
    { id: "settings" as Page, label: "Настройки", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="relative min-h-screen bg-blue-50 overflow-hidden font-sans">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-blue-700 opacity-50" />
        <div className="absolute bottom-0 right-0 w-3/4 h-3/4 bg-blue-600 transform origin-bottom-right rotate-12 translate-y-1/3 -translate-x-1/4 opacity-90" />
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-blue-700 opacity-80" />
        <div className="absolute top-0 left-0 w-1/2 h-full bg-blue-400 transform -skew-y-6 origin-top-left -translate-y-1/4 opacity-30" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-[200px] shrink-0 bg-white/95 backdrop-blur-sm shadow-lg flex flex-col">
          <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-orange-500"><GraduationCap className="h-3.5 w-3.5 text-white" /></div>
            <div className="text-sm font-bold text-gray-800 leading-tight">inVision U</div>
          </div>
          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {sidebarItems.map(item => (
              <button key={item.id} onClick={() => { setPage(item.id); setViewResult(null); setBatchResults(null); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${page === item.id || (page === "result" && item.id === "candidates") ? "bg-orange-50 text-orange-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
                {item.icon}{item.label}
              </button>
            ))}
          </nav>
          <div className="px-3 py-3 border-t border-gray-100">
            <div className={`text-[10px] px-2 py-1.5 rounded-md flex items-center gap-1.5 font-medium ${config.has_api_key ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-500 border border-gray-200"}`}>
              {config.has_api_key ? <><Sparkles className="w-3 h-3" /> {config.model}</> : <><Cpu className="w-3 h-3" /> Без AI</>}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden bg-white/60 backdrop-blur-sm">
          {/* Viewing a single result */}
          {page === "result" && viewResult && !batchResults && (
            <ResultView result={viewResult} onBack={() => { setViewResult(null); setPage("candidates"); }} />
          )}

          {/* Viewing batch results */}
          {page === "result" && batchResults && !viewResult && (
            <BatchResultsView results={batchResults} onBack={() => { setBatchResults(null); setPage("candidates"); }}
              onViewCandidate={(r) => { setBatchResults(null); setViewResult(r); }} />
          )}

          {/* Viewing single from batch */}
          {page === "result" && viewResult && batchResults && (
            <ResultView result={viewResult} onBack={() => { setViewResult(null); }} />
          )}

          {/* Settings */}
          {page === "settings" && <SettingsPage config={config} onUpdate={setConfig} />}

          {/* Candidates table */}
          {page === "candidates" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                <h1 className="text-lg font-bold text-gray-900">Анкеты кандидатов</h1>
                <span className="text-xs text-gray-400">{candidates.length} {candidates.length === 1 ? "кандидат" : "кандидатов"}</span>

                <div className="ml-auto flex items-center gap-2">
                  <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) importFile(e.target.files[0]); e.target.value = ""; }} />
                  <button onClick={() => fileRef.current?.click()} className="text-xs px-3 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
                    <Upload className="w-3 h-3" /> Импорт JSON
                  </button>
                  <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-md font-semibold hover:bg-orange-600 flex items-center gap-1.5">
                    <Plus className="w-3 h-3" /> Добавить
                  </button>

                  {/* Score all dropdown */}
                  {candidates.length > 0 && (
                    <div className="relative group">
                      <button disabled={scoring} className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-md font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5">
                        {scoring ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3 h-3" />}
                        Оценить всех <ChevronDown className="w-3 h-3" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 w-48">
                        <button onClick={() => scoreAll(false)} className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-gray-400" /> Без AI (эвристика)
                        </button>
                        <button onClick={() => scoreAll(true)} className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg flex items-center gap-2 border-t border-gray-100">
                          <Sparkles className="w-4 h-4 text-orange-500" /> С AI ({config.model})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {candidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                    <Users className="w-16 h-16 opacity-20" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Нет кандидатов</p>
                      <p className="text-xs mt-1">Добавьте кандидата или импортируйте JSON файл</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => fileRef.current?.click()} className="text-xs px-3 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"><Upload className="w-3 h-3" /> Импорт</button>
                      <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-md font-semibold hover:bg-orange-600 flex items-center gap-1.5"><Plus className="w-3 h-3" /> Добавить</button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    <div className="grid grid-cols-[40px_1.5fr_50px_0.8fr_0.8fr_60px_60px_100px_120px_40px] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase font-medium">
                      <span>#</span><span>ФИО</span><span>Возр.</span><span>Город</span><span>Школа</span><span>GPA</span><span>Акт.</span><span>Оценка</span><span>Действия</span><span></span>
                    </div>
                    {candidates.map((c, i) => {
                      const r = results.get(c.id);
                      const isScoring = scoringId === c.id;
                      return (
                        <div key={c.id} className="grid grid-cols-[40px_1.5fr_50px_0.8fr_0.8fr_60px_60px_100px_120px_40px] gap-2 px-4 py-3 border-b border-gray-100 items-center hover:bg-gray-50 text-sm">
                          <span className="text-gray-400 text-xs">{i + 1}</span>
                          <span className="font-medium text-gray-800 truncate">{c.full_name}</span>
                          <span className="text-gray-600">{c.age}</span>
                          <span className="text-gray-600 truncate">{c.city || "—"}</span>
                          <span className="text-gray-500 truncate text-xs">{c.school_name || "—"}</span>
                          <span className="text-gray-600">{c.gpa ?? "—"}</span>
                          <span className="text-gray-600">{c.activities.length}</span>
                          <span>
                            {r ? (
                              <button onClick={() => { setViewResult(r); setPage("result"); }}
                                className={`text-xs font-bold px-2 py-0.5 rounded cursor-pointer ${r.total_score >= 70 ? "bg-green-50 text-green-700" : r.total_score >= 45 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                                {Math.round(r.total_score)} /{r.scoring_method === "llm" ? " AI" : " H"}
                              </button>
                            ) : isScoring ? (
                              <div className="w-4 h-4 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => scoreOne(c, false)} disabled={isScoring} title="Оценить (эвристика)"
                              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"><Cpu className="w-3.5 h-3.5" /></button>
                            <button onClick={() => scoreOne(c, true)} disabled={isScoring} title={`Оценить AI (${config.model})`}
                              className="p-1 rounded text-orange-400 hover:text-orange-700 hover:bg-orange-50 disabled:opacity-30"><Sparkles className="w-3.5 h-3.5" /></button>
                          </div>
                          <button onClick={() => removeCandidate(c.id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && <AddCandidateModal onAdd={addCandidate} onClose={() => setShowAdd(false)} />}
      </AnimatePresence>

      {/* Scoring overlay */}
      {scoring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-gray-800">Оцениваем {candidates.length} кандидатов...</p>
            <p className="text-xs text-gray-400 mt-1">Это может занять некоторое время</p>
          </div>
        </div>
      )}
    </div>
  );
}
