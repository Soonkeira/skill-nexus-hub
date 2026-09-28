'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import api from '@/lib/api';
import { resolvePackagePath } from '@/utils/markdown.mjs';

interface MarkdownContentProps {
  content: string;
  skillSlug: string;
  version: string;
  owner?: string;
  basePath?: string | null;
  onOpenFile?: (path: string) => void;
}

const alertLabels: Record<string, string> = {
  note: '说明',
  tip: '提示',
  important: '重要',
  warning: '警告',
  caution: '注意',
};

export default function MarkdownContent({
  content,
  skillSlug,
  version,
  owner,
  basePath,
  onOpenFile,
}: MarkdownContentProps) {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml('');

    Promise.all([import('marked'), import('dompurify')]).then(([markedModule, purifyModule]) => {
      if (cancelled) return;

      const rendered = markedModule.marked.parse(content, { gfm: true, breaks: false }) as string;
      const sanitized = purifyModule.default.sanitize(rendered);
      const documentNode = new DOMParser().parseFromString(sanitized, 'text/html');

      documentNode.querySelectorAll('blockquote').forEach(blockquote => {
        const firstParagraph = blockquote.querySelector(':scope > p:first-child');
        const match = firstParagraph?.textContent?.trim().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
        if (!match || !firstParagraph) return;

        const type = match[1].toLowerCase();
        firstParagraph.innerHTML = firstParagraph.innerHTML.replace(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
        if (!firstParagraph.textContent?.trim()) firstParagraph.remove();
        blockquote.classList.add('markdown-alert', `markdown-alert-${type}`);
        blockquote.setAttribute('data-alert-label', alertLabels[type]);
      });

      documentNode.querySelectorAll('a[href]').forEach(anchor => {
        const href = anchor.getAttribute('href') || '';
        const packagePath = resolvePackagePath(basePath, href);
        if (packagePath) {
          anchor.setAttribute('href', '#');
          anchor.setAttribute('data-skill-path', packagePath);
        } else if (/^https?:\/\//i.test(href)) {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noreferrer noopener');
        }
      });

      documentNode.querySelectorAll('img[src]').forEach(image => {
        const src = image.getAttribute('src') || '';
        const packagePath = resolvePackagePath(basePath, src);
        if (!packagePath) return;

        image.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');
        image.setAttribute('data-skill-path', packagePath);
        image.setAttribute('loading', 'lazy');
      });

      setHtml(documentNode.body.innerHTML);
    });

    return () => {
      cancelled = true;
    };
  }, [basePath, content, owner, skillSlug, version]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !html) return;

    let cancelled = false;
    const objectUrls: string[] = [];
    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img[data-skill-path]'));

    images.forEach(image => {
      const path = image.dataset.skillPath;
      if (!path) return;

      api.get(
        `/skills/by-slug/${skillSlug}/versions/${version}/files/content`,
        { params: { path, ...(owner ? { owner } : {}) }, responseType: 'blob' },
      ).then(({ data }) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(data);
        objectUrls.push(objectUrl);
        image.src = objectUrl;
      }).catch(() => {
        if (!cancelled) image.remove();
      });
    });

    return () => {
      cancelled = true;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [html, owner, skillSlug, version]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    const anchor = target.closest('a[data-skill-path]');
    const path = anchor?.getAttribute('data-skill-path');
    if (!path || !onOpenFile) return;

    event.preventDefault();
    onOpenFile(path);
  }

  if (!html) return <p className="text-sm text-[var(--text-muted)]">加载中...</p>;

  return (
    <div
      ref={containerRef}
      className="markdown-content prose max-w-none text-sm"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
