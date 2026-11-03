'use client';

import { ExternalLink } from 'lucide-react';

export type ClickSource = 
  | 'TOOL_DETAIL'
  | 'DIRECTORY'
  | 'HOMEPAGE'
  | 'SEARCH'
  | 'RELATED'
  | 'COMPARISON'
  | 'OTHER';

interface ToolCTAButtonProps {
  toolId: string;
  toolName: string;
  source: ClickSource;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  children?: React.ReactNode;
  showIcon?: boolean;
}

export function ToolCTAButton({
  toolId,
  toolName,
  source,
  variant = 'primary',
  className = '',
  children = 'Visit Website',
  showIcon = true,
}: ToolCTAButtonProps) {
  
  // Build tracking URL - browser will send GET request
  const href = `/api/tools/click?toolId=${encodeURIComponent(toolId)}&source=${source}`;

  const baseClasses = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors';
  const variantClasses = {
    primary: 'bg-brand text-white hover:bg-brand/90',
    secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700',
    outline: 'border-2 border-brand text-brand hover:bg-brand hover:text-white',
  };

  // Prevent click from bubbling to parent Link
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      onClick={handleClick}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      aria-label={`Visit ${toolName} website`}
    >
      {children}
      {showIcon && <ExternalLink className="w-4 h-4" />}
    </a>
  );
}
