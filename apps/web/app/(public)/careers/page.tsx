/**
 * Careers page: Udyaibase's own careers page (header, perks, values, numbers). The open roles come from the careers widget,
 * the same embed employers put on their own sites: roles are managed in the hiring portal and the widget also adds
 * their JobPosting data to the page. The previous hand-written role list and application form are kept, commented out,
 * at the end of this file.
 */
'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';
import {
  Briefcase, Clock, MapPin, GraduationCap, Code2, Brain, Rocket, Target, Users, Zap, Heart, TrendingUp, Globe, Lightbulb, Award, Star,
} from 'lucide-react';
// The commented-out roles list and form also use: CheckCircle2, Loader2, Upload, X, Palette, PenTool, Database, Smartphone, BarChart3, Shield, Megaphone, ChevronDown, FileText, ExternalLink, Linkedin.

// ── Previous role definitions (commented out: the careers widget lists roles now) ─────────────
// // ── Role definitions ──────────────────────────────────────────────────────
//
// interface Role {
//   title: string;
//   department: string;
//   icon: typeof Code2;
//   type: 'INTERNSHIP' | 'FULL_TIME';
//   location: string;
//   duration?: string;
// }
//
// const ROLES: Role[] = [
//   // Internships
//   { title: 'Frontend Developer Intern', department: 'Engineering', icon: Code2, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'Full Stack Developer Intern', department: 'Engineering', icon: Database, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'Backend Developer Intern', department: 'Engineering', icon: Database, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'Next.js Developer Intern', department: 'Engineering', icon: Code2, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'React Native Developer Intern', department: 'Engineering', icon: Smartphone, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'Generative AI Engineer Intern', department: 'AI/ML', icon: Brain, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'ML/Data Science Intern', department: 'AI/ML', icon: BarChart3, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'Content Writer Intern', department: 'Content', icon: PenTool, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'SEO & Growth Intern', department: 'Marketing', icon: Megaphone, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'Graphic Designer Intern', department: 'Design', icon: Palette, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'UI/UX Designer Intern', department: 'Design', icon: Palette, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'Social Media Intern', department: 'Marketing', icon: Megaphone, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   { title: 'DevOps Intern', department: 'Engineering', icon: Shield, type: 'INTERNSHIP', location: 'Remote', duration: '3-6 months' },
//   // Full-time
//   { title: 'Senior Full Stack Developer', department: 'Engineering', icon: Code2, type: 'FULL_TIME', location: 'Remote / Hybrid' },
//   { title: 'AI/ML Engineer', department: 'AI/ML', icon: Brain, type: 'FULL_TIME', location: 'Remote / Hybrid' },
//   { title: 'Senior Content Editor', department: 'Content', icon: PenTool, type: 'FULL_TIME', location: 'Remote' },
//   { title: 'Product Designer', department: 'Design', icon: Palette, type: 'FULL_TIME', location: 'Remote / Hybrid' },
//   { title: 'Growth & Marketing Lead', department: 'Marketing', icon: Megaphone, type: 'FULL_TIME', location: 'Remote' },
// ];
//
// const DEPARTMENTS = [...new Set(ROLES.map(r => r.department))];
//
export default function CareersPage() {
//   const [selectedRole, setSelectedRole] = useState<Role | null>(null);
//   const [activeTab, setActiveTab] = useState<'INTERNSHIP' | 'FULL_TIME'>('INTERNSHIP');
//   const [departmentFilter, setDepartmentFilter] = useState('');
//
  // Platform stats (fetched from DB)
  const [stats, setStats] = useState({ toolCount: 0, startupCount: 0, articleCount: 0, subscriberCount: 0 });

  useEffect(() => {
    fetch('/api/careers/stats')
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {});
  }, []);

  // ── Previous application form state and handlers (commented out: candidates apply through the widget) ──
