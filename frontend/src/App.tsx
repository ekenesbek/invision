import { useState, useEffect, useRef } from "react";
import {
  GraduationCap, AlertTriangle, Users, ShieldCheck, Brain,
  BarChart3, Download, Cpu, Sparkles, X, Plus, Trash2,
  Settings, Eye, Zap, ChevronDown, Check, ArrowLeft,
  Upload, Table, CheckCircle, XCircle, Clock, FileText,
  ChevronRight, UserCheck, UserX, MessageCircle, Send,
  HelpCircle, Lightbulb, Target, RotateCcw, Search, Globe, ExternalLink, Star, LogOut
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
  status: "pending" | "approved" | "rejected";
}
interface DimensionData { name: string; score: number; weight: number; key_signals?: string[]; }
interface AIDetection { is_likely_ai_generated: boolean; confidence: number; indicators: string[]; }
interface MLEssayPrediction { prediction: string; confidence: number; human_prob: number; ai_prob: number; authenticity_score: number; }
interface MLDetection { overall: MLEssayPrediction; per_essay: { motivation: MLEssayPrediction | null; leadership: MLEssayPrediction | null; challenge: MLEssayPrediction | null; }; ml_authenticity_score: number; }
interface ScoringResult {
  candidate_id: string; candidate_name: string; total_score: number; rank: number;
  recommendation: string; recommendation_label: string; dimensions: DimensionData[];
  ai_detection: AIDetection; summary: string; strengths: string[]; areas_for_review: string[];
  scoring_method?: string; baseline_score?: number;
  llm_analysis?: { hidden_strengths?: string[]; concerns?: string[]; interview_questions?: string[]; };
  ml_detection?: MLDetection | null;
}
interface ConfigState { has_api_key: boolean; masked_key: string; model: string; available_models: string[]; llm_active: boolean; }
type Page = "candidates" | "settings" | "profile" | "report" | "apply" | "talents";
interface Talent {
  id: number; source: string; external_id: string; full_name: string;
  country: string; city: string; organization: string;
  achievements: any[]; profile_url: string; ai_profile: any | null;
  status: string; scraped_at: string | null;
}
type Tab = "pending" | "approved" | "rejected";

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
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#eab308" : "#ef4444";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-stone-900 tabular-nums">{Math.round(score)}</span>
        <span className="text-[9px] text-stone-400 uppercase">балл</span>
      </div>
    </div>
  );
}

// ─── Candidate Profile View ────────────────────────────

interface ChatMsg { role: "user" | "assistant"; content: string; }

