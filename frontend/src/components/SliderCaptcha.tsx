'use client';

import { useState, useRef, useCallback } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import api from '@/lib/api';

interface SliderCaptchaProps {
  onVerified: (captchaId: string) => void;
  onError?: (msg: string) => void;
}

export default function SliderCaptcha({ onVerified, onError }: SliderCaptchaProps) {
  const [dragging, setDragging] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  const trackWidth = trackRef.current ? trackRef.current.offsetWidth - 42 : 260;

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (verified || loading) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startXRef.current = clientX;
    setDragging(true);
  }, [verified, loading]);

  const handleMouseMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging || verified) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const delta = clientX - startXRef.current;
    const clamped = Math.max(0, Math.min(delta, trackWidth));
    setOffsetX(clamped);
  }, [dragging, verified, trackWidth]);

  const handleMouseUp = useCallback(async () => {
    if (!dragging || verified) return;
    setDragging(false);

    if (offsetX >= trackWidth * 0.9) {
      setLoading(true);
      try {
        const captchaRes = await api.get('/auth/captcha');
        const captchaId = captchaRes.data.captcha_id;
        await api.post('/auth/captcha/verify', { captcha_id: captchaId });
        setVerified(true);
        onVerified(captchaId);
      } catch {
        setOffsetX(0);
        onError?.('验证失败，请重试');
      } finally {
        setLoading(false);
      }
    } else {
      setOffsetX(0);
    }
  }, [dragging, verified, offsetX, trackWidth, onVerified, onError]);

  return (
    <div className="mt-1">
      <div
        ref={trackRef}
        className="relative h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-card-subtle)] select-none overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-l-lg transition-colors"
          style={{
            width: offsetX + 42,
            background: verified
              ? 'linear-gradient(90deg, rgba(16,185,129,0.15), rgba(16,185,129,0.08))'
              : 'linear-gradient(90deg, rgba(37,99,235,0.12), rgba(37,99,235,0.06))',
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className={`text-[12px] ${verified ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>
            {verified ? '验证成功' : loading ? '验证中...' : '向右拖动滑块完成验证'}
          </span>
        </div>

        <div
          className={`absolute top-0.5 h-[calc(100%-4px)] w-10 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm transition-colors ${
            verified
              ? 'bg-emerald-500 text-white'
              : 'bg-white border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]'
          }`}
          style={{ left: offsetX }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          {verified ? <Check className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </div>
    </div>
  );
}
