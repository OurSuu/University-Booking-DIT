'use client';

import { useState } from 'react';
import styles from './ConfirmModal.module.css';

interface Props {
  mode?: 'confirm' | 'pin';
  title?: string;
  message: string;
  confirmText?: string;
  onConfirm: (pinValue?: string) => void;
  onCancel: () => void;
  loading?: boolean;
  errorText?: string | null;
}

export default function ConfirmModal({
  mode = 'confirm',
  title,
  message,
  confirmText,
  onConfirm,
  onCancel,
  loading,
  errorText,
}: Props) {
  const [pin, setPin] = useState('');

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'pin' && !pin.trim()) return;
    onConfirm(pin.trim());
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={mode === 'pin' ? styles.iconWrapPin : styles.iconWrapDanger}>
          {mode === 'pin' ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>

        <h3 className={styles.title}>
          {title || (mode === 'pin' ? 'ยืนยันสิทธิ์อาจารย์ (รหัส PIN)' : 'ยืนยันการดำเนินการ')}
        </h3>
        <p className={styles.message}>{message}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'pin' && (
            <div className={styles.pinField}>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="กรอกรหัส PIN อาจารย์ (เช่น 1234)"
                autoFocus
                className={styles.pinInput}
              />
            </div>
          )}

          {errorText && <div className={styles.errorBox}>{errorText}</div>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
              disabled={loading}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className={mode === 'pin' ? styles.primaryBtn : styles.confirmBtn}
              disabled={loading || (mode === 'pin' && !pin.trim())}
            >
              {loading
                ? 'กำลังดำเนินการ...'
                : confirmText || (mode === 'pin' ? 'เข้าสู่โหมดอาจารย์' : 'ยืนยันการลบ')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
