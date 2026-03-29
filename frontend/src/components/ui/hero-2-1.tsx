"use client";

import { useState } from "react";
import { ArrowRight, Menu, X, GraduationCap, Users, Brain, Shield } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const Hero2 = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* Gradient background — inVision U brand: indigo + violet + cyan */}
      <div className="flex flex-col items-end absolute -right-60 -top-10 blur-xl z-0">
        <div className="h-[10rem] rounded-full w-[60rem] z-1 bg-gradient-to-b blur-[6rem] from-indigo-600 to-violet-600"></div>
        <div className="h-[10rem] rounded-full w-[90rem] z-1 bg-gradient-to-b blur-[6rem] from-violet-900 to-cyan-400"></div>
        <div className="h-[10rem] rounded-full w-[60rem] z-1 bg-gradient-to-b blur-[6rem] from-cyan-600 to-indigo-500"></div>
      </div>
      <div className="absolute inset-0 z-0 bg-noise opacity-30"></div>

      {/* Content container */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="container mx-auto flex items-center justify-between px-4 py-4 mt-6">
          <div className="flex items-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="ml-3 text-xl font-bold text-white tracking-tight">
              inVision U
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <div className="flex items-center space-x-6">
              <NavItem label="О программе" hasDropdown />
              <NavItem label="Отбор" hasDropdown />
              <NavItem label="FAQ" />
            </div>
            <div className="flex items-center space-x-3">
              <button className="h-12 rounded-full bg-white px-8 text-base font-medium text-black hover:bg-white/90 transition-colors">
                Войти в систему
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Toggle menu</span>
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-white" />
            ) : (
              <Menu className="h-6 w-6 text-white" />
            )}
          </button>
        </nav>

        {/* Mobile Navigation Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-50 flex flex-col p-4 bg-black/95 md:hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <span className="ml-3 text-xl font-bold text-white">
                    inVision U
                  </span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)}>
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>
              <div className="mt-8 flex flex-col space-y-6">
                <MobileNavItem label="О программе" />
                <MobileNavItem label="Отбор" />
                <MobileNavItem label="FAQ" />
                <div className="pt-4">
                  <button className="w-full border border-gray-700 text-white rounded-full h-12 px-8 font-medium">
                    Войти
                  </button>
                </div>
                <button className="h-12 rounded-full bg-white px-8 text-base font-medium text-black hover:bg-white/90">
                  Подать заявку
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Badge */}
        <div className="mx-auto mt-6 flex max-w-fit items-center justify-center space-x-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur-sm border border-white/10">
          <span className="text-sm font-medium text-white">
            AI Screening System for inVision U
          </span>
          <ArrowRight className="h-4 w-4 text-white" />
        </div>

        {/* Hero section */}
        <div className="container mx-auto mt-12 px-4 text-center">
          <h1 className="mx-auto max-w-5xl text-5xl font-bold leading-tight text-white md:text-6xl lg:text-7xl tracking-tight">
            Находим лидеров будущего
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              {" "}с помощью AI
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 leading-relaxed">
            Интеллектуальная система отбора кандидатов в inVision U.
            Анализируем эссе, выявляем лидерский потенциал, детектируем AI-генерацию.
            Прозрачно. Объяснимо. Human-in-the-Loop.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
            <button
              className="h-12 rounded-full bg-white px-8 text-base font-medium text-black hover:bg-white/90 transition-colors"
              onClick={() => {
                const el = document.getElementById("dashboard");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Открыть Dashboard
            </button>
            <button className="h-12 rounded-full border border-gray-600 px-8 text-base font-medium text-white hover:bg-white/10 transition-colors">
              Как это работает
            </button>
          </div>

          {/* Feature cards */}
          <div className="mx-auto mt-20 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<Brain className="h-6 w-6" />}
              title="NLP-анализ"
              description="50+ маркеров лидерства, роста, мотивации на RU/EN"
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="AI-детекция"
              description="17+ эвристик для обнаружения ChatGPT-контента"
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Human-in-the-Loop"
              description="AI рекомендует, комиссия решает"
            />
            <FeatureCard
              icon={<GraduationCap className="h-6 w-6" />}
              title="Explainable AI"
              description="Прозрачные оценки с объяснением каждого балла"
            />
          </div>

          <div className="relative mx-auto my-20 w-full max-w-6xl">
            <div className="absolute inset-0 rounded-2xl shadow-lg bg-indigo-500 blur-[10rem] opacity-20" />
          </div>
        </div>
      </div>
    </div>
  );
};

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm hover:bg-white/10 transition-colors">
      <div className="mb-3 text-indigo-400">{icon}</div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

function NavItem({
  label,
  hasDropdown,
}: {
  label: string;
  hasDropdown?: boolean;
}) {
  return (
    <div className="flex items-center text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
      <span>{label}</span>
      {hasDropdown && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-1"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      )}
    </div>
  );
}

function MobileNavItem({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-800 pb-2 text-lg text-white">
      <span>{label}</span>
      <ArrowRight className="h-4 w-4 text-gray-400" />
    </div>
  );
}

export { Hero2 };
