import { useState, useEffect } from "react";
import { GraduationCap, Search, AlertTriangle, Users, TrendingUp, ShieldCheck, ChevronDown, Brain, BarChart3 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const API_BASE = "/api";

interface DimensionData {
  name: string;
  score: number;
  weight: number;
  key_signals?: string[];
}

interface AIDetection {
  is_likely_ai_generated: boolean;
  confidence: number;
  indicators: string[];
}

interface ScoringResult {
  candidate_id: string;
  candidate_name: string;
  total_score: number;
  rank: number;
  recommendation: string;
  recommendation_label: string;
  dimensions: DimensionData[];
  ai_detection: AIDetection;
  summary: string;
  strengths: string[];
  areas_for_review: string[];
}

interface BatchData {
  results: ScoringResult[];
  total_candidates: number;
  shortlisted: number;
  statistics: {
    average_score: number;
    score_distribution: Record<string, number>;
    ai_flagged_count: number;
  };
}

function ScoreCircle({ score }: { score: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#34d399" : score >= 45 ? "#fbbf24" : "#f87171";

  return (
    <div className="relative w-[110px] h-[110px] shrink-0">
      <svg width="110" height="110" className="-rotate-90">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="55" cy="55" r={radius} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{Math.round(score)}</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-400">из 100</span>
      </div>
    </div>
  );
}

function DimensionBar({ dimension }: { dimension: DimensionData }) {
  const pct = Math.round(dimension.weight * 100);
  const barColor =
    dimension.score >= 60
      ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
      : dimension.score >= 35
        ? "bg-gradient-to-r from-amber-500 to-amber-400"
        : "bg-gradient-to-r from-red-500 to-red-400";

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-300 font-medium">
          {dimension.name}
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{pct}%</span>
        </span>
        <span className="text-sm font-bold text-white">{Math.round(dimension.score)}<span className="text-gray-500 font-normal">/100</span></span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${dimension.score}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>
      {dimension.key_signals && dimension.key_signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {dimension.key_signals.slice(0, 4).map((s, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateDetail({ result }: { result: ScoringResult | null }) {
  if (!result) {
    return (
      <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col items-center justify-center text-gray-500 gap-3 p-10">
        <Search className="w-12 h-12 opacity-20" />
        <span className="text-sm">Выберите кандидата из списка</span>
      </div>
    );
  }

  const recColors: Record<string, string> = {
    strong_recommend: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    recommend: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    review: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    not_recommended: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <motion.div
      key={result.candidate_id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-y-auto max-h-[calc(100vh-180px)]"
    >
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{result.candidate_name}</h2>
          <p className="text-xs text-gray-500 mt-1">Ранг #{result.rank} &middot; ID: {result.candidate_id}</p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${recColors[result.recommendation] || ""}`}>
          {result.recommendation_label}
        </span>
      </div>

      {/* Score + Summary */}
      <div className="p-6 flex items-center gap-6 border-b border-white/5">
        <ScoreCircle score={result.total_score} />
        <p className="text-sm text-gray-300 leading-relaxed">{result.summary}</p>
      </div>

      {/* Dimensions */}
      <div className="p-6 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          Детализация по критериям
        </h3>
        {result.dimensions.map((dim, i) => (
          <DimensionBar key={i} dimension={dim} />
        ))}
      </div>

      {/* AI Detection */}
      <div className="p-6 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-400" />
          Детекция AI-генерации
        </h3>
        {result.ai_detection.is_likely_ai_generated ? (
          <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-4">
            <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
              <AlertTriangle className="w-4 h-4" />
              Обнаружены признаки AI ({Math.round(result.ai_detection.confidence * 100)}%)
            </div>
            <ul className="space-y-1 ml-6">
              {result.ai_detection.indicators.map((ind, i) => (
                <li key={i} className="text-xs text-red-300/70 list-disc">{ind}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <ShieldCheck className="w-4 h-4" />
              Признаков AI-генерации не обнаружено
            </div>
          </div>
        )}
      </div>

      {/* Strengths & Areas */}
      <div className="p-6 grid grid-cols-2 gap-6">
        <div>
          <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">Сильные стороны</h4>
          <ul className="space-y-2">
            {result.strengths.length > 0 ? result.strengths.map((s, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                {s}
              </li>
            )) : (
              <li className="text-sm text-gray-600">Не выявлены</li>
            )}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">Зоны для рассмотрения</h4>
          <ul className="space-y-2">
            {result.areas_for_review.length > 0 ? result.areas_for_review.map((a, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                {a}
              </li>
            )) : (
              <li className="text-sm text-gray-600">Не выявлены</li>
            )}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [data, setData] = useState<BatchData | null>(null);
  const [selected, setSelected] = useState<ScoringResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/demo/candidates`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d: BatchData) => {
        setData(d);
        if (d.results?.length > 0) setSelected(d.results[0]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const stats = data?.statistics || { average_score: 0, score_distribution: {}, ai_flagged_count: 0 };
  const dist = stats.score_distribution || {};

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      {/* Background gradients */}
      <div className="fixed inset-0 z-0">
        <div className="absolute -right-60 -top-20">
          <div className="h-[10rem] rounded-full w-[60rem] bg-gradient-to-b blur-[8rem] from-indigo-600/40 to-violet-600/40" />
          <div className="h-[10rem] rounded-full w-[90rem] bg-gradient-to-b blur-[8rem] from-violet-900/30 to-cyan-400/20" />
          <div className="h-[10rem] rounded-full w-[60rem] bg-gradient-to-b blur-[8rem] from-cyan-600/30 to-indigo-500/30" />
        </div>
        <div className="absolute inset-0 bg-noise opacity-20" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">inVision U — AI Screening</h1>
              <p className="text-[11px] text-gray-500">Интеллектуальная система поддержки отбора кандидатов</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-400 font-medium">
              Human-in-the-Loop
            </span>
          </div>
        </header>

        {/* HITL Banner */}
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl border border-blue-500/10 bg-blue-500/5 flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs text-blue-300/80">
            Данная система является <strong className="text-blue-300">инструментом поддержки</strong> приёмной комиссии.
            Все оценки носят рекомендательный характер. Финальное решение принимает комиссия.
          </span>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-white/10 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Загрузка данных...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-red-400">Ошибка загрузки: {error}. Убедитесь, что backend запущен на порту 8000.</span>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 px-6 py-5">
              <StatCard label="Всего кандидатов" value={data?.total_candidates || 0} color="text-indigo-400" icon={<Users className="w-4 h-4" />} />
              <StatCard label="Рекомендованы" value={data?.shortlisted || 0} color="text-emerald-400" icon={<TrendingUp className="w-4 h-4" />} />
              <StatCard label="Средний балл" value={stats.average_score || 0} color="text-white" icon={<BarChart3 className="w-4 h-4" />} />
              <StatCard label="AI-флаг" value={stats.ai_flagged_count || 0} color="text-amber-400" icon={<AlertTriangle className="w-4 h-4" />} />
              <StatCard label="Требуют рассмотрения" value={(dist.review || 0) + (dist.not_recommended || 0)} color="text-gray-300" icon={<Search className="w-4 h-4" />} />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex gap-5 px-6 pb-6 min-h-0">
              {/* Candidate List */}
              <div className="w-[360px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Рейтинг кандидатов</span>
                  <span className="text-[11px] text-gray-500">{data?.total_candidates || 0} чел.</span>
                </div>
                <div className="overflow-y-auto flex-1">
                  {(data?.results || []).map((r) => {
                    const isActive = selected?.candidate_id === r.candidate_id;
                    const scoreColor = r.total_score >= 65 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : r.total_score >= 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20";
                    const rankColor = r.rank <= 2 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : r.rank <= 4 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        : "bg-white/5 text-gray-500 border-white/5";

                    return (
                      <div
                        key={r.candidate_id}
                        onClick={() => setSelected(r)}
                        className={`flex items-center gap-3 px-5 py-4 cursor-pointer border-b border-white/5 transition-colors
                          ${isActive ? "bg-indigo-500/10 border-l-2 border-l-indigo-500" : "hover:bg-white/[0.03]"}`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${rankColor}`}>
                          {r.rank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{r.candidate_name}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{r.recommendation_label}</div>
                        </div>
                        <span className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${scoreColor}`}>
                          {Math.round(r.total_score)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detail Panel */}
              <CandidateDetail result={selected} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-500">{icon}</span>
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
}