function ProfileView({ candidate, result, onBack, onScore, onApprove, onReject, scoring, llmActive, hasApiKey }: {
  candidate: Candidate; result?: ScoringResult; onBack: () => void;
  onScore: () => void; onApprove: () => void; onReject: () => void;
  scoring: boolean; llmActive: boolean; hasApiKey: boolean;
}) {
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat history on mount
  useEffect(() => {
    fetch(`${API}/candidates/${candidate.id}/chat`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setChatMessages(data); })
      .catch(() => {});
  }, [candidate.id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const askAI = async (question: string) => {
    if (!question.trim()) return;
    setChatOpen(true);
    setChatMessages(prev => [...prev, { role: "user", content: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/candidates/${candidate.id}/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (data.answer) {
        setChatMessages(prev => [...prev, { role: "assistant", content: data.answer }]);
      } else {
        setChatMessages(prev => [...prev, { role: "assistant", content: data.detail || "Ошибка" }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Ошибка соединения с AI" }]);
    }
    setChatLoading(false);
  };

  const clearChat = async () => {
    await fetch(`${API}/candidates/${candidate.id}/chat`, { method: "DELETE" }).catch(() => {});
    setChatMessages([]);
  };

  // Preset questions based on score
  const hasScore = !!result;
  const isGood = hasScore && result!.total_score >= 55;
  const presetQuestions = hasScore ? (
    isGood ? [
      { icon: <Target className="w-3.5 h-3.5" />, label: "Вопросы для интервью", q: "Предложи 5 вопросов для интервью с этим кандидатом, чтобы глубже раскрыть его потенциал" },
      { icon: <HelpCircle className="w-3.5 h-3.5" />, label: "На что обратить внимание?", q: "Какие потенциальные зоны риска у этого кандидата? На что обратить внимание при собеседовании?" },
    ] : [
      { icon: <HelpCircle className="w-3.5 h-3.5" />, label: "Почему низкий балл?", q: "Объясни, почему у кандидата низкий балл? Какие основные проблемы в его анкете?" },
      { icon: <Target className="w-3.5 h-3.5" />, label: "Вопросы для проверки", q: "Предложи 5 вопросов для интервью, чтобы проверить, заслуживает ли кандидат второго шанса" },
    ]
  ) : [
    { icon: <Lightbulb className="w-3.5 h-3.5" />, label: "Оцени кандидата", q: "Дай краткую оценку этого кандидата на основе его анкеты. Каковы его сильные и слабые стороны?" },
    { icon: <Target className="w-3.5 h-3.5" />, label: "Вопросы для интервью", q: "Предложи 5 вопросов для интервью с этим кандидатом" },
  ];
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-lg font-bold text-stone-900">{candidate.full_name}</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${
          candidate.status === "approved" ? "border-stone-200 bg-stone-50 text-stone-600" :
          candidate.status === "rejected" ? "border-stone-200 bg-stone-50 text-stone-600" :
          "border-stone-200 bg-stone-50 text-stone-500"
        }`}>
          {candidate.status === "approved" ? <><CheckCircle className="w-3 h-3" /> Одобрен</> :
           candidate.status === "rejected" ? <><XCircle className="w-3 h-3" /> Отклонён</> :
           <><Clock className="w-3 h-3" /> На рассмотрении</>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {candidate.status === "pending" && (
            <>
              <button onClick={onReject} className="text-xs px-3 py-1.5 border border-stone-300 text-stone-600 rounded-lg hover:bg-stone-50 flex items-center gap-1.5 font-medium">
                <XCircle className="w-3.5 h-3.5" /> Отклонить
              </button>
              <button onClick={onApprove} className="text-xs px-3 py-1.5 bg-stone-500 text-white rounded-lg hover:bg-stone-800 flex items-center gap-1.5 font-semibold">
                <CheckCircle className="w-3.5 h-3.5" /> Одобрить
              </button>
            </>
          )}
          {candidate.status === "rejected" && (
            <button onClick={onApprove} className="text-xs px-3 py-1.5 bg-stone-500 text-white rounded-lg hover:bg-stone-800 flex items-center gap-1.5 font-semibold">
              <CheckCircle className="w-3.5 h-3.5" /> Одобрить
            </button>
          )}
          {candidate.status === "approved" && (
            <button onClick={onReject} className="text-xs px-3 py-1.5 border border-stone-300 text-stone-600 rounded-lg hover:bg-stone-50 flex items-center gap-1.5 font-medium">
              <XCircle className="w-3.5 h-3.5" /> Отклонить
            </button>
          )}
        </div>
      </div>

      <div className="p-6 max-w-4xl">
        {/* Personal info card */}
        <div className="rounded-lg border border-stone-200 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-stone-700" /> Личные данные
          </h3>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div><span className="text-[10px] text-stone-400 uppercase block">Возраст</span><span className="text-stone-800 font-medium">{candidate.age}</span></div>
            <div><span className="text-[10px] text-stone-400 uppercase block">Город</span><span className="text-stone-800 font-medium">{candidate.city || "—"}</span></div>
            <div><span className="text-[10px] text-stone-400 uppercase block">Школа</span><span className="text-stone-800 font-medium">{candidate.school_name || "—"}</span></div>
            <div><span className="text-[10px] text-stone-400 uppercase block">GPA</span><span className="text-stone-800 font-medium">{candidate.gpa ?? "—"}</span></div>
          </div>

          {candidate.languages.length > 0 && (
            <div className="mt-4"><span className="text-[10px] text-stone-400 uppercase block mb-1">Языки</span>
              <div className="flex flex-wrap gap-1">{candidate.languages.map((l, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-stone-50 text-stone-600 border border-stone-200">{l}</span>)}</div>
            </div>
          )}

          {candidate.skills.length > 0 && (
            <div className="mt-3"><span className="text-[10px] text-stone-400 uppercase block mb-1">Навыки</span>
              <div className="flex flex-wrap gap-1">{candidate.skills.map((s, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{s}</span>)}</div>
            </div>
          )}

          {candidate.activities.length > 0 && (
            <div className="mt-3"><span className="text-[10px] text-stone-400 uppercase block mb-1">Активности</span>
              <div className="space-y-1.5">{candidate.activities.map((a, i) => (
                <div key={i} className="text-xs text-stone-600 flex gap-2 items-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 shrink-0 mt-1" />
                  <div><span className="font-medium text-stone-800">{a.title}</span>{a.role && <span className="text-stone-400"> — {a.role}</span>}{a.impact && <span className="text-stone-600 ml-1">({a.impact})</span>}</div>
                </div>
              ))}</div>
            </div>
          )}
        </div>

        {/* Essays */}
        <div className="rounded-lg border border-stone-200 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-700" /> Эссе и ответы
          </h3>
          <div className="space-y-4">
            {candidate.essay_motivation && (
              <div><span className="text-[10px] text-stone-400 uppercase font-semibold block mb-1">Эссе: Мотивация</span>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line bg-stone-50 rounded-lg p-3 border border-stone-100">{candidate.essay_motivation}</p>
              </div>
            )}
            {candidate.essay_leadership && (
              <div><span className="text-[10px] text-stone-400 uppercase font-semibold block mb-1">Эссе: Лидерство</span>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line bg-stone-50 rounded-lg p-3 border border-stone-100">{candidate.essay_leadership}</p>
              </div>
            )}
            {candidate.essay_challenge && (
              <div><span className="text-[10px] text-stone-400 uppercase font-semibold block mb-1">Эссе: Вызовы</span>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line bg-stone-50 rounded-lg p-3 border border-stone-100">{candidate.essay_challenge}</p>
              </div>
            )}
            {candidate.why_invision && (
              <div><span className="text-[10px] text-stone-400 uppercase font-semibold block mb-1">Почему inVision U?</span>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line bg-stone-50 rounded-lg p-3 border border-stone-100">{candidate.why_invision}</p>
              </div>
            )}
            {candidate.future_goals && (
              <div><span className="text-[10px] text-stone-400 uppercase font-semibold block mb-1">Цели на 5 лет</span>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line bg-stone-50 rounded-lg p-3 border border-stone-100">{candidate.future_goals}</p>
              </div>
            )}
            {candidate.community_contribution && (
              <div><span className="text-[10px] text-stone-400 uppercase font-semibold block mb-1">Вклад в сообщество</span>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line bg-stone-50 rounded-lg p-3 border border-stone-100">{candidate.community_contribution}</p>
              </div>
            )}
            {!candidate.essay_motivation && !candidate.essay_leadership && !candidate.essay_challenge && (
              <p className="text-sm text-stone-400">Нет эссе</p>
            )}
          </div>
        </div>

        {/* Score report section */}
        <div className="rounded-lg border border-stone-200 bg-white p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-stone-700" /> Отчёт оценки
            </h3>
            <button onClick={onScore} disabled={scoring}
              className="text-xs px-4 py-2 bg-stone-900 text-white rounded-lg font-semibold hover:bg-stone-800 disabled:opacity-50 flex items-center gap-1.5">
              {scoring ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
                llmActive ? <><Sparkles className="w-3.5 h-3.5" /> Сгенерировать (AI)</> : <><Cpu className="w-3.5 h-3.5" /> Сгенерировать</>}
            </button>
          </div>

          {!result && !scoring && (
            <div className="text-center py-8 text-stone-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Отчёт ещё не сгенерирован</p>
              <p className="text-xs mt-1">Нажмите кнопку выше для генерации{llmActive ? " с помощью AI" : " (эвристика)"}</p>
            </div>
          )}

          {result && <ReportSection result={result} />}
        </div>

        {/* Ask AI Section */}
        <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-stone-700" /> Ask AI
            </h3>
            <div className="flex items-center gap-2">
              {chatMessages.length > 0 && (
                <button onClick={clearChat} className="text-[10px] text-stone-400 hover:text-stone-500 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Очистить
                </button>
              )}
              <button onClick={() => setChatOpen(!chatOpen)}
                className="text-xs text-stone-600 hover:text-stone-800 font-medium">
                {chatOpen ? "Свернуть" : chatMessages.length > 0 ? `${chatMessages.length} сообщ.` : "Открыть"}
              </button>
            </div>
          </div>

          {/* Preset question buttons */}
          {!hasApiKey ? (
            <p className="text-xs text-stone-400 text-center py-2">Для Ask AI необходим OpenAI API ключ в настройках</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {presetQuestions.map((pq, i) => (
                  <button key={i} onClick={() => askAI(pq.q)} disabled={chatLoading}
                    className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300 flex items-center gap-1.5 transition-colors disabled:opacity-50">
                    {pq.icon} {pq.label}
                  </button>
                ))}
              </div>

              {/* Chat area */}
              {(chatOpen || chatMessages.length > 0) && (
                <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                  {/* Messages */}
                  <div className="max-h-[400px] overflow-y-auto p-3 space-y-3">
                    {chatMessages.length === 0 && !chatLoading && (
                      <p className="text-xs text-stone-400 text-center py-4">Задайте вопрос об этом кандидате</p>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-stone-900 text-white rounded-br-sm"
                            : "bg-stone-100 text-stone-700 rounded-bl-sm"
                        }`}>
                          {msg.role === "assistant" ? (
                            <div className="whitespace-pre-line leading-relaxed">{msg.content}</div>
                          ) : msg.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-stone-100 rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input */}
                  <div className="border-t border-stone-200 p-2 flex gap-2">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(chatInput); } }}
                      placeholder="Спросите AI о кандидате..."
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900" />
                    <button onClick={() => askAI(chatInput)} disabled={chatLoading || !chatInput.trim()}
                      className="px-3 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 flex items-center">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Report Section (scoring results) ──────────────────

function ReportSection({ result }: { result: ScoringResult }) {
  const recColors: Record<string, string> = {
    strong_recommend: "bg-stone-50 text-stone-700 border-stone-200",
    recommend: "bg-stone-50 text-stone-700 border-stone-200",
    review: "bg-stone-50 text-stone-700 border-stone-200",
    not_recommended: "bg-stone-50 text-stone-700 border-stone-200",
  };
  const isLLM = result.scoring_method === "llm";
  const llm = result.llm_analysis;

  return (
    <div>
      {/* Score + Summary */}
      <div className="flex items-start gap-5 mb-5">
        <ScoreCircle score={result.total_score} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${isLLM ? "border-stone-200 bg-stone-50 text-stone-600" : "border-stone-200 bg-stone-50 text-stone-500"}`}>
              {isLLM ? <><Sparkles className="w-3 h-3" /> LLM</> : <><Cpu className="w-3 h-3" /> Эвристика</>}
            </span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${recColors[result.recommendation] || ""}`}>
              {result.recommendation_label}
            </span>
          </div>
          <p className="text-sm text-stone-600 leading-relaxed">{result.summary}</p>
          {result.baseline_score != null && (
            <div className="mt-2 flex items-center gap-4 text-xs">
              <span className="text-stone-400">Baseline: <span className="text-stone-600 font-medium">{result.baseline_score}</span></span>
              <span className="text-stone-400">Score: <span className="text-stone-900 font-medium">{Math.round(result.total_score)}</span></span>
              <span className={result.total_score > result.baseline_score ? "text-stone-600 font-medium" : "text-stone-600 font-medium"}>
                {result.total_score > result.baseline_score ? "+" : ""}{Math.round(result.total_score - result.baseline_score)} vs baseline
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dimensions */}
      <div className="mb-4">
        <h4 className="text-xs font-semibold text-stone-500 uppercase mb-3">Критерии оценки</h4>
        {result.dimensions.map((dim, i) => {
          const pct = Math.round(dim.weight * 100);
          const barColor = dim.score >= 60 ? "bg-green-500" : dim.score >= 35 ? "bg-yellow-400" : "bg-red-500";
          return (
            <div key={i} className="mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-sm text-stone-600">{dim.name} <span className="text-[10px] text-stone-400">{pct}%</span></span>
                <span className="text-sm font-bold text-stone-900">{Math.round(dim.score)}</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${dim.score}%` }} transition={{ duration: 0.5 }} className={`h-full rounded-full ${barColor}`} />
              </div>
              {dim.key_signals && dim.key_signals.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {dim.key_signals.slice(0, 4).map((s, j) => <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">{s}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Detection */}
      <div className="mb-4">
        <h4 className="text-xs font-semibold text-stone-500 uppercase mb-3 flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-stone-700" /> AI-детекция
        </h4>
        {result.ai_detection.is_likely_ai_generated ? (
          <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
            <div className="flex items-center gap-2 text-stone-700 text-sm font-medium mb-1"><AlertTriangle className="w-4 h-4" /> AI обнаружен ({Math.round(result.ai_detection.confidence * 100)}%)</div>
            <ul className="ml-6">{result.ai_detection.indicators.map((ind, i) => <li key={i} className="text-xs text-stone-600/70 list-disc">{ind}</li>)}</ul>
          </div>
        ) : (
          <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 flex items-center gap-2 text-stone-700 text-sm">
            <ShieldCheck className="w-4 h-4" /> AI не обнаружен
          </div>
        )}

        {/* ML Model: Per-Essay Breakdown */}
        {result.ml_detection && result.ml_detection.per_essay && (
          <div className="mt-3 rounded-lg bg-stone-50 border border-stone-200 p-3">
            <div className="text-[11px] text-stone-600 uppercase font-semibold mb-2 flex items-center gap-1.5">
              🤖 InVisionEssayDetector — анализ по эссе
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "motivation" as const, label: "Мотивация" },
                { key: "leadership" as const, label: "Лидерство" },
                { key: "challenge" as const, label: "Вызовы" },
              ]).map(({ key, label }) => {
                const essay = result.ml_detection?.per_essay?.[key];
                if (!essay) return <div key={key} className="text-center p-2 rounded bg-stone-100/50 border border-stone-100"><div className="text-[10px] text-stone-400 mb-1">{label}</div><div className="text-[10px] text-stone-400">—</div></div>;
                const isAI = essay.prediction === "ai_generated";
                return (
                  <div key={key} className={`text-center p-2 rounded border ${isAI ? "bg-red-50/50 border-red-200/60" : "bg-emerald-50/50 border-emerald-200/60"}`}>
                    <div className="text-[10px] text-stone-500 mb-1">{label}</div>
                    <div className={`text-lg font-bold ${isAI ? "text-red-600" : "text-emerald-600"}`}>
                      {Math.round(essay.authenticity_score)}
                    </div>
                    <div className={`text-[10px] ${isAI ? "text-red-500" : "text-emerald-500"}`}>
                      {isAI ? "AI" : "Human"} ({Math.round(essay.confidence * 100)}%)
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-stone-400">Общая аутентичность (ML)</span>
              <span className={`text-xs font-semibold ${(result.ml_detection.ml_authenticity_score ?? 0) > 50 ? "text-emerald-600" : "text-red-600"}`}>
                {Math.round(result.ml_detection.ml_authenticity_score ?? 0)}/100
              </span>
            </div>
          </div>
        )}
      </div>

      {/* LLM Analysis */}
      {llm && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-stone-500 uppercase mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-stone-700" /> LLM-анализ
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {llm.hidden_strengths && llm.hidden_strengths.length > 0 && (
              <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
                <div className="text-[11px] text-stone-600 uppercase font-semibold mb-2">Скрытые сильные стороны</div>
                <ul className="space-y-1">{llm.hidden_strengths.map((s, i) => <li key={i} className="text-xs text-stone-600 flex gap-2"><span className="w-1 h-1 rounded-full bg-stone-400 shrink-0 mt-1.5" />{s}</li>)}</ul>
              </div>
            )}
            {llm.concerns && llm.concerns.length > 0 && (
              <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
                <div className="text-[11px] text-stone-600 uppercase font-semibold mb-2">Опасения</div>
                <ul className="space-y-1">{llm.concerns.map((s, i) => <li key={i} className="text-xs text-stone-600 flex gap-2"><span className="w-1 h-1 rounded-full bg-stone-400 shrink-0 mt-1.5" />{s}</li>)}</ul>
              </div>
            )}
            {llm.interview_questions && llm.interview_questions.length > 0 && (
              <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 md:col-span-2">
                <div className="text-[11px] text-stone-600 uppercase font-semibold mb-2">Вопросы для интервью</div>
                <ul className="space-y-1">{llm.interview_questions.map((q, i) => <li key={i} className="text-xs text-stone-600 flex gap-2"><span className="text-stone-500 shrink-0">{i + 1}.</span>{q}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strengths & Areas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
          <h4 className="text-[11px] font-semibold text-stone-600 uppercase mb-2">Сильные стороны</h4>
          <ul className="space-y-1">{result.strengths.length > 0 ? result.strengths.map((s, i) => <li key={i} className="text-xs text-stone-600 flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-stone-500 shrink-0 mt-1" />{s}</li>) : <li className="text-xs text-stone-400">—</li>}</ul>
        </div>
        <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
          <h4 className="text-[11px] font-semibold text-stone-600 uppercase mb-2">Зоны для рассмотрения</h4>
          <ul className="space-y-1">{result.areas_for_review.length > 0 ? result.areas_for_review.map((a, i) => <li key={i} className="text-xs text-stone-600 flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-stone-500 shrink-0 mt-1" />{a}</li>) : <li className="text-xs text-stone-400">—</li>}</ul>
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
      <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-lg font-bold text-stone-900">Результаты оценки</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${method === "llm" ? "border-stone-200 bg-stone-50 text-stone-600" : "border-stone-200 bg-stone-50 text-stone-500"}`}>
          {method === "llm" ? <><Sparkles className="w-3 h-3" /> LLM</> : <><Cpu className="w-3 h-3" /> Эвристика</>}
        </span>
        <button onClick={() => exportCSV(results)} className="ml-auto text-xs px-3 py-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-md flex items-center gap-1.5 transition-colors">
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>

      <div className="p-6 max-w-5xl">
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-center">
            <div className="text-2xl font-bold text-stone-900 tabular-nums">{results.length}</div><div className="text-[11px] text-stone-400">Всего</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-center">
            <div className="text-2xl font-bold text-stone-600 tabular-nums">{recommended}</div><div className="text-[11px] text-stone-400">Рекомендованы</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-center">
            <div className="text-2xl font-bold text-stone-900 tabular-nums">{avg}</div><div className="text-[11px] text-stone-400">Средний балл</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-center">
            <div className="text-2xl font-bold text-stone-600 tabular-nums">{aiFlag}</div><div className="text-[11px] text-stone-400">AI-флаг</div>
          </div>
        </div>

        <div className="relative w-full overflow-auto rounded-lg border border-stone-200 bg-white overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
          <thead>
          <tr className="border-b border-stone-200 bg-stone-50/80">
            <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-10">#</th>
            <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider">Кандидат</th>
            <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-20">Балл</th>
            <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-24">Метод</th>
            <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider">Рекомендация</th>
            <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-14"></th>
          </tr>
          </thead>
          <tbody>
          {results.map(r => {
            const scoreColor = r.total_score >= 70 ? "text-stone-700 bg-stone-50" : r.total_score >= 45 ? "text-stone-700 bg-stone-50" : "text-stone-700 bg-stone-50";
            return (
              <tr key={r.candidate_id} className="border-b border-stone-100 transition-colors hover:bg-stone-50/50">
                <td className="px-4 py-3 align-middle text-stone-400 font-medium">{r.rank}</td>
                <td className="px-4 py-3 align-middle">
                  <span className="font-medium text-stone-800">{r.candidate_name}</span>
                  {r.ai_detection.is_likely_ai_generated && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-stone-50 text-stone-600 border border-stone-200">AI</span>}
                </td>
                <td className="px-4 py-3 align-middle"><span className={`font-bold text-center rounded py-0.5 tabular-nums px-2 ${scoreColor}`}>{Math.round(r.total_score)}</span></td>
                <td className="px-4 py-3 align-middle text-xs text-stone-500">{r.scoring_method === "llm" ? "LLM" : "Эвристика"}</td>
                <td className="px-4 py-3 align-middle text-xs text-stone-600">{r.recommendation_label}</td>
                <td className="px-4 py-3 align-middle"><button onClick={() => onViewCandidate(r)} className="text-stone-700 hover:text-stone-700"><Eye className="w-4 h-4" /></button></td>
              </tr>
            );
          })}
          </tbody>
          </table>
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
  const inp = "w-full px-3 py-2 rounded-md border border-stone-300 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 bg-white";
  const lbl = "block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1";

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
      status: "pending",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl border border-stone-200 w-[900px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">Добавить кандидата</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-6">
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
                <button onClick={() => setActs(a => [...a, { title: "", role: "", impact: "" }])} className="text-[10px] text-stone-600 hover:underline">+ Добавить</button>
              </div>
              {acts.map((a, i) => (
                <div key={i} className="flex gap-1.5 mb-1.5">
                  <input className={inp + " flex-1"} placeholder="Название" value={a.title} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                  <input className={inp + " w-28"} placeholder="Роль" value={a.role} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
                  <input className={inp + " w-28"} placeholder="Результат" value={a.impact} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, impact: e.target.value } : x))} />
                  {acts.length > 1 && <button onClick={() => setActs(ar => ar.filter((_, j) => j !== i))} className="text-stone-400 hover:text-stone-500 px-1"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div><label className={lbl}>Эссе: Мотивация</label><textarea className={inp + " min-h-[80px] resize-y"} value={form.essay_motivation} onChange={e => set("essay_motivation", e.target.value)} placeholder="Почему вы хотите учиться в inVision U?" /></div>
            <div><label className={lbl}>Эссе: Лидерство</label><textarea className={inp + " min-h-[80px] resize-y"} value={form.essay_leadership} onChange={e => set("essay_leadership", e.target.value)} placeholder="Расскажите о ситуации лидерства..." /></div>
            <div><label className={lbl}>Эссе: Вызовы</label><textarea className={inp + " min-h-[80px] resize-y"} value={form.essay_challenge} onChange={e => set("essay_challenge", e.target.value)} placeholder="Самый сложный вызов..." /></div>
            <div><label className={lbl}>Почему inVision U?</label><textarea className={inp + " min-h-[50px] resize-y"} value={form.why_invision} onChange={e => set("why_invision", e.target.value)} /></div>
            <div><label className={lbl}>Цели на 5 лет</label><textarea className={inp + " min-h-[50px] resize-y"} value={form.future_goals} onChange={e => set("future_goals", e.target.value)} /></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50">Отмена</button>
          <button onClick={submit} disabled={!form.full_name.trim()} className="px-5 py-2 text-sm bg-stone-900 text-white rounded-lg font-semibold hover:bg-stone-800 disabled:opacity-50">Добавить</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Settings Page ──────────────────────────────────────

function SettingsPage({ config, onUpdate, onNavigate }: { config: ConfigState; onUpdate: (c: ConfigState) => void; onNavigate: (p: Page) => void }) {
  const [key, setKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(!config.has_api_key);
  const [model, setModel] = useState(config.model);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const body: any = { model };
    if (key) body.openai_api_key = key;
    const res = await fetch(`${API}/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    onUpdate({ ...data, llm_active: config.llm_active });
    if (key) { setKey(""); setShowKeyInput(false); }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const removeKey = async () => {
    const res = await fetch(`${API}/config/key`, { method: "DELETE" });
    const data = await res.json();
    onUpdate({ ...data, llm_active: false });
    setShowKeyInput(true);
  };

  const MODEL_LABELS: Record<string, string> = {
    "gpt-4.1": "максимум качества",
    "o4-mini": "быстрый, экономный",
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <h2 className="text-lg font-bold text-stone-900 mb-1">Настройки</h2>
      <p className="text-xs text-stone-400 mb-6">Настройте режим оценки, API ключ и модель</p>

      <div className="max-w-lg space-y-6">
        {/* LLM Mode Toggle */}
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-stone-700" /> Режим оценки
          </h3>
          <div className="flex gap-3">
            <button onClick={() => onUpdate({ ...config, llm_active: false })}
              className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors flex items-center gap-2 justify-center ${
                !config.llm_active ? "border-stone-800 bg-stone-900 text-white" : "border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}>
              <Cpu className="w-4 h-4" /> Эвристика
            </button>
            <button onClick={() => {
              if (!config.has_api_key) return;
              onUpdate({ ...config, llm_active: true });
            }}
              className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors flex items-center gap-2 justify-center ${
                config.llm_active ? "border-stone-900 bg-stone-900 text-white" : config.has_api_key ? "border-stone-200 text-stone-600 hover:bg-stone-50" : "border-stone-100 text-stone-300 cursor-not-allowed"
              }`}>
              <Sparkles className="w-4 h-4" /> AI (LLM)
            </button>
          </div>
          {!config.has_api_key && !config.llm_active && (
            <p className="text-[11px] text-stone-600 mt-2">Для AI-режима необходим API ключ — настройте ниже</p>
          )}
        </div>

        {/* API Key */}
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-stone-700" /> OpenAI API Key
          </h3>
          {config.has_api_key && !showKeyInput ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-md border border-stone-200 bg-stone-50 text-sm text-stone-700 font-mono">
                {config.masked_key || "sk-***"}
              </div>
              <button onClick={removeKey}
                className="p-2 rounded-md border border-stone-200 text-stone-400 hover:text-stone-500 hover:border-stone-300 transition-colors"
                title="Удалить ключ">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <input type="password" value={key} onChange={e => setKey(e.target.value)}
              placeholder="sk-proj-..."
              className="w-full px-3 py-2.5 rounded-md border border-stone-300 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 bg-white font-mono" />
          )}
          <div className="mt-2 flex items-center gap-2">
            {config.has_api_key && !showKeyInput ? (
              <span className="text-xs text-stone-600 flex items-center gap-1"><Check className="w-3 h-3" /> Ключ сохранён</span>
            ) : (
              <span className="text-xs text-stone-400">Вставьте ключ для AI-оценки</span>
            )}
          </div>
        </div>

        {/* Model */}
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-stone-700" /> Модель
          </h3>
          <div className="space-y-2">
            {(config.available_models || []).map(m => (
              <label key={m} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${model === m ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:bg-stone-50"}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${model === m ? "border-stone-900" : "border-stone-300"}`}>
                  {model === m && <div className="w-2 h-2 rounded-full bg-stone-900" />}
                </div>
                <span className="text-sm text-stone-800 font-mono">{m}</span>
                {MODEL_LABELS[m] && <span className="text-[10px] text-stone-400 ml-auto">{MODEL_LABELS[m]}</span>}
                <input type="radio" name="model" value={m} checked={model === m} onChange={() => setModel(m)} className="hidden" />
              </label>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-2.5 bg-stone-900 text-white rounded-lg font-semibold hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Сохранено</> : "Сохранить настройки"}
        </button>
      </div>
    </div>
  );
}

// ─── Public Application Form ─────────────────────────────

function ApplicationForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [form, setForm] = useState({
    full_name: "", age: "17", city: "", school_name: "", gpa: "",
    essay_motivation: "", essay_leadership: "", essay_challenge: "",
    why_invision: "", future_goals: "", community_contribution: "",
    languages: "", skills: "", video_transcript: "",
  });
  const [acts, setActs] = useState<{ title: string; role: string; description: string; impact: string }[]>([{ title: "", role: "", description: "", impact: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState(0);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inp = "w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/20 bg-white transition-all";
  const lbl = "block text-xs font-semibold text-stone-600 mb-1.5";
  const txtarea = inp + " min-h-[120px] resize-y";

  const charCount = (text: string, max: number) => (
    <span className={`text-[10px] ${text.length > max ? "text-stone-500" : "text-stone-400"}`}>{text.length}/{max}</span>
  );

  const submit = async () => {
    if (!form.full_name.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`${API}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name,
          age: parseInt(form.age) || 17,
          city: form.city,
          school_name: form.school_name,
          gpa: form.gpa ? parseFloat(form.gpa) : null,
          education_level: "school",
          essay_motivation: form.essay_motivation,
          essay_leadership: form.essay_leadership,
          essay_challenge: form.essay_challenge,
          why_invision: form.why_invision,
          future_goals: form.future_goals,
          community_contribution: form.community_contribution,
          video_transcript: form.video_transcript,
          activities: acts.filter(a => a.title).map(a => ({ title: a.title, description: a.description, role: a.role, year: null, impact: a.impact })),
          languages: form.languages.split(",").map(s => s.trim()).filter(Boolean),
          skills: form.skills.split(",").map(s => s.trim()).filter(Boolean),
          status: "pending",
        }),
      });
      setSubmitted(true);
      onSubmitted();
    } catch { alert("Ошибка отправки"); }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-stone-600" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Заявка отправлена!</h2>
          <p className="text-sm text-stone-500 mb-6">Спасибо за подачу заявки в inVision U. Наша команда рассмотрит вашу анкету и свяжется с вами.</p>
          <button onClick={() => { setSubmitted(false); setStep(0); setForm({ full_name: "", age: "17", city: "", school_name: "", gpa: "", essay_motivation: "", essay_leadership: "", essay_challenge: "", why_invision: "", future_goals: "", community_contribution: "", languages: "", skills: "", video_transcript: "" }); setActs([{ title: "", role: "", description: "", impact: "" }]); }}
            className="px-5 py-2.5 bg-stone-900 text-white rounded-lg font-semibold hover:bg-stone-800 text-sm">
            Подать ещё одну заявку
          </button>
        </motion.div>
      </div>
    );
  }

  const steps = [
    { title: "Личные данные", icon: <Users className="w-4 h-4" /> },
    { title: "Образование и навыки", icon: <GraduationCap className="w-4 h-4" /> },
    { title: "Эссе", icon: <FileText className="w-4 h-4" /> },
    { title: "О вас и inVision", icon: <Target className="w-4 h-4" /> },
  ];

  const canNext = step === 0 ? form.full_name.trim() !== "" : true;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white px-6 py-6">
        <h1 className="text-xl font-bold mb-1">Подача заявки в inVision U</h1>
        <p className="text-sm text-stone-200">Заполните анкету для участия в отборе. Все поля важны для оценки вашей кандидатуры.</p>
      </div>

      {/* Steps indicator */}
      <div className="px-6 py-4 border-b border-stone-200 bg-white">
        <div className="flex items-center gap-1 max-w-3xl">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <button onClick={() => setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  step === i ? "bg-stone-900 text-white" : i < step ? "bg-stone-200 text-stone-700" : "bg-stone-100 text-stone-400"
                }`}>
                {s.icon} <span className="hidden sm:inline">{s.title}</span>
              </button>
              {i < steps.length - 1 && <div className={`flex-1 h-px mx-1 ${i < step ? "bg-stone-400" : "bg-stone-200"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Form content */}
      <div className="px-6 py-6 max-w-3xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

            {/* Step 0: Personal */}
            {step === 0 && (
              <div className="space-y-5">
                <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2"><Users className="w-4 h-4 text-stone-700" /> Личная информация</h3>
                  <div><label className={lbl}>ФИО *</label><input className={inp} value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Айгерим Нурланова" /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={lbl}>Возраст</label><input className={inp} type="number" min="14" max="25" value={form.age} onChange={e => set("age", e.target.value)} /></div>
                    <div><label className={lbl}>Город</label><input className={inp} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Алматы" /></div>
                    <div><label className={lbl}>GPA (0-5)</label><input className={inp} type="number" step="0.1" min="0" max="5" value={form.gpa} onChange={e => set("gpa", e.target.value)} placeholder="4.2" /></div>
                  </div>
                  <div><label className={lbl}>Школа / учебное заведение</label><input className={inp} value={form.school_name} onChange={e => set("school_name", e.target.value)} placeholder="НИШ г. Алматы" /></div>
                </div>
              </div>
            )}

            {/* Step 1: Education & Skills */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-stone-700" /> Языки и навыки</h3>
                  <div><label className={lbl}>Языки (через запятую)</label><input className={inp} value={form.languages} onChange={e => set("languages", e.target.value)} placeholder="Казахский, Русский, English" /></div>
                  <div><label className={lbl}>Навыки (через запятую)</label><input className={inp} value={form.skills} onChange={e => set("skills", e.target.value)} placeholder="Python, Leadership, Public Speaking" /></div>
                </div>
                <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2"><Target className="w-4 h-4 text-stone-700" /> Активности и достижения</h3>
                    {acts.length < 8 && <button onClick={() => setActs(a => [...a, { title: "", role: "", description: "", impact: "" }])} className="text-xs text-stone-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Добавить</button>}
                  </div>
                  <p className="text-[11px] text-stone-400 -mt-2">Укажите кружки, проекты, волонтёрство, олимпиады и другие активности</p>
                  {acts.map((a, i) => (
                    <div key={i} className="border border-stone-100 rounded-lg p-3 space-y-2 bg-stone-50/50">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-stone-400 font-mono">#{i + 1}</span>
                        {acts.length > 1 && <button onClick={() => setActs(ar => ar.filter((_, j) => j !== i))} className="ml-auto text-stone-400 hover:text-stone-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inp} placeholder="Название (напр. Клуб робототехники)" value={a.title} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                        <input className={inp} placeholder="Ваша роль (напр. Основатель)" value={a.role} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
                      </div>
                      <input className={inp} placeholder="Описание деятельности" value={a.description} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                      <input className={inp} placeholder="Результат / достижение (напр. 2-е место на олимпиаде)" value={a.impact} onChange={e => setActs(ar => ar.map((x, j) => j === i ? { ...x, impact: e.target.value } : x))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Essays */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2"><FileText className="w-4 h-4 text-stone-700" /> Эссе</h3>
                  <p className="text-[11px] text-stone-400 -mt-2">Пишите от себя, конкретно и честно. Расскажите реальные истории из вашего опыта.</p>
                  <div>
                    <div className="flex items-center justify-between"><label className={lbl}>Мотивация: Почему вы хотите учиться в inVision U?</label>{charCount(form.essay_motivation, 2000)}</div>
                    <textarea className={txtarea} value={form.essay_motivation} onChange={e => set("essay_motivation", e.target.value)} placeholder="Расскажите, что вас мотивирует, почему именно inVision U, какие цели вы хотите достичь..." />
                  </div>
                  <div>
                    <div className="flex items-center justify-between"><label className={lbl}>Лидерство: Расскажите о ситуации, где вы проявили лидерство</label>{charCount(form.essay_leadership, 2000)}</div>
                    <textarea className={txtarea} value={form.essay_leadership} onChange={e => set("essay_leadership", e.target.value)} placeholder="Опишите конкретную ситуацию: что произошло, что вы сделали, какой был результат..." />
                  </div>
                  <div>
                    <div className="flex items-center justify-between"><label className={lbl}>Вызовы: Самый сложный вызов, который вы преодолели</label>{charCount(form.essay_challenge, 2000)}</div>
                    <textarea className={txtarea} value={form.essay_challenge} onChange={e => set("essay_challenge", e.target.value)} placeholder="С какой трудностью вы столкнулись? Как справились? Чему научились?" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: About & InVision */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-stone-700" /> О вас и inVision U</h3>
                  <div>
                    <div className="flex items-center justify-between"><label className={lbl}>Почему именно inVision U?</label>{charCount(form.why_invision, 1000)}</div>
                    <textarea className={inp + " min-h-[80px] resize-y"} value={form.why_invision} onChange={e => set("why_invision", e.target.value)} placeholder="Что особенного в inVision U для вас?" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between"><label className={lbl}>Ваши цели на ближайшие 5 лет</label>{charCount(form.future_goals, 1000)}</div>
                    <textarea className={inp + " min-h-[80px] resize-y"} value={form.future_goals} onChange={e => set("future_goals", e.target.value)} placeholder="Кем вы видите себя через 5 лет? Какие планы?" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between"><label className={lbl}>Ваш вклад в сообщество inVision U</label>{charCount(form.community_contribution, 1000)}</div>
                    <textarea className={inp + " min-h-[80px] resize-y"} value={form.community_contribution} onChange={e => set("community_contribution", e.target.value)} placeholder="Как вы планируете внести вклад в сообщество студентов?" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between"><label className={lbl}>Видео-транскрипт (необязательно)</label>{charCount(form.video_transcript, 1500)}</div>
                    <textarea className={inp + " min-h-[80px] resize-y"} value={form.video_transcript} onChange={e => set("video_transcript", e.target.value)} placeholder="Если вы записали видео-презентацию, вставьте текст здесь..." />
                  </div>
                </div>

                {/* Summary before submit */}
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-5">
                  <h3 className="text-sm font-semibold text-stone-800 mb-2">Перед отправкой</h3>
                  <ul className="text-xs text-stone-700 space-y-1">
                    <li className="flex items-center gap-2">{form.full_name ? <CheckCircle className="w-3.5 h-3.5 text-stone-600" /> : <XCircle className="w-3.5 h-3.5 text-stone-400" />} ФИО: {form.full_name || "не указано"}</li>
                    <li className="flex items-center gap-2">{form.essay_motivation.length > 50 ? <CheckCircle className="w-3.5 h-3.5 text-stone-600" /> : <XCircle className="w-3.5 h-3.5 text-stone-400" />} Эссе мотивация: {form.essay_motivation.length} символов</li>
                    <li className="flex items-center gap-2">{form.essay_leadership.length > 50 ? <CheckCircle className="w-3.5 h-3.5 text-stone-600" /> : <XCircle className="w-3.5 h-3.5 text-stone-400" />} Эссе лидерство: {form.essay_leadership.length} символов</li>
                    <li className="flex items-center gap-2">{form.essay_challenge.length > 50 ? <CheckCircle className="w-3.5 h-3.5 text-stone-600" /> : <XCircle className="w-3.5 h-3.5 text-stone-400" />} Эссе вызовы: {form.essay_challenge.length} символов</li>
                    <li className="flex items-center gap-2">{acts.filter(a => a.title).length > 0 ? <CheckCircle className="w-3.5 h-3.5 text-stone-600" /> : <XCircle className="w-3.5 h-3.5 text-stone-400" />} Активности: {acts.filter(a => a.title).length}</li>
                  </ul>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2.5 text-sm text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50 flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Назад
            </button>
          ) : <div />}
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
              className="px-5 py-2.5 text-sm bg-stone-900 text-white rounded-lg font-semibold hover:bg-stone-800 disabled:opacity-50 flex items-center gap-1.5">
              Далее <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={submitting || !form.full_name.trim()}
              className="px-6 py-2.5 text-sm bg-stone-900 text-white rounded-lg font-semibold hover:bg-stone-800 disabled:opacity-50 flex items-center gap-2">
              {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
              Отправить заявку
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Talents Page ────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = { imo: "IMO", ioi: "IOI", ipho: "IPhO", icho: "IChO", izho: "IZhO" };
const SOURCE_COLORS: Record<string, string> = { imo: "bg-stone-100 text-stone-700", ioi: "bg-stone-100 text-stone-700", ipho: "bg-stone-100 text-stone-700", icho: "bg-stone-100 text-stone-700", izho: "bg-stone-100 text-stone-700" };
const STATUS_LABELS: Record<string, string> = { discovered: "Найден", contacted: "Связались", applied: "Подал заявку", ignored: "Пропущен" };
const STATUS_COLORS: Record<string, string> = { discovered: "bg-stone-100 text-stone-600", contacted: "bg-stone-100 text-stone-700", applied: "bg-stone-100 text-stone-700", ignored: "bg-stone-100 text-stone-500" };

function TalentsPage() {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [enriching, setEnriching] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [stats, setStats] = useState<any>(null);

  const load = async () => {
    const [talentsRes, statsRes] = await Promise.all([
      fetch(`${API}/talents`).then(r => r.json()).catch(() => ({ talents: [] })),
      fetch(`${API}/talents/stats`).then(r => r.json()).catch(() => null),
    ]);
    setTalents(talentsRes.talents || []);
    setStats(statsRes);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const scrape = async (sources: string[]) => {
    setScraping(true);
    try {
      const res = await fetch(`${API}/talents/scrape`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      const data = await res.json();
      await load();
      const total = data.total_new + data.total_updated;
      alert(`Найдено: ${data.total_new} новых, ${data.total_updated} обновлено`);
    } catch { alert("Ошибка скрапинга"); }
    setScraping(false);
  };

  const enrich = async (talentId: number) => {
    setEnriching(talentId);
    try {
      const res = await fetch(`${API}/talents/${talentId}/enrich`, { method: "POST" });
      const data = await res.json();
      setTalents(ts => ts.map(t => t.id === talentId ? data : t));
    } catch { alert("Ошибка AI"); }
    setEnriching(null);
  };

  const enrichAll = async () => {
    setEnriching(-1);
    try {
      await fetch(`${API}/talents/enrich-all`, { method: "POST" });
      await load();
    } catch { alert("Ошибка AI"); }
    setEnriching(null);
  };

  const updateStatus = async (talentId: number, status: string) => {
    const res = await fetch(`${API}/talents/${talentId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setTalents(ts => ts.map(t => t.id === talentId ? data : t));
  };

  const filtered = sourceFilter === "all" ? talents : talents.filter(t => t.source === sourceFilter);

  const bestAchievement = (t: Talent) => {
    const medals = ["Gold", "Silver", "Bronze"];
    for (const m of medals) {
      const a = t.achievements.find(a => a.result === m);
      if (a) return a;
    }
    return t.achievements[0];
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-3 border-stone-200 border-t-stone-900 rounded-full animate-spin" /></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-stone-200 flex items-center gap-3">
        <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2"><Search className="w-5 h-5 text-stone-700" /> Поиск талантов</h1>
        <span className="text-xs text-stone-400">{talents.length} найдено</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => scrape(["imo", "ioi", "ipho", "icho", "izho"])} disabled={scraping}
            className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-md font-semibold hover:bg-stone-800 disabled:opacity-50 flex items-center gap-1.5">
            {scraping ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Globe className="w-3 h-3" />}
            {scraping ? "Ищем..." : "Найти таланты"}
          </button>
          {talents.some(t => !t.ai_profile) && (
            <button onClick={enrichAll} disabled={enriching !== null}
              className="text-xs px-3 py-1.5 border border-stone-300 text-stone-600 rounded-md font-semibold hover:bg-stone-50 disabled:opacity-50 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> AI профили
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {/* Source filter */}
      <div className="px-6 py-2 border-b border-stone-100 flex gap-1">
        {["all", "imo", "ioi", "ipho", "icho", "izho"].map(s => (
          <button key={s} onClick={() => setSourceFilter(s)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              sourceFilter === s ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
            }`}>
            {s === "all" ? "Все" : SOURCE_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-stone-400">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Нет найденных талантов</p>
            <p className="text-xs mt-1">Нажмите "Найти таланты" для поиска</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filtered.map((t, i) => {
              const best = bestAchievement(t);
              const isExpanded = expanded === t.id;
              return (
                <div key={t.id} className="hover:bg-stone-50/50 transition-colors">
                  <div className="px-6 py-3 flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : t.id)}>
                    <span className="text-[10px] text-stone-400 w-6">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-800 truncate">{t.full_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SOURCE_COLORS[t.source]}`}>
                          {SOURCE_LABELS[t.source]}
                        </span>
                        {t.ai_profile?.estimated_strength === "high" && <Star className="w-3 h-3 text-stone-900 fill-stone-900" />}
                      </div>
                      <div className="text-[11px] text-stone-400 flex items-center gap-2 mt-0.5">
                        {t.city && <span>{t.city}</span>}
                        {t.organization && <span>• {t.organization}</span>}
                        {best && <span className="text-stone-600 font-medium">• {best.competition}: {best.result}{best.score ? ` (${best.score})` : ""}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.ai_profile?.potential_score_estimate && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          t.ai_profile.potential_score_estimate >= 70 ? "bg-stone-100 text-stone-700" :
                          t.ai_profile.potential_score_estimate >= 50 ? "bg-stone-100 text-stone-700" : "bg-stone-100 text-stone-500"
                        }`}>{t.ai_profile.potential_score_estimate}</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden">
                        <div className="px-6 pb-4 pl-12 space-y-3">
                          {/* Achievements */}
                          <div>
                            <h4 className="text-[11px] font-semibold text-stone-500 uppercase mb-1">Достижения</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {t.achievements.map((a, j) => (
                                <span key={j} className={`text-[11px] px-2 py-1 rounded-md border ${
                                  a.result === "Gold" ? "bg-stone-900 border-stone-700 text-white" :
                                  a.result === "Silver" ? "bg-stone-50 border-stone-300 text-stone-700" :
                                  a.result === "Bronze" ? "bg-stone-50 border-stone-300 text-stone-800" :
                                  "bg-stone-50 border-stone-200 text-stone-700"
                                }`}>
                                  {a.competition}: {a.result} {a.score ? `(${a.score})` : ""}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* AI Profile */}
                          {t.ai_profile && !t.ai_profile.error && (
                            <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-3 space-y-2">
                              <h4 className="text-[11px] font-semibold text-stone-700 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Профиль</h4>
                              <p className="text-xs text-stone-700">{t.ai_profile.summary}</p>
                              {t.ai_profile.key_qualities && (
                                <div className="flex flex-wrap gap-1">
                                  {t.ai_profile.key_qualities.map((q: string, j: number) => (
                                    <span key={j} className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-700 rounded-full">{q}</span>
                                  ))}
                                </div>
                              )}
                              {t.ai_profile.recommended_track && (
                                <p className="text-[11px] text-stone-500">Рек. направление: <span className="font-medium text-stone-700">{t.ai_profile.recommended_track}</span></p>
                              )}
                              {t.ai_profile.outreach_suggestion && (
                                <p className="text-[11px] text-stone-500">Как связаться: <span className="text-stone-700">{t.ai_profile.outreach_suggestion}</span></p>
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {t.profile_url && (
                              <a href={t.profile_url} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] px-2.5 py-1 border border-stone-300 rounded-md text-stone-600 hover:bg-stone-50 flex items-center gap-1 no-underline">
                                <ExternalLink className="w-3 h-3" /> Профиль
                              </a>
                            )}
                            {!t.ai_profile && (
                              <button onClick={() => enrich(t.id)} disabled={enriching === t.id}
                                className="text-[11px] px-2.5 py-1 border border-stone-300 rounded-md text-stone-600 hover:bg-stone-50 disabled:opacity-50 flex items-center gap-1">
                                {enriching === t.id ? <div className="w-3 h-3 border-2 border-stone-300 border-t-stone-900 rounded-full animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                AI анализ
                              </button>
                            )}
                            <button onClick={() => updateStatus(t.id, "contacted")}
                              className="text-[11px] px-2.5 py-1 bg-stone-500 text-white rounded-md hover:bg-stone-800 flex items-center gap-1">
                              <MessageCircle className="w-3 h-3" /> Связаться
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────

function LoginPage({ onLogin }: { onLogin: (token: string, email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Ошибка входа");
        return;
      }
      const data = await res.json();
      onLogin(data.token, data.email);
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-['Plus_Jakarta_Sans',sans-serif] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900"><GraduationCap className="h-5 w-5 text-white" /></div>
          <div>
            <div className="text-lg font-bold text-stone-900 leading-tight">inVision U</div>
            <div className="text-xs text-stone-400">AI Screening System</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Почта</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 bg-white"
              placeholder="email@example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 bg-white"
              placeholder="Введите пароль" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-stone-900 text-white rounded-lg font-semibold hover:bg-stone-800 disabled:opacity-50 text-sm transition-colors">
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [authEmail, setAuthEmail] = useState<string | null>(() => localStorage.getItem("auth_email"));
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!authToken) { setAuthChecked(true); return; }
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setAuthEmail(data.email); setAuthChecked(true); })
      .catch(() => { localStorage.removeItem("auth_token"); localStorage.removeItem("auth_email"); setAuthToken(null); setAuthEmail(null); setAuthChecked(true); });
  }, []);

  const handleLogin = (token: string, email: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_email", email);
    setAuthToken(token);
    setAuthEmail(email);
  };

  const handleLogout = () => {
    if (authToken) fetch(`${API}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${authToken}` } }).catch(() => {});
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_email");
    setAuthToken(null);
    setAuthEmail(null);
  };

  if (!authChecked) return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="w-8 h-8 border-3 border-stone-200 border-t-stone-900 rounded-full animate-spin" /></div>;

  if (!authToken && window.location.hash !== "#apply") return <LoginPage onLogin={handleLogin} />;

  return <AuthenticatedApp authEmail={authEmail} onLogout={handleLogout} />;
}

function AuthenticatedApp({ authEmail, onLogout }: { authEmail: string | null; onLogout: () => void }) {
  const [page, setPage] = useState<Page>(() => window.location.hash === "#apply" ? "apply" : "candidates");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [config, setConfig] = useState<ConfigState>({ has_api_key: false, masked_key: "", model: "gpt-4.1", available_models: [], llm_active: false });
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, ScoringResult>>(new Map());
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [batchResults, setBatchResults] = useState<ScoringResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCandidate = (c: any): Candidate => ({
    id: c.id || nextId(), full_name: c.full_name || "", age: c.age || 17, city: c.city || "",
    school_name: c.school_name || "", gpa: c.gpa ?? null, education_level: c.education_level || "school",
    essay_motivation: c.essay_motivation || "", essay_leadership: c.essay_leadership || "", essay_challenge: c.essay_challenge || "",
    activities: (c.activities || []).map((a: any) => ({ title: a.title || "", description: a.description || "", role: a.role || "", year: a.year || null, impact: a.impact || "" })),
    languages: c.languages || [], skills: c.skills || [],
    why_invision: c.why_invision || "", future_goals: c.future_goals || "", community_contribution: c.community_contribution || "",
    status: c.status || "pending",
  });

  const loadData = async () => {
    try {
      const [cfg, data] = await Promise.all([
        fetch(`${API}/config`).then(r => r.json()).catch(() => ({ has_api_key: false, masked_key: "", model: "gpt-4.1", available_models: [] })),
        fetch(`${API}/candidates`).then(r => r.json()).catch(() => null),
      ]);
      setConfig({ ...cfg, llm_active: cfg.has_api_key });

      if (data && data.candidates && data.candidates.length > 0) {
        setCandidates(data.candidates.map(parseCandidate));
        // Load persisted scoring results
        if (data.scoring_results) {
          const sr = new Map<string, ScoringResult>();
          for (const [id, result] of Object.entries(data.scoring_results)) {
            sr.set(id, result as ScoringResult);
          }
          setResults(sr);
        }
      } else {
        // No candidates in DB — seed from demo data
        await fetch(`${API}/candidates/seed`, { method: "POST" });
        const seeded = await fetch(`${API}/candidates`).then(r => r.json()).catch(() => null);
        if (seeded?.candidates) {
          setCandidates(seeded.candidates.map(parseCandidate));
        }
      }
    } catch { /* fallback: empty state */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const addCandidate = async (c: Candidate) => {
    try {
      const res = await fetch(`${API}/candidates`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c),
      });
      const saved = await res.json();
      setCandidates(cs => [...cs, parseCandidate(saved)]);
    } catch { setCandidates(cs => [...cs, c]); }
  };

  const removeCandidate = async (id: string) => {
    setCandidates(cs => cs.filter(c => c.id !== id));
    setResults(rs => { const n = new Map(rs); n.delete(id); return n; });
    fetch(`${API}/candidates/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const updateStatus = async (id: string, status: "pending" | "approved" | "rejected") => {
    setCandidates(cs => cs.map(c => c.id === id ? { ...c, status } : c));
    if (selectedCandidate?.id === id) {
      setSelectedCandidate(prev => prev ? { ...prev, status } : null);
    }
    fetch(`${API}/candidates/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).catch(() => {});
  };

  // Score single candidate (persisted)
  const scoreOne = async (candidateId: string) => {
    if (config.llm_active && !config.has_api_key) { setPage("settings"); return; }
    setScoringId(candidateId);
    try {
      const res = await fetch(`${API}/candidates/${candidateId}/score?use_llm=${config.llm_active}`, { method: "POST" });
      const data = await res.json();
      setResults(rs => new Map(rs).set(candidateId, data));
    } catch (e: any) { alert("Ошибка: " + e.message); }
    setScoringId(null);
  };

  // Score all candidates in current tab (persisted + auto-distribute)
  const scoreAll = async () => {
    const tabCandidates = candidates.filter(c => c.status === activeTab);
    if (!tabCandidates.length) return;
    if (config.llm_active && !config.has_api_key) { setPage("settings"); return; }
    setScoring(true);
    try {
      const res = await fetch(
        `${API}/candidates/score-all?status=${activeTab}&use_llm=${config.llm_active}&auto_distribute=true&generate_report=${config.llm_active}`,
        { method: "POST" },
      );
      const data = await res.json();
      const newResults = new Map(results);
      for (const r of data.results) newResults.set(r.candidate_id, r);
      setResults(newResults);

      // Reload candidates to reflect updated statuses from DB
      const reload = await fetch(`${API}/candidates`).then(r => r.json()).catch(() => null);
      if (reload?.candidates) setCandidates(reload.candidates.map(parseCandidate));

      setBatchResults(data.results);
      setPage("report");
    } catch (e: any) { alert("Ошибка: " + e.message); }
    setScoring(false);
  };

  // Import JSON file (persisted)
  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const arr = Array.isArray(raw) ? raw : [raw];
      const toCreate = arr.map((c: any) => ({
        full_name: c.full_name || "Без имени", age: c.age || 17, city: c.city || "",
        school_name: c.school_name || "", gpa: c.gpa ?? null, education_level: c.education_level || "school",
        essay_motivation: c.essay_motivation || "", essay_leadership: c.essay_leadership || "", essay_challenge: c.essay_challenge || "",
        activities: c.activities || [], languages: c.languages || [], skills: c.skills || [],
        why_invision: c.why_invision || "", future_goals: c.future_goals || "", community_contribution: c.community_contribution || "",
        status: "pending",
      }));
      const res = await fetch(`${API}/candidates/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toCreate),
      });
      const saved = await res.json();
      setCandidates(cs => [...cs, ...saved.map(parseCandidate)]);
    } catch { alert("Ошибка чтения JSON файла"); }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; color: string }[] = [
    { id: "pending", label: "На рассмотрении", icon: <Clock className="w-4 h-4" />, color: "text-stone-900" },
    { id: "approved", label: "Одобренные", icon: <UserCheck className="w-4 h-4" />, color: "text-stone-900" },
    { id: "rejected", label: "Отклонённые", icon: <UserX className="w-4 h-4" />, color: "text-stone-900" },
  ];

  const filteredCandidates = candidates.filter(c => c.status === activeTab);
  const counts = {
    pending: candidates.filter(c => c.status === "pending").length,
    approved: candidates.filter(c => c.status === "approved").length,
    rejected: candidates.filter(c => c.status === "rejected").length,
  };

  const sidebarItems = [
    { id: "candidates" as Page, label: "Кандидаты", icon: <Table className="w-4 h-4" /> },
    { id: "talents" as Page, label: "Таланты", icon: <Search className="w-4 h-4" /> },
  ];
  const settingsItem = { id: "settings" as Page, label: "Настройки", icon: <Settings className="w-4 h-4" /> };

  // ─── Standalone public form ──────────────────────────────
  if (page === "apply") {
    return (
      <div className="min-h-screen bg-stone-50 font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="max-w-4xl mx-auto flex flex-col min-h-screen">
          {/* Public header */}
          <header className="flex items-center gap-3 px-6 py-4 border-b border-stone-200 bg-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900"><GraduationCap className="h-4 w-4 text-white" /></div>
            <div>
              <div className="text-sm font-bold text-stone-800">inVision U</div>
              <div className="text-[10px] text-stone-400">AI Screening System</div>
            </div>
          </header>
          <ApplicationForm onSubmitted={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-[220px] shrink-0 bg-stone-900 flex flex-col">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><GraduationCap className="h-4 w-4 text-stone-900" /></div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">inVision U</div>
              <div className="text-[10px] text-stone-500">AI Screening</div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {sidebarItems.map(item => (
              <button key={item.id} onClick={() => { setPage(item.id); setSelectedCandidate(null); setBatchResults(null); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  page === item.id || (["profile", "report"].includes(page) && item.id === "candidates")
                    ? "bg-white/10 text-white font-semibold" : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
                }`}>
                {item.icon}{item.label}
              </button>
            ))}
          </nav>
          <div className="px-3 pb-2">
            <button onClick={() => { setPage(settingsItem.id); setSelectedCandidate(null); setBatchResults(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                page === settingsItem.id
                  ? "bg-white/10 text-white font-semibold" : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
              }`}>
              {settingsItem.icon}{settingsItem.label}
            </button>
          </div>
          <div className="px-4 py-4 border-t border-stone-800 space-y-3">
            <div className={`text-[10px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 font-medium ${
              config.llm_active ? "bg-white/10 text-stone-300 border border-white/10" : "bg-stone-800 text-stone-500 border border-stone-700"
            }`}>
              {config.llm_active ? <><Sparkles className="w-3 h-3" /> AI: {config.model}</> : <><Cpu className="w-3 h-3" /> Эвристика</>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-stone-400 truncate">{authEmail}</span>
              <button onClick={onLogout} title="Выйти" className="p-1 rounded text-stone-500 hover:text-white hover:bg-white/10 transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden bg-white">
          {/* Profile view */}
          {page === "profile" && selectedCandidate && (
            <ProfileView
              candidate={selectedCandidate}
              result={results.get(selectedCandidate.id)}
              onBack={() => { setSelectedCandidate(null); setPage("candidates"); }}
              onScore={() => scoreOne(selectedCandidate.id)}
              onApprove={() => updateStatus(selectedCandidate.id, "approved")}
              onReject={() => updateStatus(selectedCandidate.id, "rejected")}
              scoring={scoringId === selectedCandidate.id}
              llmActive={config.llm_active}
              hasApiKey={config.has_api_key}
            />
          )}

          {/* Batch results */}
          {page === "report" && batchResults && (
            <BatchResultsView results={batchResults} onBack={() => { setBatchResults(null); setPage("candidates"); }}
              onViewCandidate={(r) => {
                const c = candidates.find(cc => cc.id === r.candidate_id);
                if (c) { setSelectedCandidate(c); setBatchResults(null); setPage("profile"); }
              }} />
          )}

          {/* Settings */}
          {page === "settings" && <SettingsPage config={config} onUpdate={setConfig} onNavigate={setPage} />}

          {/* Talents */}
          {page === "talents" && <TalentsPage />}

          {/* Candidates table */}
          {page === "candidates" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-stone-200 flex items-center gap-3">
                <h1 className="text-lg font-bold text-stone-900">Кандидаты</h1>
                <span className="text-xs text-stone-400">{candidates.length} всего</span>

                <div className="ml-auto flex items-center gap-2">
                  <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) importFile(e.target.files[0]); e.target.value = ""; }} />
                  <button onClick={() => fileRef.current?.click()} className="text-xs px-3 py-1.5 border border-stone-300 rounded-md text-stone-600 hover:bg-stone-50 flex items-center gap-1.5">
                    <Upload className="w-3 h-3" /> Импорт
                  </button>
                  <a href="/#apply" target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 border border-stone-300 text-stone-600 rounded-md hover:bg-stone-50 flex items-center gap-1.5 no-underline">
                    <ExternalLink className="w-3 h-3" /> Форма заявки
                  </a>

                  {filteredCandidates.length > 0 && (
                    <button onClick={scoreAll} disabled={scoring}
                      className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-md font-semibold hover:bg-stone-800 disabled:opacity-50 flex items-center gap-1.5">
                      {scoring ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
                        config.llm_active ? <Sparkles className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                      Оценить всех
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="px-6 pt-3 flex gap-1 border-b border-stone-200">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                      activeTab === tab.id
                        ? `${tab.color} border-current bg-white`
                        : "text-stone-400 border-transparent hover:text-stone-600"
                    }`}>
                    {tab.icon} {tab.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-1 ${
                      activeTab === tab.id ? "bg-current/10" : "bg-stone-100"
                    }`}>{counts[tab.id]}</span>
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {filteredCandidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-stone-400 gap-3">
                    {activeTab === "pending" ? <Clock className="w-12 h-12 opacity-20" /> :
                     activeTab === "approved" ? <UserCheck className="w-12 h-12 opacity-20" /> :
                     <UserX className="w-12 h-12 opacity-20" />}
                    <p className="text-sm font-medium">
                      {activeTab === "pending" ? "Нет кандидатов на рассмотрении" :
                       activeTab === "approved" ? "Нет одобренных кандидатов" :
                       "Нет отклонённых кандидатов"}
                    </p>
                  </div>
                ) : (
                  <div className="relative w-full overflow-auto rounded-lg border border-stone-200 bg-white overflow-x-auto">
                    <table className="w-full caption-bottom text-sm">
                    <thead>
                    <tr className="border-b border-stone-200 bg-stone-50/80">
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-10">#</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider">ФИО</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-14">Возр.</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider">Город</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider">Школа</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-14">GPA</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-14">Акт.</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-20">Оценка</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-medium text-stone-500 uppercase tracking-wider w-24">Действия</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredCandidates.map((c, i) => {
                      const r = results.get(c.id);
                      const isScoring = scoringId === c.id;
                      return (
                        <tr key={c.id} onClick={() => { setSelectedCandidate(c); setPage("profile"); }}
                          className="border-b border-stone-100 transition-colors hover:bg-stone-50/50 cursor-pointer">
                          <td className="px-4 py-3 align-middle text-stone-400 text-xs tabular-nums">{i + 1}</td>
                          <td className="px-4 py-3 align-middle font-medium text-stone-800">{c.full_name}</td>
                          <td className="px-4 py-3 align-middle text-stone-600 tabular-nums">{c.age}</td>
                          <td className="px-4 py-3 align-middle text-stone-600 truncate max-w-[120px]">{c.city || "—"}</td>
                          <td className="px-4 py-3 align-middle text-stone-500 truncate max-w-[150px] text-xs">{c.school_name || "—"}</td>
                          <td className="px-4 py-3 align-middle text-stone-600 tabular-nums">{c.gpa ?? "—"}</td>
                          <td className="px-4 py-3 align-middle text-stone-600 tabular-nums">{c.activities.length}</td>
                          <td className="px-4 py-3 align-middle">
                            {r ? (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded tabular-nums ${r.total_score >= 70 ? "bg-green-50 text-green-700" : r.total_score >= 45 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"}`}>
                                {Math.round(r.total_score)}{r.scoring_method === "llm" ? " AI" : " H"}
                              </span>
                            ) : isScoring ? (
                              <div className="w-4 h-4 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
                            ) : (
                              <span className="text-xs text-stone-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setSelectedCandidate(c); setPage("profile"); }} title="Просмотр"
                                className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-50"><Eye className="w-3.5 h-3.5" /></button>
                              {activeTab === "pending" && (
                                <>
                                  <button onClick={() => updateStatus(c.id, "approved")} title="Одобрить"
                                    className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-50"><CheckCircle className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => updateStatus(c.id, "rejected")} title="Отклонить"
                                    className="p-1 rounded text-stone-300 hover:text-stone-600 hover:bg-stone-50"><XCircle className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                              {activeTab === "approved" && (
                                <button onClick={() => updateStatus(c.id, "rejected")} title="Отклонить"
                                  className="p-1 rounded text-stone-300 hover:text-stone-600 hover:bg-stone-50"><XCircle className="w-3.5 h-3.5" /></button>
                              )}
                              {activeTab === "rejected" && (
                                <button onClick={() => updateStatus(c.id, "approved")} title="Одобрить"
                                  className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-50"><CheckCircle className="w-3.5 h-3.5" /></button>
                              )}
                              <button onClick={() => removeCandidate(c.id)} title="Удалить"
                                className="p-1 rounded text-stone-300 hover:text-stone-500 hover:bg-stone-50"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>


      {/* Scoring overlay */}
      {scoring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            <div className="w-10 h-10 border-3 border-stone-200 border-t-stone-900 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-stone-800">Оцениваем {filteredCandidates.length} кандидатов...</p>
            <p className="text-xs text-stone-400 mt-1">{config.llm_active ? "Используем AI — это может занять время" : "Эвристика — быстрый анализ"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
