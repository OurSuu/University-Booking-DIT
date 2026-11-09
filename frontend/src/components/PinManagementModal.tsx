'use client';

import { useState, useEffect, useCallback } from 'react';
import { TeacherPinRecord } from '@/lib/db';
import { validatePasswordPolicy, generateSecurePassword } from '@/types';
import styles from './PinManagementModal.module.css';

interface Props {
  isOpen: boolean;
  masterPin: string;
  onMasterPinChanged: (newPin: string) => void;
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function PinManagementModal({
  isOpen,
  masterPin,
  onMasterPinChanged,
  onClose,
  showToast,
}: Props) {
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'master'>('list');
  const [pins, setPins] = useState<TeacherPinRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visiblePins, setVisiblePins] = useState<Record<number, boolean>>({});

  // Form: Create Teacher Password
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherPin, setNewTeacherPin] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form: Change Master Password
  const [newMasterPin, setNewMasterPin] = useState('');
  const [confirmMasterPin, setConfirmMasterPin] = useState('');
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);

  const fetchPins = useCallback(async () => {
    if (!masterPin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/teacher-pins', {
        headers: { 'x-master-pin': masterPin },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ไม่สามารถดึงข้อมูลรหัสผ่านอาจารย์ได้');
      } else {
        setPins(data);
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  }, [masterPin]);

  useEffect(() => {
    if (isOpen) {
      fetchPins();
    }
  }, [isOpen, fetchPins]);

  const generateRandomPassword = () => {
    const generated = generateSecurePassword(16);
    setNewTeacherPin(generated);
  };

  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newTeacherName.trim()) {
      setCreateError('กรุณาระบุชื่ออาจารย์หรือหน่วยงาน');
      return;
    }
    const policy = validatePasswordPolicy(newTeacherPin);
    if (!policy.valid) {
      setCreateError(policy.error || 'รหัสผ่านต้องมีความยาวอย่างน้อย 16 ตัวอักษร และมีตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ');
      return;
    }

    setCreateLoading(true);
    try {
      const res = await fetch('/api/teacher-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterPin,
          newPin: newTeacherPin.trim(),
          teacher_name: newTeacherName.trim(),
          role: 'teacher',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'ไม่สามารถสร้างรหัสผ่านอาจารย์ได้');
      } else {
        showToast(`สร้างรหัสผ่านสำหรับ "${newTeacherName}" เรียบร้อยแล้ว`, 'success');
        setNewTeacherName('');
        setNewTeacherPin('');
        setActiveTab('list');
        fetchPins();
      }
    } catch {
      setCreateError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleChangeMasterPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterError(null);

    const policy = validatePasswordPolicy(newMasterPin);
    if (!policy.valid) {
      setMasterError(policy.error || 'รหัส Master Password ใหม่ต้องมีความยาวอย่างน้อย 16 ตัวอักษร และมีตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ');
      return;
    }
    if (newMasterPin !== confirmMasterPin) {
      setMasterError('รหัสยืนยันไม่ตรงกับรหัส Master PIN ใหม่');
      return;
    }

    setMasterLoading(true);
    try {
      const res = await fetch('/api/teacher-pins/master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentMasterPin: masterPin,
          newMasterPin: newMasterPin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMasterError(data.error || 'ไม่สามารถเปลี่ยน Master Password ได้');
      } else {
        showToast('เปลี่ยนรหัส Master Password สำเร็จแล้ว! กรุณาจดจำรหัสใหม่ของท่าน', 'success');
        onMasterPinChanged(newMasterPin.trim());
        setNewMasterPin('');
        setConfirmMasterPin('');
        setActiveTab('list');
        fetchPins();
      }
    } catch {
      setMasterError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setMasterLoading(false);
    }
  };

  const handleDeletePin = async (id: number, name: string) => {
    if (!window.confirm(`ต้องการลบรหัสผ่านของ "${name}" ใช่หรือไม่? อาจารย์ท่านนี้จะไม่สามารถใช้สร้างงานได้อีก`)) {
      return;
    }

    try {
      const res = await fetch(`/api/teacher-pins/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'ไม่สามารถลบรหัสผ่านได้', 'error');
      } else {
        showToast('ลบรหัสผ่านสำเร็จแล้ว', 'success');
        fetchPins();
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการลบรหัสผ่าน', 'error');
    }
  };

  const copyToClipboard = (pin: string, name: string) => {
    navigator.clipboard.writeText(pin);
    showToast(`คัดลอกรหัสผ่านของ "${name}" แล้ว`, 'info');
  };

  const togglePinVisibility = (id: number) => {
    setVisiblePins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <h3 className={styles.modalTitle}>ระบบจัดการรหัสผ่านอาจารย์</h3>
            <span className={styles.modalSubTitle}>
              สำหรับอาจารย์ผู้ดูแลระบบ (Master Key) เพื่อบริหารจัดการสิทธิ์
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>

        {/* Tab Bar */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'list' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('list')}
          >
            รายชื่อรหัสผ่านทั้งหมด ({pins.length})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'create' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('create')}
          >
            + สร้างรหัสผ่านให้อาจารย์ใหม่
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'master' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('master')}
          >
            เปลี่ยนรหัส Master Password
          </button>
        </div>

        {/* Content */}
        <div className={styles.modalContent}>
          {activeTab === 'list' && (
            <div className={styles.formBox}>
              {error && <div className={styles.errorBox}>{error}</div>}

              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  กำลังโหลดรายการรหัสผ่าน...
                </div>
              ) : pins.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  ยังไม่มีรายการรหัสผ่านในระบบ
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.pinsTable}>
                    <thead>
                      <tr>
                        <th>ชื่ออาจารย์ / หน่วยงาน</th>
                        <th>บทบาท</th>
                        <th>รหัสผ่าน (16 ตัวอักษร)</th>
                        <th>การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pins.map((p) => {
                        const isMaster = p.role === 'admin';
                        const isVisible = visiblePins[p.id];
                        return (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.teacher_name}</strong>
                              {isMaster && (
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                  (ผู้ดูแลสูงสุด / ดูแดชบอร์ดได้)
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={isMaster ? styles.roleAdmin : styles.roleTeacher}>
                                {isMaster ? 'ผู้ดูแลระบบ (Admin)' : 'อาจารย์ทั่วไป'}
                              </span>
                            </td>
                            <td>
                              <span className={styles.pinCode}>
                                {isVisible ? p.pin : '••••••••••••••••'}
                              </span>
                            </td>
                            <td>
                              <div className={styles.actionCell}>
                                <button
                                  type="button"
                                  className={styles.viewPinBtn}
                                  onClick={() => togglePinVisibility(p.id)}
                                  title={isVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                >
                                  {isVisible ? 'ซ่อน' : 'แสดง'}
                                </button>
                                <button
                                  type="button"
                                  className={styles.copyPinBtn}
                                  onClick={() => copyToClipboard(p.pin, p.teacher_name)}
                                  title="คัดลอกรหัสผ่าน"
                                >
                                  คัดลอก
                                </button>
                                {!isMaster && (
                                  <button
                                    type="button"
                                    className={styles.deletePinBtn}
                                    onClick={() => handleDeletePin(p.id, p.teacher_name)}
                                    title="ลบรหัสผ่านนี้"
                                  >
                                    ลบ
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className={styles.noticeBox}>
                อาจารย์ทั่วไปที่มีรหัสผ่านจะสามารถสร้างงาน แก้ไขงาน และถอนชื่อนักศึกษาได้ แต่จะไม่สามารถเข้าดูหน้าแดชบอร์ดสถิติได้ (สงวนสิทธิ์เฉพาะ Master Password)
              </div>
            </div>
          )}

          {activeTab === 'create' && (
            <form onSubmit={handleCreatePin} className={styles.formBox}>
              {createError && <div className={styles.errorBox}>{createError}</div>}

              <div className={styles.field}>
                <label>ชื่อ - นามสกุลอาจารย์ หรือฝ่ายงานที่รับผิดชอบ *</label>
                <input
                  type="text"
                  placeholder="เช่น อ.ชูเกียรติ, งานพัฒนานักศึกษา DIT"
                  value={newTeacherName}
                  onChange={(e) => setNewTeacherName(e.target.value)}
                  className={styles.textInput}
                  required
                />
              </div>

              <div className={styles.field}>
                <label>กำหนดรหัสผ่านอาจารย์ (16 ตัวอักษรขึ้นไป) *</label>
                <div className={styles.inputRow}>
                  <input
                    type="text"
                    placeholder="เช่น aB8@kL9#mP2$xQ5!"
                    value={newTeacherPin}
                    onChange={(e) => setNewTeacherPin(e.target.value)}
                    className={styles.textInput}
                    style={{ fontFamily: 'monospace' }}
                    required
                  />
                  <button
                    type="button"
                    className={styles.randomBtn}
                    onClick={generateRandomPassword}
                  >
                    สุ่มรหัสผ่านปลอดภัย (16 ตัว)
                  </button>
                </div>
                <div className={styles.policyHint}>
                  ข้อกำหนดความปลอดภัย: รหัสผ่านต้องมีความยาวอย่างน้อย 16 ตัวอักษร ประกอบด้วยตัวอักษรพิมพ์ใหญ่ (A-Z), พิมพ์เล็ก (a-z), ตัวเลข (0-9) และตัวอักษรพิเศษ (เช่น @, !, _, &gt;, &amp;)
                </div>
              </div>

              <div className={styles.noticeBox}>
                เมื่อสร้างเสร็จแล้ว ท่านสามารถนำรหัสผ่าน 16 ตัวอักษรนี้ไปมอบให้อาจารย์ท่านดังกล่าว เพื่อใช้เข้าสู่ระบบสร้างประกาศงานและถอนชื่อได้ทันทีโดยไม่ต้องสมัครบัญชี
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={createLoading}
                >
                  {createLoading ? 'กำลังสร้าง...' : 'สร้างรหัสผ่านให้อาจารย์'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'master' && (
            <form onSubmit={handleChangeMasterPin} className={styles.formBox}>
              {masterError && <div className={styles.errorBox}>{masterError}</div>}

              <div className={styles.field}>
                <label>รหัส Master Password ใหม่ (16 ตัวอักษรขึ้นไป) *</label>
                <div className={styles.inputRow}>
                  <input
                    type="text"
                    placeholder="กรอกรหัส Master ใหม่ (เช่น xLD44eWe58&X2vPe)"
                    value={newMasterPin}
                    onChange={(e) => setNewMasterPin(e.target.value)}
                    className={styles.textInput}
                    style={{ fontFamily: 'monospace' }}
                    required
                  />
                  <button
                    type="button"
                    className={styles.randomBtn}
                    onClick={() => {
                      const gen = generateSecurePassword(16);
                      setNewMasterPin(gen);
                      setConfirmMasterPin(gen);
                    }}
                  >
                    สุ่มรหัสปลอดภัย
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label>ยืนยันรหัส Master Password ใหม่ *</label>
                <input
                  type="text"
                  placeholder="กรอกรหัสใหม่อีกครั้งเพื่อยืนยัน"
                  value={confirmMasterPin}
                  onChange={(e) => setConfirmMasterPin(e.target.value)}
                  className={styles.textInput}
                  style={{ fontFamily: 'monospace' }}
                  required
                />
                <div className={styles.policyHint}>
                  ข้อกำหนดความปลอดภัย: รหัสผ่านต้องมีความยาวอย่างน้อย 16 ตัวอักษร ประกอบด้วยตัวอักษรพิมพ์ใหญ่ (A-Z), พิมพ์เล็ก (a-z), ตัวเลข (0-9) และตัวอักษรพิเศษ (เช่น @, !, _, &gt;, &amp;)
                </div>
              </div>

              <div className={styles.noticeBox}>
                รหัส Master Password นี้ใช้สำหรับควบคุมระบบทั้งหมด รวมถึงดู Dashboard และจัดการรหัสผ่านของอาจารย์ท่านอื่น กรุณาเก็บรักษารหัสนี้เป็นความลับ
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={masterLoading}
                >
                  {masterLoading ? 'กำลังบันทึก...' : 'บันทึก Master Password ใหม่'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
