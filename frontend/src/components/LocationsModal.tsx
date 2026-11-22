'use client';

import { useState, useMemo } from 'react';
import styles from './LocationsModal.module.css';

export interface LocationStatItem {
  location: string;
  jobs: number;
  hours: number;
  regs: number;
}

type SortByKey = 'jobs' | 'hours' | 'regs';

interface Props {
  isOpen: boolean;
  locations: LocationStatItem[];
  onClose: () => void;
}

export default function LocationsModal({ isOpen, locations, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortByKey>('jobs');

  const sortedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? locations.filter((l) => l.location.toLowerCase().includes(q))
      : [...locations];

    return list.sort((a, b) => {
      if (sortBy === 'hours') {
        return b.hours - a.hours || b.jobs - a.jobs || b.regs - a.regs;
      }
      if (sortBy === 'regs') {
        return b.regs - a.regs || b.jobs - a.jobs || b.hours - a.hours;
      }
      return b.jobs - a.jobs || b.hours - a.hours || b.regs - a.regs;
    });
  }, [locations, search, sortBy]);

  const totals = useMemo(() => {
    return sortedFiltered.reduce(
      (acc, l) => {
        acc.jobs += l.jobs;
        acc.hours += l.hours;
        acc.regs += l.regs;
        return acc;
      },
      { jobs: 0, hours: 0, regs: 0 }
    );
  }, [sortedFiltered]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.badgeTag}>สถิติสถานที่จัดกิจกรรมทั้งหมด</span>
            <h2>สถานที่ของกิจกรรม ({locations.length} แห่ง)</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.controlsRow}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="ค้นหาชื่อสถานที่..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.sortGroup}>
              <span className={styles.sortLabel}>เรียงจากมากไปน้อย</span>
              <button
                type="button"
                className={`${styles.sortBtn} ${sortBy === 'jobs' ? styles.sortBtnActive : ''}`}
                onClick={() => setSortBy('jobs')}
              >
                จำนวนกิจกรรม
              </button>
              <button
                type="button"
                className={`${styles.sortBtn} ${sortBy === 'hours' ? styles.sortBtnActive : ''}`}
                onClick={() => setSortBy('hours')}
              >
                ชั่วโมงทุน
              </button>
              <button
                type="button"
                className={`${styles.sortBtn} ${sortBy === 'regs' ? styles.sortBtnActive : ''}`}
                onClick={() => setSortBy('regs')}
              >
                ผู้เข้าร่วม
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            {sortedFiltered.length === 0 ? (
              <div className={styles.emptyBox}>ไม่พบสถานที่ที่ตรงกับคำค้นหา</div>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th className={styles.rankCol}>อันดับ</th>
                    <th>สถานที่ของกิจกรรม</th>
                    <th className={styles.numCol}>จำนวนกิจกรรม</th>
                    <th className={styles.numCol}>ชั่วโมงทุน</th>
                    <th className={styles.numCol}>ผู้เข้าร่วม</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFiltered.map((loc, idx) => (
                    <tr key={loc.location}>
                      <td className={styles.rankCol}>
                        <span
                          className={`${styles.rankBadge} ${
                            idx < 3 ? styles.rankTop : ''
                          }`}
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className={styles.locNameCell}>{loc.location}</td>
                      <td className={`${styles.numCol} ${styles.countPrimary}`}>
                        {loc.jobs.toLocaleString()} กิจกรรม
                      </td>
                      <td className={`${styles.numCol} ${styles.countHours}`}>
                        {loc.hours.toLocaleString()} ชม.
                      </td>
                      <td className={`${styles.numCol} ${styles.countRegs}`}>
                        {loc.regs.toLocaleString()} คน
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.summaryBar}>
            <span className={styles.summaryItem}>
              แสดง <strong>{sortedFiltered.length}</strong> สถานที่
            </span>
            <span className={styles.summaryItem}>
              รวมกิจกรรม <strong>{totals.jobs.toLocaleString()} กิจกรรม</strong>
            </span>
            <span className={styles.summaryItem}>
              รวมชั่วโมงทุน <strong>{totals.hours.toLocaleString()} ชม.</strong>
            </span>
            <span className={styles.summaryItem}>
              รวมผู้เข้าร่วม <strong>{totals.regs.toLocaleString()} คน</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
