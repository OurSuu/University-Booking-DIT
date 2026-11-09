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
  const [showPassword, setShowPassword] = useState(false);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) onCancel();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (mode === 'pin' && !pin.trim()) return;
    onConfirm(pin.trim());
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinnerLarge} />
            <p className={styles.loadingTitle}>
              {mode === 'pin' ? 'กำลังตรวจสอบรหัสผ่าน...' : 'กำลังลบประกาศงาน...'}
            </p>
            <span className={styles.loadingSub}>กรุณารอสักครู่</span>
          </div>
        )}

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
          {title || (mode === 'pin' ? 'ยืนยันสิทธิ์อาจารย์ (รหัสผ่าน)' : 'ยืนยันการดำเนินการ')}
        </h3>
        <p className={styles.message}>{message}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'pin' && (
            <div className={styles.pinField}>
              <div className={styles.pinInputWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="กรอกรหัสผ่านอาจารย์ 16 ตัวอักษร"
                  autoFocus
                  className={styles.pinInput}
                />
                <button
                  type="button"
                  className={styles.toggleShowBtn}
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                >
                  {showPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
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
              {loading && <span className={styles.btnSpinner} />}
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
