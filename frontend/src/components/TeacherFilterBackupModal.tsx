'use client';

import { useState, useMemo } from 'react';
import styles from './TeacherFilterBackupModal.module.css';

export interface TeacherFilterItem {
  name: string;
  jobCount: number;
  isHidden: boolean;
}

interface Props {
  isOpen: boolean;
  teachers: TeacherFilterItem[];
  saving: boolean;
  onHideTeacher: (teacherName: string) => void;
  onRestoreTeacher: (teacherName: string) => void;
  onRestoreAll: () => void;
  onClose: () => void;
}

export default function TeacherFilterBackupModal({
  isOpen,
  teachers,
  saving,
  onHideTeacher,
  onRestoreTeacher,
  onRestoreAll,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<'active' | 'backup'>('active');
  const [searchText, setSearchText] = useState('');

  const activeTeachers = useMemo(
    () => teachers.filter((t) => !t.isHidden),
    [teachers]
  );

  const backupTeachers = useMemo(
    () => teachers.filter((t) => t.isHidden),
    [teachers]
  );

  const filteredList = useMemo(() => {
    const base = activeTab === 'active' ? activeTeachers : backupTeachers;
    const q = searchText.trim().toLowerCase();
    if (!q) return base;
    return base.filter((t) => t.name.toLowerCase().includes(q));
  }, [activeTab, activeTeachers, backupTeachers, searchText]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.badgeBackup}>คลังรายชื่อตัวกรองอาจารย์</span>
            <h2>จัดการและ Backup รายชื่ออาจารย์ในตัวกรอง</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="ปิด"
            disabled={saving}
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.infoBanner}>
            การลบชื่ออาจารย์ออกจากตัวกรองเป็นการซ่อนเฉพาะในเมนูเลือกดูกราฟเท่านั้น ข้อมูลประกาศงาน ชั่วโมงทุน และรายชื่อนักศึกษาในตารางทั้งหมดยังคงอยู่ครบถ้วน และสามารถดึงชื่อกลับมาได้ตลอดเวลา
          </div>

          <div className={styles.tabsRow}>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === 'active' ? styles.tabBtnActive : ''
              }`}
              onClick={() => setActiveTab('active')}
            >
              <span>แสดงในตัวกรอง</span>
              <span className={styles.countPill}>{activeTeachers.length}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === 'backup' ? styles.tabBtnActive : ''
              }`}
              onClick={() => setActiveTab('backup')}
            >
              <span>รายชื่อที่ลบไป (Backup)</span>
              <span className={styles.countPill}>{backupTeachers.length}</span>
            </button>
          </div>

          <div className={styles.searchRow}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="พิมพ์ค้นหาชื่ออาจารย์..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {activeTab === 'backup' && backupTeachers.length > 0 && (
              <button
                type="button"
                className={styles.restoreAllBtn}
                onClick={onRestoreAll}
                disabled={saving}
              >
                ดึงกลับมาทั้งหมด
              </button>
            )}
          </div>

          <div className={styles.listWrap}>
            {filteredList.length === 0 ? (
              <div className={styles.emptyBox}>
                {searchText.trim()
                  ? 'ไม่พบรายชื่ออาจารย์ที่ตรงกับคำค้นหา'
                  : activeTab === 'active'
                  ? 'ไม่มีรายชื่ออาจารย์ในตัวกรองปัจจุบัน'
                  : 'ยังไม่มีรายชื่ออาจารย์ที่ถูกลบออกจากตัวกรอง'}
              </div>
            ) : (
              filteredList.map((item) => (
                <div key={item.name} className={styles.teacherRow}>
                  <div className={styles.teacherInfo}>
                    <span className={styles.teacherName}>{item.name}</span>
                    <span className={styles.teacherMeta}>
                      พบในประกาศงาน {item.jobCount} งาน
                    </span>
                  </div>

                  {item.isHidden ? (
                    <button
                      type="button"
                      className={styles.restoreBtn}
                      onClick={() => onRestoreTeacher(item.name)}
                      disabled={saving}
                    >
                      ดึงกลับมาแสดง
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.hideBtn}
                      onClick={() => onHideTeacher(item.name)}
                      disabled={saving}
                    >
                      ลบออกจากตัวกรอง
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
