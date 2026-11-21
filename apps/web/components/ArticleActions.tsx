'use client';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Check, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';
import { useUser } from './UserProvider';
import SignInModal from '@/components/auth/SignInModal';
import ShareButton from '@/components/ShareButton';

const COMMENT_MAX_LENGTH = 500;

interface Comment {
  id: string;
  name: string;
  avatar: string | null;
  body: string;
  createdAt: string;
}

interface Props {
  slug: string;
  initialLikes: number;
  title: string;
}

export default function ArticleActions({ slug, initialLikes, title }: Props) {
  const { user } = useUser();
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);

  // Persist liked state in localStorage
  useEffect(() => {
    try { if (localStorage.getItem(`liked-${slug}`)) setLiked(true); } catch {}
  }, [slug]);

  // Tap again to take a like back. The count updates straight away and is put back if the server says no.
  const handleLike = async () => {
    if (likeBusy) return;
    const key = `liked-${slug}`;
    const was = liked;
    setLiked(!was);
    setLikes((l) => Math.max(0, l + (was ? -1 : 1)));
    try { if (was) localStorage.removeItem(key); else localStorage.setItem(key, '1'); } catch {}
    setLikeBusy(true);
    try {
      const res = await fetch(`/api/articles/${slug}/like`, { method: was ? 'DELETE' : 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => null);
      if (typeof data?.likeCount === 'number') setLikes(data.likeCount);
    } catch {
      setLiked(was);
      setLikes((l) => Math.max(0, l + (was ? 1 : -1)));
      try { if (was) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch {}
    } finally {
      setLikeBusy(false);
    }
  };

  const loadComments = async () => {
    if (comments.length > 0) return;
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/articles/${slug}/comments`);
      const data = await res.json();
      setComments(data.comments || []);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleCommentClick = () => {
    if (!user) {
      setShowSignIn(true);
      return;
    }
    const next = !showComments;
    setShowComments(next);
    if (next) loadComments();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!user) { setShowSignIn(true); return; }
    if (!body.trim()) { setError('Please write a comment.'); return; }
    if (body.length > COMMENT_MAX_LENGTH) { setError(`Comment must be ${COMMENT_MAX_LENGTH} characters or less.`); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/articles/${slug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        setBody('');
      } else {
        setError(data.error || 'Failed to submit');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-5 sm:pt-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleLike}
          aria-pressed={liked}
          aria-label={liked ? `Liked, ${likes} likes. Tap to undo` : `Like, ${likes} likes`}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 font-jakarta text-sm font-semibold transition-colors ${
            liked
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600'
          }`}
        >
          <Heart className={`h-[18px] w-[18px] transition-transform ${liked ? 'fill-current scale-110' : ''}`} aria-hidden />
          <span className="tabular-nums">{likes}</span>
        </button>

        <button
          type="button"
          onClick={handleCommentClick}
          aria-expanded={showComments}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-4 font-jakarta text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
          <span>Comments</span>
          {showComments ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>

        <ShareButton title={title} pill />
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-6 space-y-6">
          {/* Existing comments */}
          {loadingComments ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm font-jakarta">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading comments...
            </div>
          ) : comments.length > 0 ? (
            <div className="space-y-4">
              {comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  {c.avatar ? (
                    <img src={c.avatar} alt={c.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold font-sora text-sm shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-[14px] px-3.5 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-sora font-bold text-sm text-navy dark:text-white">{c.name}</span>
                      <span className="text-[13px] sm:text-xs text-gray-500 font-jakarta">
                        {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-[15px] sm:text-sm text-gray-700 dark:text-gray-300 font-jakarta leading-relaxed break-words">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[15px] sm:text-sm text-gray-500 font-jakarta">No comments yet. Be the first to share your thoughts.</p>
          )}

          {/* Comment form */}
          {submitted ? (
            <div className="flex items-center gap-2 text-green-600 text-sm font-jakarta bg-green-50 dark:bg-green-900/20 px-4 py-3 rounded-xl">
              <Check className="w-4 h-4" /> Comment submitted for review. It'll appear once approved.
            </div>
          ) : user ? (
            <form onSubmit={handleSubmit} className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <div className="flex gap-3">
                <div className="shrink-0">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold font-sora text-sm">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="font-sora font-semibold text-sm text-navy dark:text-white">{user.name}</p>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <textarea
                    placeholder="Share your thoughts..." value={body} rows={3} maxLength={COMMENT_MAX_LENGTH}
                    onChange={e => { if (e.target.value.length <= COMMENT_MAX_LENGTH) setBody(e.target.value); }}
                    className="input-field !text-base sm:!text-sm w-full resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-jakarta ${body.length >= COMMENT_MAX_LENGTH ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                      {body.length}/{COMMENT_MAX_LENGTH}
                    </span>
                    <button type="submit" disabled={submitting || body.length > COMMENT_MAX_LENGTH}
                      className="btn-brand text-sm min-h-[44px] flex items-center gap-2 disabled:opacity-50">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {submitting ? 'Submitting...' : 'Post Comment'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ) : null}
        </div>
      )}

      <SignInModal isOpen={showSignIn} onClose={() => setShowSignIn(false)} defaultMode="signin" />
    </div>
  );
}