//   // Form state
//   const [formData, setFormData] = useState({
//     fullName: '',
//     email: '',
//     phone: '',
//     resumeLink: '',
//     resumeUrl: '',
//     resumeFileName: '',
//     resumeSizeBytes: 0,
//     linkedinUrl: '',
//     portfolioUrl: '',
//     consent: false,
//   });
//   const [submitting, setSubmitting] = useState(false);
//   const [success, setSuccess] = useState(false);
//   const [error, setError] = useState('');
//   const [emailError, setEmailError] = useState('');
//   const [uploadedFile, setUploadedFile] = useState<File | null>(null);
//   const [uploading, setUploading] = useState(false);
//   const [fileError, setFileError] = useState('');
//
//   // Load saved form data
//   useEffect(() => {
//     try {
//       const saved = localStorage.getItem('career_application');
//       if (saved) {
//         const parsed = JSON.parse(saved);
//         if (Date.now() - parsed.timestamp > 21600000) {
//           localStorage.removeItem('career_application');
//         } else {
//           setFormData(prev => ({
//             ...prev,
//             fullName: parsed.fullName || '',
//             phone: parsed.phone || '',
//             linkedinUrl: parsed.linkedinUrl || '',
//           }));
//         }
//       }
//     } catch { localStorage.removeItem('career_application'); }
//   }, []);
//
//   const validateEmail = (email: string) => {
//     if (!email) { setEmailError(''); return false; }
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(email)) { setEmailError('Please enter a valid email address'); return false; }
//     const disposable = ['tempmail', 'throwaway', '10minutemail', 'guerrillamail', 'mailinator'];
//     const domain = email.split('@')[1]?.toLowerCase();
//     if (disposable.some(d => domain?.includes(d))) { setEmailError('Please use a valid working email'); return false; }
//     setEmailError('');
//     return true;
//   };
//
//   const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file) return;
//
//     if (file.type !== 'application/pdf') {
//       setFileError('Only PDF files are allowed');
//       return;
//     }
//
//     const maxSize = 500 * 1024;
//     if (file.size > maxSize) {
//       setFileError(`File must be under 500KB (yours: ${Math.round(file.size / 1024)}KB). Compress at smallpdf.com`);
//       return;
//     }
//
//     setFileError('');
//     setUploading(true);
//
//     try {
//       const uploadFormData = new FormData();
//       uploadFormData.append('resume', file);
//       const response = await fetch('/api/careers/upload-resume', { method: 'POST', body: uploadFormData });
//       const data = await response.json();
//
//       if (data.success) {
//         setUploadedFile(file);
//         setFormData(prev => ({
//           ...prev,
//           resumeUrl: data.url,
//           resumeFileName: data.filename,
//           resumeSizeBytes: data.sizeBytes,
//           resumeLink: data.url,
//         }));
//       } else {
//         setFileError(data.error || 'Upload failed');
//       }
//     } catch {
//       setFileError('Upload failed. Please try again.');
//     } finally {
//       setUploading(false);
//     }
//   };
//
//   const handleRemoveFile = () => {
//     setUploadedFile(null);
//     setFileError('');
//     setFormData(prev => ({ ...prev, resumeUrl: '', resumeFileName: '', resumeSizeBytes: 0, resumeLink: '' }));
//   };
//
//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!selectedRole) return;
//
//     if (!formData.fullName || !formData.email || (!formData.resumeLink && !formData.resumeUrl)) {
//       setError('Please fill in all required fields including resume');
//       return;
//     }
//     if (!validateEmail(formData.email)) {
//       setError('Please enter a valid working email address');
//       return;
//     }
//
//     setSubmitting(true);
//     setError('');
//
//     try {
//       localStorage.setItem('career_application', JSON.stringify({
//         fullName: formData.fullName,
//         phone: formData.phone,
//         linkedinUrl: formData.linkedinUrl,
//         timestamp: Date.now(),
//       }));
//
//       const res = await fetch('/api/careers/apply', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           type: selectedRole.type,
//           role: selectedRole.title,
//           ...formData,
//         }),
//       });
//
//       const data = await res.json();
//
//       if (data.success) {
//         setSuccess(true);
//         setFormData({ fullName: '', email: '', phone: '', resumeLink: '', resumeUrl: '', resumeFileName: '', resumeSizeBytes: 0, linkedinUrl: '', portfolioUrl: '', consent: false });
//         setUploadedFile(null);
//         setTimeout(() => { setSelectedRole(null); setSuccess(false); }, 3000);
//       } else {
//         setError(data.error || 'Failed to submit application');
//       }
//     } catch {
//       setError('Network error. Please try again.');
//     } finally {
//       setSubmitting(false);
//     }
//   };
//
//   const filteredRoles = ROLES.filter(r =>
//     r.type === activeTab && (!departmentFilter || r.department === departmentFilter)
//   );
//
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-brand/10 px-4 py-2 rounded-full mb-4">
            <Briefcase className="w-4 h-4 text-brand" />
            <span className="text-brand text-xs font-bold uppercase tracking-wider font-jakarta">
              Careers at Udyaibase
            </span>
          </div>
          <h1 className="font-sora font-extrabold text-3xl sm:text-4xl lg:text-5xl text-navy dark:text-white mb-4">
            Build India's AI Ecosystem
          </h1>
          <p className="text-gray-600 dark:text-gray-400 font-jakarta text-lg max-w-2xl mx-auto">
            Join a mission-driven team building the definitive platform for India's AI startup ecosystem. Remote-first, impact-driven roles.
          </p>
        </div>

        {/* ── Perks ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
          {[
            { icon: MapPin, label: 'Remote First', desc: 'Work from anywhere' },
            { icon: Clock, label: 'Flexible Hours', desc: 'Own your schedule' },
            { icon: GraduationCap, label: 'Learn & Grow', desc: 'Real-world production work' },
            { icon: Briefcase, label: 'Certificate', desc: 'Internship certificate' },
          ].map(p => (
            <div key={p.label} className="text-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <p.icon className="w-6 h-6 text-brand mx-auto mb-2" />
              <p className="font-sora font-bold text-sm text-navy dark:text-white">{p.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* ── Why Udyaibase ─────────────────────────────────────── */}
        <div className="mb-16">
          <div className="text-center mb-10">
            <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mb-3">
              Why Build With Us?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 font-jakarta max-w-2xl mx-auto">
              We're not just building a platform — we're shaping the future of India's AI ecosystem.
              Every line of code, every story we tell, every founder we spotlight moves the needle for thousands of startups.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="relative overflow-hidden bg-gradient-to-br from-brand/5 to-brand/10 dark:from-brand/10 dark:to-brand/20 rounded-2xl p-6 border border-brand/10">
              <Rocket className="w-8 h-8 text-brand mb-3" />
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Ship Real Products</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">
                No busywork. From day one, your work goes live to thousands of users — real directories, real startup stories, real impact on India's AI ecosystem.
              </p>
            </div>
            <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/10 dark:to-purple-900/20 rounded-2xl p-6 border border-purple-100 dark:border-purple-800/30">
              <TrendingUp className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-3" />
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Grow Fast</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">
                Work alongside experienced developers and content leads. Learn production-grade Next.js, ship weekly, and build a portfolio that stands out.
              </p>
            </div>
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/10 dark:to-emerald-900/20 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-800/30">
              <Globe className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mb-3" />
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Make India Proud</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">
                India has the talent to lead the global AI revolution. We're building the platform that connects, showcases, and accelerates that talent.
              </p>
            </div>
          </div>
        </div>

        {/* ── Our Values ──────────────────────────────────────────── */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mb-3">
              What We Stand For
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Zap, title: 'Bias for Action', desc: 'We ship fast, iterate faster. Perfect is the enemy of done — launch, learn, improve.', color: 'text-amber-500' },
              { icon: Lightbulb, title: 'Ownership Mindset', desc: "Treat every feature like it's your startup. You don't just execute — you think, decide, and own outcomes.", color: 'text-blue-500' },
              { icon: Heart, title: 'Community First', desc: 'Every decision is guided by what helps founders, builders, and the AI community the most.', color: 'text-rose-500' },
              { icon: Target, title: 'Impact Over Hours', desc: "We don't count hours — we count impact. Work when you're most productive. Results speak louder than timesheets.", color: 'text-emerald-500' },
            ].map(v => (
              <div key={v.title} className="flex gap-4 p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <v.icon className={`w-6 h-6 ${v.color} shrink-0 mt-0.5`} />
                <div>
                  <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-1">{v.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── What You'll Gain ────────────────────────────────────── */}
        <div className="mb-16 bg-gradient-to-br from-navy to-gray-900 dark:from-gray-900 dark:to-gray-950 rounded-2xl p-8 sm:p-10 text-white">
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl mb-2">What You'll Walk Away With</h2>
          <p className="text-gray-300 font-jakarta mb-8 max-w-xl">
            Whether you're an intern or a full-time member, here's what your time at Udyaibase gives you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Code2, label: 'Production Experience', desc: 'Work on a live platform with real users — not toy projects' },
              { icon: Award, label: 'Certificate & LOR', desc: 'Get a certificate of completion and a letter of recommendation' },
              { icon: Users, label: 'AI Industry Network', desc: "Connect with India's top AI startup founders, investors, and ecosystem builders" },
              { icon: Star, label: 'Portfolio That Shines', desc: 'Ship features you can demo in interviews — your GitHub will thank you' },
              { icon: Brain, label: 'AI Ecosystem Knowledge', desc: 'Understand the AI startup landscape — tools, funding, trends, and what makes startups succeed' },
              { icon: Rocket, label: 'Startup DNA', desc: 'Experience the speed, scrappiness, and ownership of a real startup' },
            ].map(g => (
              <div key={g.label} className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <g.icon className="w-4.5 h-4.5 text-brand" />
                </div>
                <div>
                  <p className="font-sora font-bold text-sm">{g.label}</p>
                  <p className="text-xs text-gray-400 font-jakarta mt-0.5 leading-relaxed">{g.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Impact Numbers ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
          {[
            { value: stats.toolCount, label: 'AI Tools Indexed' },
            { value: stats.startupCount, label: 'Startups Tracked' },
            { value: stats.articleCount, label: 'Articles Published' },
            { value: stats.subscriberCount, label: 'Newsletter Subscribers' },
          ].map(s => (
            <div key={s.label} className="text-center p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <p className="font-sora font-extrabold text-2xl sm:text-3xl text-brand">
                {s.value > 0 ? `${s.value.toLocaleString('en-IN')}+` : '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Open roles ───────────────────────────────────────────────
            Loaded by the Udyaibase careers widget, exactly as employers embed it on their own sites. Roles are managed
            in the hiring portal (Website widget). The previous hand-written role list and application form are kept,
            commented out, at the end of this file. */}
        <section id="open-roles" aria-labelledby="open-roles-h" className="scroll-mt-24">
          <div className="text-center mb-8">
            <h2 id="open-roles-h" className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mb-2">
              Open Roles
            </h2>
            <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm">
              Find your place in the team. Open a role to read more and apply.
            </p>
          </div>
          <div data-udyaibase-jobs="13d7ad6d-48e3-5cf2-bd5f-cf14e2ff8274"></div>
          <Script src="/embed/loader.js" strategy="afterInteractive" />
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Previous open roles list and application form (commented out). It went where the "Open roles" section is now,
// together with the role definitions, form state and handlers commented out above.
// ─────────────────────────────────────────────────────────────────────────────
//         {/* ── Open Roles header ───────────────────────────────────── */}
//         <div className="text-center mb-8">
//           <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mb-2">
//             Open Roles
//           </h2>
//           <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm">
//             Find your place in the team. Click a role to apply.
//           </p>
//         </div>
//
//         {/* ── Tabs: Internship / Full-Time ────────────────────────── */}
//         <div className="flex items-center gap-3 mb-6">
//           <button
//             onClick={() => { setActiveTab('INTERNSHIP'); setDepartmentFilter(''); }}
//             className={`px-5 py-2.5 rounded-xl text-sm font-bold font-jakarta transition-all ${
//               activeTab === 'INTERNSHIP'
//                 ? 'bg-brand text-white shadow-sm'
//                 : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:border-brand'
//             }`}
//           >
//             <GraduationCap className="w-4 h-4 inline mr-1.5 -mt-0.5" />
//             Internships ({ROLES.filter(r => r.type === 'INTERNSHIP').length})
//           </button>
//           <button
//             onClick={() => { setActiveTab('FULL_TIME'); setDepartmentFilter(''); }}
//             className={`px-5 py-2.5 rounded-xl text-sm font-bold font-jakarta transition-all ${
//               activeTab === 'FULL_TIME'
//                 ? 'bg-brand text-white shadow-sm'
//                 : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:border-brand'
//             }`}
//           >
//             <Briefcase className="w-4 h-4 inline mr-1.5 -mt-0.5" />
//             Full-Time ({ROLES.filter(r => r.type === 'FULL_TIME').length})
//           </button>
//         </div>
//
//         {/* ── Department filter pills ─────────────────────────────── */}
//         <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
//           <button
//             onClick={() => setDepartmentFilter('')}
//             className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold font-jakarta transition-all ${
//               !departmentFilter
//                 ? 'bg-navy dark:bg-white text-white dark:text-gray-900'
//                 : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
//             }`}
//           >
//             All
//           </button>
//           {DEPARTMENTS.filter(d => ROLES.some(r => r.type === activeTab && r.department === d)).map(dept => (
//             <button
//               key={dept}
//               onClick={() => setDepartmentFilter(dept)}
//               className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold font-jakarta transition-all ${
//                 departmentFilter === dept
//                   ? 'bg-navy dark:bg-white text-white dark:text-gray-900'
//                   : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
//               }`}
//             >
//               {dept}
//             </button>
//           ))}
//         </div>
//
//         {/* ── Role cards ──────────────────────────────────────────── */}
//         <div className="space-y-3 mb-12">
//           {filteredRoles.map(role => {
//             const Icon = role.icon;
//             return (
//               <button
//                 key={role.title}
//                 onClick={() => { setSelectedRole(role); setSuccess(false); setError(''); }}
//                 className={`w-full text-left p-5 rounded-xl border transition-all group ${
//                   selectedRole?.title === role.title
//                     ? 'bg-brand/5 border-brand shadow-sm'
//                     : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-brand/50 hover:shadow-sm'
//                 }`}
//               >
//                 <div className="flex items-center gap-4">
//                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
//                     selectedRole?.title === role.title ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:bg-brand/10 group-hover:text-brand'
//                   }`}>
//                     <Icon className="w-5 h-5" />
//                   </div>
//                   <div className="flex-1 min-w-0">
//                     <h3 className="font-sora font-bold text-sm text-navy dark:text-white">{role.title}</h3>
//                     <div className="flex items-center gap-3 mt-1">
//                       <span className="text-xs text-gray-500 dark:text-gray-400 font-jakarta flex items-center gap-1">
//                         <MapPin className="w-3 h-3" /> {role.location}
//                       </span>
//                       <span className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">{role.department}</span>
//                       {role.duration && (
//                         <span className="text-xs text-gray-500 dark:text-gray-400 font-jakarta flex items-center gap-1">
//                           <Clock className="w-3 h-3" /> {role.duration}
//                         </span>
//                       )}
//                     </div>
//                   </div>
//                   <span className={`text-xs font-bold font-jakarta px-3 py-1 rounded-full ${
//                     role.type === 'INTERNSHIP'
//                       ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
//                       : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
//                   }`}>
//                     {role.type === 'INTERNSHIP' ? 'Internship' : 'Full-Time'}
//                   </span>
//                 </div>
//               </button>
//             );
//           })}
//
//           {filteredRoles.length === 0 && (
//             <div className="text-center py-12 text-gray-400 font-jakarta">
//               <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
//               <p>No openings in this department right now.</p>
//             </div>
//           )}
//         </div>
//
//         {/* ── Application Form (shown when role selected) ─────────── */}
//         {selectedRole && (
//           <div id="apply-form" className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 shadow-2xl scroll-mt-8">
//             {success ? (
//               <div className="text-center py-8">
//                 <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
//                 <h3 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">Application Submitted!</h3>
//                 <p className="text-gray-500 font-jakarta text-sm">
//                   Thank you for applying for <strong>{selectedRole.title}</strong>. We'll review your application and get back to you soon.
//                 </p>
//               </div>
//             ) : (
//               <>
//                 <div className="flex items-center justify-between mb-6">
//                   <div>
//                     <h2 className="font-sora font-bold text-xl text-navy dark:text-white">
//                       Apply — {selectedRole.title}
//                     </h2>
//                     <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1">
//                       {selectedRole.department} · {selectedRole.location}
//                       {selectedRole.duration ? ` · ${selectedRole.duration}` : ''}
//                     </p>
//                   </div>
//                   <button
//                     onClick={() => setSelectedRole(null)}
//                     className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
//                   >
//                     <X className="w-5 h-5" />
//                   </button>
//                 </div>
//
//                 {error && (
//                   <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
//                     <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
//                   </div>
//                 )}
//
//                 <form onSubmit={handleSubmit} className="space-y-5">
//                   {/* Name + Email row */}
//                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//                     <div>
//                       <label className="block font-sora font-bold text-xs text-navy dark:text-white mb-1.5">Full Name *</label>
//                       <input
//                         type="text"
//                         value={formData.fullName}
//                         onChange={e => setFormData({ ...formData, fullName: e.target.value })}
//                         placeholder="Your full name"
//                         className="input-field w-full"
//                         required
//                       />
//                     </div>
//                     <div>
//                       <label className="block font-sora font-bold text-xs text-navy dark:text-white mb-1.5">
//                         Email * <span className="text-gray-400 font-normal">(working email)</span>
//                       </label>
//                       <input
//                         type="email"
//                         value={formData.email}
//                         onChange={e => { setFormData({ ...formData, email: e.target.value }); if (e.target.value) validateEmail(e.target.value); else setEmailError(''); }}
//                         placeholder="your@email.com"
//                         className={`input-field w-full ${emailError ? 'border-red-500 focus:border-red-500' : ''}`}
//                         required
//                       />
//                       {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
//                     </div>
//                   </div>
//
//                   {/* Phone + LinkedIn row */}
//                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//                     <div>
//                       <label className="block font-sora font-bold text-xs text-navy dark:text-white mb-1.5">Phone</label>
//                       <input
//                         type="tel"
//                         value={formData.phone}
//                         onChange={e => setFormData({ ...formData, phone: e.target.value })}
//                         placeholder="+91 9876543210"
//                         className="input-field w-full"
//                       />
//                     </div>
//                     <div>
//                       <label className="block font-sora font-bold text-xs text-navy dark:text-white mb-1.5">LinkedIn Profile</label>
//                       <input
//                         type="url"
//                         value={formData.linkedinUrl}
//                         onChange={e => setFormData({ ...formData, linkedinUrl: e.target.value })}
//                         placeholder="https://linkedin.com/in/yourprofile"
//                         className="input-field w-full"
//                       />
//                     </div>
//                   </div>
//
//                   {/* Portfolio (only for design/content) */}
//                   {['Design', 'Content', 'Marketing'].includes(selectedRole.department) && (
//                     <div>
//                       <label className="block font-sora font-bold text-xs text-navy dark:text-white mb-1.5">Portfolio / Website</label>
//                       <input
//                         type="url"
//                         value={formData.portfolioUrl}
//                         onChange={e => setFormData({ ...formData, portfolioUrl: e.target.value })}
//                         placeholder="https://your-portfolio.com"
//                         className="input-field w-full"
//                       />
//                     </div>
//                   )}
//
//                   {/* Resume upload */}
//                   <div>
//                     <label className="block font-sora font-bold text-xs text-navy dark:text-white mb-1.5">
//                       Resume * <span className="text-gray-400 font-normal">(PDF, max 500KB)</span>
//                     </label>
//
//                     {!uploadedFile && !formData.resumeLink && (
//                       <>
//                         <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-brand hover:bg-brand/5 transition-all">
//                           <div className="flex flex-col items-center justify-center py-4">
//                             {uploading ? (
//                               <Loader2 className="w-6 h-6 text-brand animate-spin mb-1" />
//                             ) : (
//                               <Upload className="w-6 h-6 text-gray-400 mb-1" />
//                             )}
//                             <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">
//                               {uploading ? 'Uploading...' : 'Click to upload your resume'}
//                             </p>
//                             <p className="text-xs text-gray-400 font-jakarta mt-0.5">PDF only, max 500KB</p>
//                           </div>
//                           <input
//                             type="file"
//                             accept=".pdf,application/pdf"
//                             onChange={handleFileUpload}
//                             className="hidden"
//                             disabled={uploading}
//                           />
//                         </label>
//                         {fileError && <p className="text-xs text-red-500 mt-2">{fileError}</p>}
//
//                         <div className="relative my-3">
//                           <div className="absolute inset-0 flex items-center">
//                             <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
//                           </div>
//                           <div className="relative flex justify-center text-xs">
//                             <span className="px-2 bg-white dark:bg-gray-900 text-gray-400">OR paste a link</span>
//                           </div>
//                         </div>
//
//                         <input
//                           type="url"
//                           value={formData.resumeLink}
//                           onChange={e => setFormData({ ...formData, resumeLink: e.target.value })}
//                           placeholder="https://drive.google.com/... or PDF URL"
//                           className="input-field w-full"
//                         />
//                       </>
//                     )}
//
//                     {uploadedFile && (
//                       <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center justify-between">
//                         <div className="flex items-center gap-2">
//                           <FileText className="w-4 h-4 text-green-600" />
//                           <div>
//                             <p className="text-sm font-semibold text-green-700 dark:text-green-400">{uploadedFile.name}</p>
//                             <p className="text-xs text-green-600 dark:text-green-500">{Math.round(uploadedFile.size / 1024)}KB · Uploaded</p>
//                           </div>
//                         </div>
//                         <button type="button" onClick={handleRemoveFile} className="text-red-500 hover:text-red-700">
//                           <X className="w-5 h-5" />
//                         </button>
//                       </div>
//                     )}
//
//                     {!uploadedFile && formData.resumeLink && !formData.resumeUrl && (
//                       <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
//                         <div className="flex items-center gap-2">
//                           <ExternalLink className="w-4 h-4 text-blue-600" />
//                           <p className="text-sm text-blue-700 dark:text-blue-400 truncate max-w-xs">{formData.resumeLink}</p>
//                         </div>
//                         <button type="button" onClick={() => setFormData(prev => ({ ...prev, resumeLink: '' }))} className="text-red-500 hover:text-red-700">
//                           <X className="w-4 h-4" />
//                         </button>
//                       </div>
//                     )}
//                   </div>
//
//                   {/* Newsletter: optional, never needed to apply */}
//                   <div className="py-1">
//                     <label className="flex items-start gap-3 cursor-pointer">
//                       <input
//                         type="checkbox"
//                         checked={formData.consent}
//                         onChange={e => setFormData({ ...formData, consent: e.target.checked })}
//                         className="w-5 h-5 text-brand border-gray-300 rounded focus:ring-brand mt-0.5 flex-shrink-0"
//                       />
//                       <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">
//                         Also send me the Udyaibase newsletter (optional). I can unsubscribe at any time.
//                       </span>
//                     </label>
//                   </div>
//
//                   {/* Submit */}
//                   <button
//                     type="submit"
//                     disabled={submitting}
//                     className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm font-jakarta transition-all bg-brand text-white hover:bg-brand/90 shadow-lg hover:shadow-xl disabled:opacity-60"
//                   >
//                     {submitting ? (
//                       <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
//                     ) : (
//                       'Submit Application'
//                     )}
//                   </button>
//
//                   <p className="text-xs text-gray-400 font-jakarta text-center">
//                     Your details will be retained for 6 months. We review applications within 5 business days.
//                   </p>
//                 </form>
//               </>
//             )}
//           </div>
//         )}
