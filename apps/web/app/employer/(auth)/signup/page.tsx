'use client';

import { Briefcase, Building2, Globe, Users, BarChart3, Zap, UserPlus } from 'lucide-react';
import SignupFlow from '@/components/employer/signup/SignupFlow';

const benefits = [
  {
    icon: Briefcase,
    title: 'AI Job Listings',
    desc: 'Post jobs to reach 45K+ AI professionals',
  },
  {
    icon: Users,
    title: 'Talent Pipeline',
    desc: 'Access pre-screened candidates with AI skills',
  },
  {
    icon: BarChart3,
    title: 'Hiring Analytics',
    desc: 'Track applications, views & conversion rates',
  },
  {
    icon: Building2,
    title: 'Company Profile',
    desc: 'Showcase your company to the AI community',
  },
  {
    icon: Globe,
    title: 'Industry Reach',
    desc: "Connect with India's fastest-growing AI talent pool",
  },
  {
    icon: Zap,
    title: 'Quick Setup',
    desc: 'Post your first job in under 5 minutes',
  },
];

/** Employer signup: no password. Work email → code → company → first job (see SignupFlow). */
export default function EmployerSignupPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-0 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-xl shadow-gray-200/50 dark:shadow-black/30">

        {/* Left — Benefits panel */}
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-5 sm:p-6 lg:p-12 flex flex-col justify-between overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h40v40H0z\' fill=\'none\'/%3E%3Cpath d=\'M20 0v40M0 20h40\' stroke=\'%23fff\' stroke-width=\'.5\'/%3E%3C/svg%3E")', backgroundSize: '40px 40px' }} />

          <div className="relative z-10">
            {/* Compact mobile header */}
            <div className="flex items-center gap-2.5 mb-4 lg:mb-8">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Briefcase className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
              </div>
              <span className="font-sora font-bold text-white text-xs lg:text-sm tracking-wide uppercase">Employer Portal</span>
            </div>

            <h2 className="font-sora font-extrabold text-xl lg:text-3xl text-white leading-tight mb-2 lg:mb-3">
              Hire AI Talent Faster
            </h2>
            <p className="text-white/80 text-xs lg:text-sm font-jakarta leading-relaxed mb-4 lg:mb-8 max-w-sm">
              Post AI jobs and reach 45K+ professionals — backed by India&apos;s largest AI community.
            </p>

            {/* Mobile: 3 compact chips in a row */}
            <div className="flex flex-wrap gap-2 lg:hidden">
              {benefits.slice(0, 3).map((b) => (
                <div key={b.title} className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5">
                  <b.icon className="w-3.5 h-3.5 text-white" />
                  <span className="text-white text-xs font-semibold font-jakarta">{b.title}</span>
                </div>
              ))}
            </div>

            {/* Desktop: full benefit cards grid */}
            <div className="hidden lg:grid grid-cols-2 gap-4">
              {benefits.map((b) => (
                <div key={b.title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 mt-0.5">
                    <b.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm font-jakarta">{b.title}</p>
                    <p className="text-white/65 text-xs font-jakarta leading-snug mt-0.5">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Social proof — compact on mobile */}
          <div className="relative z-10 mt-4 lg:mt-8 pt-4 lg:pt-6 border-t border-white/15">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1.5 lg:-space-x-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
                    <UserPlus className="w-2.5 h-2.5 lg:w-3 lg:h-3 text-white/80" />
                  </div>
                ))}
              </div>
              <p className="text-white/75 text-[11px] lg:text-xs font-jakarta">
                Trusted by <span className="text-white font-semibold">500+</span> companies hiring AI talent
              </p>
            </div>
          </div>
        </div>

        {/* Right — signup steps */}
        <div className="p-5 sm:p-8 lg:p-12 flex flex-col justify-center">
          <div className="w-full max-w-sm mx-auto">
            <div className="mb-5 lg:mb-6">
              <h1 className="font-sora font-extrabold text-lg sm:text-xl lg:text-2xl text-gray-900 dark:text-white">Start hiring on Udyaibase</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">Free to start. No password, no card.</p>
            </div>
            <SignupFlow />
          </div>
        </div>
      </div>
    </div>
  );
}
