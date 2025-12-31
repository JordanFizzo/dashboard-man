'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { Upload, TrendingUp, TrendingDown, Users, BookOpen, Award, AlertCircle, X, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

// Type definitions
interface ExcelRow {
  'User ID': number;
  'User First Name': string;
  'User Last Name': string;
  'User Email': string;
  'District': string;
  'User Status': string;
  'User Creation Date': string;
  'User last access date': string;
  'Curriculum Title (Transcript)': string;
  'Transcript Status Group': string;
  'Curriculum Completion Percentage': number;
}

interface Course {
  title: string;
  completion: number;
  status: string;
}

interface LearnerProgress {
  id: number;
  name: string;
  email: string;
  district: string;
  courses: Course[];
  totalCompletion: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

interface Learner extends LearnerProgress {
  avgCompletion: number;
  level: string;
  week1Avg?: number;
  week2Avg?: number;
  recentAvgs?: Array<number | null>;
}

interface MonthlyData {
  month: string;
  learners: number;
  avg: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

interface Snapshot {
  name: string;
  rows: ExcelRow[];
}

interface Analytics {
  totalLearners: number;
  improvedLearners: number;
  supportNeeded: Learner[];
  improvedList: Learner[];
  supportList: Learner[];
  failedStudents: Learner[];
  finishedStudents: Learner[];
  consistentCompleters: Learner[];
  averageCompletion: number;
  learners: Learner[];
  monthlyData: MonthlyData[];
}

const LearningDashboard = () => {
  const [data, setData] = useState<ExcelRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listModalType, setListModalType] = useState<'improved' | 'support' | 'total' | 'average' | 'failed' | 'none'>('none');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(null);
  const [modalFull, setModalFull] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [csvColumnsOption, setCsvColumnsOption] = useState<'compact' | 'detailed'>('compact');
  const [importSummary, setImportSummary] = useState<{ files: number; rowsAdded: number; totalRows: number } | null>(null);
  const importSummaryTimerRef = useRef<number | null>(null);

  // Normalize row data coming from XLSX or localStorage: ensure numeric IDs and completion
  const normalizeRow = (r: any): ExcelRow => ({
    'User ID': Number(r['User ID']) || 0,
    'User First Name': String(r['User First Name'] ?? '').trim(),
    'User Last Name': String(r['User Last Name'] ?? '').trim(),
    'User Email': String(r['User Email'] ?? '').trim(),
    'District': String(r['District'] ?? '').trim(),
    'User Status': String(r['User Status'] ?? '').trim(),
    'User Creation Date': String(r['User Creation Date'] ?? ''),
    'User last access date': String(r['User last access date'] ?? ''),
    'Curriculum Title (Transcript)': String(r['Curriculum Title (Transcript)'] ?? '').trim(),
    'Transcript Status Group': String(r['Transcript Status Group'] ?? '').trim(),
    'Curriculum Completion Percentage': Number(r['Curriculum Completion Percentage']) || 0
  });

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    const combinedRows: ExcelRow[] = [];
    const newSnapshots: Snapshot[] = [...snapshots];

    try {
      for (const file of Array.from(fileList)) {
        let workbook: XLSX.WorkBook;
        if (file.name.toLowerCase().endsWith('.csv')) {
          const text = await file.text();
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          workbook = XLSX.read(uint8Array, { type: 'array' });
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = (XLSX.utils.sheet_to_json(worksheet) as ExcelRow[]).map(r => normalizeRow(r));
        const baseName = file.name ? file.name.replace(/\.[^.]+$/, '') : `Report ${newSnapshots.length + 1}`;
        newSnapshots.push({ name: baseName, rows: jsonData });
        combinedRows.push(...jsonData);
      }

      // set snapshots and flattened data
      setSnapshots(newSnapshots);
      const newData = newSnapshots.flatMap(s => s.rows);
      setData(newData);

      // show import summary
      const rowsAdded = combinedRows.length;
      const filesCount = fileList.length;
      setImportSummary({ files: filesCount, rowsAdded, totalRows: newData.length });

      // clear any existing timer
      if (importSummaryTimerRef.current) {
        window.clearTimeout(importSummaryTimerRef.current);
      }
      importSummaryTimerRef.current = window.setTimeout(() => setImportSummary(null), 6000);

      // localStorage saving handled by effect watching `snapshots`
    } catch (error) {
      console.error('Error importing files:', error);
      alert('Error importing files. Please ensure they\'re valid Excel/CSV files.');
    }
  };

  const analytics = useMemo((): Analytics | null => {
    if (!snapshots || snapshots.length === 0) return null;

    // Use last snapshot for current learner metrics
    const lastSnapshot = snapshots[snapshots.length - 1];
    const last = lastSnapshot.rows;
    const totalLearners = new Set(last.map(row => row['User ID'])).size;

    const learnerProgress: Record<number, LearnerProgress> = {};
    last.forEach(row => {
      const userId = row['User ID'];
      const completion = parseFloat(String(row['Curriculum Completion Percentage'])) || 0;

      if (!learnerProgress[userId]) {
        learnerProgress[userId] = {
          id: userId,
          name: `${row['User First Name']} ${row['User Last Name']}`,
          email: row['User Email'],
          district: row['District'],
          courses: [],
          totalCompletion: 0,
          completed: 0,
          inProgress: 0,
          notStarted: 0
        };
      }

      learnerProgress[userId].courses.push({
        title: row['Curriculum Title (Transcript)'],
        completion,
        status: row['Transcript Status Group']
      });

      learnerProgress[userId].totalCompletion += completion;

      if (completion >= 100) learnerProgress[userId].completed++;
      else if (completion >= 1 && completion < 100) learnerProgress[userId].inProgress++;
      else learnerProgress[userId].notStarted++;
    });

    const learners: Learner[] = Object.values(learnerProgress).map(learner => ({
      ...learner,
      avgCompletion: learner.courses.length > 0
        ? Math.round(learner.totalCompletion / learner.courses.length)
        : 0,
      level: learner.completed >= 3 ? 'Advanced' : learner.completed >= 1 ? 'Intermediate' : 'Beginner'
    }));

    // Comparisons between first and second snapshot (week1 vs week2)
    let improvedList: Learner[] = [];
    let supportList: Learner[] = [];
    // compare the two most recent snapshots (previous vs current)
    if (snapshots.length >= 2) {
      const snapPrev = snapshots[snapshots.length - 2];
      const snapCurr = snapshots[snapshots.length - 1];
      const snap1 = snapPrev.rows;
      const snap2 = snapCurr.rows;

      const avgMap = (arr: ExcelRow[]) => {
        const map: Record<number, { total: number; count: number }> = {};
        arr.forEach(r => {
          const id = r['User ID'];
          const val = parseFloat(String(r['Curriculum Completion Percentage'])) || 0;
          if (!map[id]) map[id] = { total: 0, count: 0 };
          map[id].total += val;
          map[id].count += 1;
        });
        const avg: Record<number, number> = {};
        Object.keys(map).forEach(k => {
          const n = Number(k);
          avg[n] = Math.round(map[n].total / Math.max(1, map[n].count));
        });
        return avg;
      };

      // Build average maps for every snapshot so we can show the last 4 report values
      const avgMaps = snapshots.map(s => avgMap(s.rows));

      const a1 = avgMap(snap1);
      const a2 = avgMap(snap2);

      const allIds = new Set<number>([...avgMaps.flatMap(m => Object.keys(m).map(Number))]);

      const findRowAcrossSnapshots = (searchId: number) => {
        for (let i = snapshots.length - 1; i >= 0; i--) {
          const r = snapshots[i].rows.find(rr => Number(rr['User ID']) === Number(searchId));
          if (r) return r;
        }
        return undefined;
      };

      allIds.forEach(id => {
        const v1 = a1[id] ?? 0;
        const v2 = a2[id] ?? 0;

        // compute last up-to-4 recent averages (oldest->newest)
        const startIdx = Math.max(0, snapshots.length - 4);
        const recentAvgs: Array<number | null> = [];
        for (let i = startIdx; i < snapshots.length; i++) {
          const map = avgMaps[i] ?? {};
          recentAvgs.push(map[id] ?? null);
        }

        // Prefer the fully-built learner from `learners` (based on last snapshot)
        const existing = learners.find(l => l.id === id);
        if (existing) {
          const enriched: Learner = { ...existing, week1Avg: v1, week2Avg: v2, avgCompletion: v2, recentAvgs };
          if (v1 < v2) improvedList.push(enriched);
          else if (v1 === v2) supportList.push(enriched);
          return;
        }

        // Fallback: build learner details from rows across snapshots
        const rowSource = findRowAcrossSnapshots(id);
        const rowsForId: ExcelRow[] = [];
        // collect rows from current and previous snapshots first
        rowsForId.push(...snap2.filter(r => Number(r['User ID']) === Number(id)));
        rowsForId.push(...snap1.filter(r => Number(r['User ID']) === Number(id)));

        const courses: Course[] = rowsForId.map(r => ({
          title: r['Curriculum Title (Transcript)'],
          completion: parseFloat(String(r['Curriculum Completion Percentage'])) || 0,
          status: r['Transcript Status Group']
        }));

        const totalCompletion = courses.reduce((s, c) => s + c.completion, 0);
        const completed = courses.filter(c => c.completion >= 100).length;
        const inProgress = courses.filter(c => c.completion >= 1 && c.completion < 100).length;
        const notStarted = courses.filter(c => c.completion < 1).length;

        const base: Learner = {
          id,
          name: rowSource ? `${rowSource['User First Name']} ${rowSource['User Last Name']}` : String(id),
          email: rowSource ? rowSource['User Email'] : '',
          district: rowSource ? rowSource['District'] : '',
          courses,
          totalCompletion,
          completed,
          inProgress,
          notStarted,
          avgCompletion: v2,
          week1Avg: v1,
          week2Avg: v2,
          level: '',
          recentAvgs
        };

        if (v1 < v2) improvedList.push(base);
        else if (v1 === v2) supportList.push(base);
      });
    }

    const improvedLearners = improvedList.length;
    const supportNeeded = supportList;
    const failedStudents = learners.filter(l => l.avgCompletion < 25 && l.inProgress > 0);
    const averageCompletion = learners.length > 0 ? Math.round(
      learners.reduce((sum, l) => sum + l.avgCompletion, 0) / learners.length
    ) : 0;

    // Finished students: learners who have >=100% in at least two snapshots
    const finishedStudents: Learner[] = [];
    const consistentCompleters: Learner[] = [];
    if (snapshots.length > 0) {
      // build per-snapshot avg maps
      const avgMapsAll = snapshots.map(snap => {
        const m: Record<number, number> = {};
        const tmp: Record<number, { total: number; count: number }> = {};
        snap.rows.forEach(r => {
          const id = Number(r['User ID']);
          const val = parseFloat(String(r['Curriculum Completion Percentage'])) || 0;
          if (!tmp[id]) tmp[id] = { total: 0, count: 0 };
          tmp[id].total += val;
          tmp[id].count += 1;
        });
        Object.keys(tmp).forEach(k => { const n = Number(k); m[n] = Math.round(tmp[n].total / Math.max(1, tmp[n].count)); });
        return m;
      });

      const learnerIds = new Set(learners.map(l => l.id));
      learnerIds.forEach(id => {
        let count100 = 0;
        for (const m of avgMapsAll) {
          if ((m[id] ?? 0) >= 100) count100++;
        }
        if (count100 >= 2) {
          const existing = learners.find(l => l.id === id);
          if (existing) {
            finishedStudents.push({ ...existing });
            consistentCompleters.push({ ...existing });
          }
        }
      });

      // Exclude finished/consistent students from support list so they don't show as needing support
      if (finishedStudents.length > 0) {
        const finishedIds = new Set(finishedStudents.map(f => f.id));
        supportList = supportList.filter(s => !finishedIds.has(s.id));
      }
    }

    // Monthly / per-report data built from snapshots sequence (Report 1 = first uploaded)
    const monthlyData: MonthlyData[] = snapshots.map((snap, idx) => {
      const perLearner: Record<number, { total: number; count: number }> = {};
      snap.rows.forEach(r => {
        const id = r['User ID'];
        const val = parseFloat(String(r['Curriculum Completion Percentage'])) || 0;
        if (!perLearner[id]) perLearner[id] = { total: 0, count: 0 };
        perLearner[id].total += val;
        perLearner[id].count += 1;
      });
      const learnerAvgs = Object.values(perLearner).map(p => Math.round(p.total / Math.max(1, p.count)));
      const counts = { completed: 0, inProgress: 0, notStarted: 0 };
      learnerAvgs.forEach(avg => {
        if (avg >= 100) counts.completed++;
        else if (avg >= 1 && avg < 100) counts.inProgress++;
        else counts.notStarted++;
      });
      const avg = learnerAvgs.length > 0 ? Math.round(learnerAvgs.reduce((s, v) => s + v, 0) / learnerAvgs.length) : 0;
      const label = snap.name || `Week ${idx + 1}`;
      return { month: label, learners: learnerAvgs.length, avg, completed: counts.completed, inProgress: counts.inProgress, notStarted: counts.notStarted };
    });

    return {
      totalLearners,
      improvedLearners,
      supportNeeded,
      improvedList,
      supportList,
      failedStudents,
      finishedStudents,
      consistentCompleters,
      averageCompletion,
      learners,
      monthlyData
    };
  }, [snapshots]);

  const charts = useMemo(() => {
    if (!analytics) return null;
    const labels = analytics.monthlyData.map(m => m.month);
    const learnersDataset = analytics.monthlyData.map(m => m.learners);
    const avgDataset = analytics.monthlyData.map(m => m.avg);

    const barData = {
      labels,
      datasets: [
        {
          label: 'Learners',
          data: learnersDataset,
          backgroundColor: 'rgba(59,130,246,0.8)'
        }
      ]
    };

    const lineData = {
      labels,
      datasets: [
        {
          label: 'Average Progress',
          data: avgDataset,
          borderColor: 'rgba(16,185,129,0.95)',
          backgroundColor: 'rgba(16,185,129,0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 4
        }
      ]
    };

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true }
      }
    };

    return { barData, lineData, barOptions: commonOptions, lineOptions: commonOptions };
  }, [analytics]);

  useEffect(() => {
    if (!listModalOpen) setModalFull(false);
  }, [listModalOpen]);

  // Chart month selection mode: 'all' | 'range' | 'single'
  const [chartMode, setChartMode] = useState<'all' | 'range' | 'single'>('all');
  const [monthFrom, setMonthFrom] = useState<number>(0);
  const [monthTo, setMonthTo] = useState<number>(0);
  const [singleMonth, setSingleMonth] = useState<number>(0);

  useEffect(() => {
    if (!analytics) return;
    const last = analytics.monthlyData.length - 1;
    setMonthFrom(0);
    setMonthTo(last);
    setSingleMonth(last);
    setChartMode('all');
  }, [analytics]);

  // Load saved data from localStorage on mount
  useEffect(() => {
    try {
      // Prefer snapshots storage (array of {name, rows}). Fallback to older flat data key or older snapshots shape.
      const rawSnapshots = localStorage.getItem('learning_dashboard_snapshots');
      if (rawSnapshots) {
        const parsed = JSON.parse(rawSnapshots) as any[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // detect if old format (array of arrays) and normalize
          if (Array.isArray(parsed[0])) {
            const norm: Snapshot[] = (parsed as ExcelRow[][]).map((rows, i) => ({ name: `Week ${i+1}`, rows: (rows || []).map(normalizeRow) }));
            setSnapshots(norm);
            setData(norm.flatMap(s => s.rows));
            return;
          }
          // new format: array of {name, rows}
          const safe = (parsed as Snapshot[]).map(p => ({ name: p.name ?? 'Report', rows: (p.rows ?? []).map(normalizeRow) }));
          setSnapshots(safe);
          setData(safe.flatMap(s => s.rows));
          return;
        }
      }

      const raw = localStorage.getItem('learning_dashboard_data');
      if (raw) {
        const parsed = JSON.parse(raw) as ExcelRow[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // convert to a single snapshot for compatibility
          const single: Snapshot = { name: 'Week 1', rows: parsed.map(normalizeRow) };
          setSnapshots([single]);
          setData(single.rows);
        }
      }
    } catch (err) {
      console.warn('Failed to load saved dashboard data', err);
    }
  }, []);

  useEffect(() => {
    try {
      if (snapshots && snapshots.length > 0) {
        localStorage.setItem('learning_dashboard_snapshots', JSON.stringify(snapshots));
      } else {
        localStorage.removeItem('learning_dashboard_snapshots');
        localStorage.removeItem('learning_dashboard_data');
      }
    } catch (err) {
      console.warn('Failed to save dashboard snapshots', err);
    }
  }, [snapshots]);

  const chartsWithRange = useMemo(() => {
    if (!analytics) return null;
    let visible: MonthlyData[] = analytics.monthlyData;
    if (chartMode === 'single') {
      const idx = Math.max(0, Math.min(singleMonth, analytics.monthlyData.length - 1));
      visible = [analytics.monthlyData[idx]];
    } else if (chartMode === 'range') {
      const a = Math.max(0, Math.min(monthFrom, analytics.monthlyData.length - 1));
      const b = Math.max(0, Math.min(monthTo, analytics.monthlyData.length - 1));
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      visible = analytics.monthlyData.slice(start, end + 1);
    } else {
      // 'all'
      visible = analytics.monthlyData;
    }

    const labels = visible.map(m => m.month);
    const learnersDataset = visible.map(m => m.learners);
    const avgDataset = visible.map(m => m.avg);

    const completedDataset = visible.map(m => (m as MonthlyData).completed ?? 0);
    const inProgressDataset = visible.map(m => (m as MonthlyData).inProgress ?? 0);
    const notStartedDataset = visible.map(m => (m as MonthlyData).notStarted ?? 0);

    const barData = {
      labels,
      datasets: [
        {
          label: 'Completed (100%)',
          data: completedDataset,
          backgroundColor: 'rgba(16,185,129,0.95)',
          borderRadius: 10,
          borderSkipped: false
        },
        {
          label: 'In Progress (1-99%)',
          data: inProgressDataset,
          backgroundColor: 'rgba(59,130,246,0.9)',
          borderRadius: 10,
          borderSkipped: false
        },
        {
          label: 'Not Started (0%)',
          data: notStartedDataset,
          backgroundColor: 'rgba(149, 48, 255, 0.95)',
          borderRadius: 10,
          borderSkipped: false
        }
      ]
    };
    const lineData = {
      labels,
      datasets: [
        {
          label: 'Average Progress',
          data: avgDataset,
          borderColor: 'rgba(16,185,129,0.95)',
          backgroundColor: 'rgba(16,185,129,0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 4
        }
      ]
    };

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      elements: {
        bar: {
          borderRadius: 10,
          borderSkipped: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          stacked: false,
          ticks: { maxRotation: 0, autoSkip: false },
          // controls bar width
          categoryPercentage: 0.6,
          barPercentage: 0.85
        },
        y: { beginAtZero: true, stacked: false }
      }
    };

    return { barData, lineData, barOptions: commonOptions, lineOptions: commonOptions };
  }, [analytics, chartMode, monthFrom, monthTo, singleMonth]);

  const getFullMonthName = (abbr: string) => {
    const map: Record<string,string> = {
      Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
      Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December'
    };
    return map[abbr] ?? abbr;
  };

  const getShortMonthName = (month: string) => {
    // If already short (3 chars), return as-is. Otherwise map full name to 3-letter abbr.
    if (month.length <= 3) return month;
    const map: Record<string,string> = {
      January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
      July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec'
    };
    return map[month] ?? month.slice(0,3);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-green-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Learning Analytics Dashboard</h1>
          <p className="text-gray-600">Track and monitor learner progress and performance</p>
        </div>

        {/* Import Button */}
        <div className="mb-6 flex items-center gap-3">
          <label className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-all shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-300">
            <Upload className="w-5 h-5 mr-2 text-white" />
            <span className="font-semibold">Import Files</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              onChange={handleFileImport}
              className="hidden"
            />
          </label>

          <button
            className="px-3 py-2 bg-red-50 text-red-700 rounded-md border border-red-100 text-sm"
            onClick={() => {
              // Clear stored data and state
              try {
                localStorage.removeItem('learning_dashboard_snapshots');
                localStorage.removeItem('learning_dashboard_data');
              } catch (err) {
                console.warn('Failed to remove stored data', err);
              }
              setData([]);
              setSnapshots([]);
              // show cleared summary
              setImportSummary({ files: 0, rowsAdded: 0, totalRows: 0 });
              if (importSummaryTimerRef.current) window.clearTimeout(importSummaryTimerRef.current as any);
              importSummaryTimerRef.current = window.setTimeout(() => setImportSummary(null), 4000);
            }}
          >
            Clear Stored Data
          </button>
        </div>

        {/* Import summary banner */}
        {importSummary && (
          <div className="mb-6 max-w-7xl mx-auto">
            <div className={`flex items-center justify-between rounded-lg px-4 py-2 shadow ${importSummary.files === 0 && importSummary.rowsAdded === 0 ? 'bg-gray-800 text-white' : 'bg-green-600 text-white'}`}>
              <div>
                {importSummary.files === 0 && importSummary.rowsAdded === 0 ? (
                  <p className="text-sm font-semibold">Stored data cleared</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold">Imported {importSummary.files} file{importSummary.files > 1 ? 's' : ''} — {importSummary.rowsAdded} row{importSummary.rowsAdded !== 1 ? 's' : ''} added</p>
                    <p className="text-xs opacity-80">Total rows: {importSummary.totalRows}</p>
                  </>
                )}
              </div>
              <div>
                <button
                  className="text-white opacity-90 hover:opacity-100"
                  onClick={() => {
                    setImportSummary(null);
                    if (importSummaryTimerRef.current) window.clearTimeout(importSummaryTimerRef.current as any);
                  }}
                  aria-label="Dismiss import summary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {analytics ? (
          <>
            {/* Stats Cards */}
            <div className="flex flex-row gap-6 mb-8 flex-wrap md:flex-nowrap">
              <div
                className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-600 cursor-pointer hover:scale-105 transform transition-all duration-150 flex-1 min-w-0 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('total');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Total Learners</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{analytics.totalLearners}</p>
                  </div>
                  <Users className="w-12 h-12 text-blue-600 opacity-80" />
                </div>
              </div>

              <div
                className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-600 cursor-pointer hover:scale-105 transform transition-all duration-150 flex-1 min-w-0 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('improved');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Improved Learners</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{analytics.improvedLearners}</p>
                  </div>
                  <TrendingUp className="w-12 h-12 text-green-600 opacity-80" />
                </div>
              </div>

              <div
                className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-yellow-600 cursor-pointer hover:scale-105 transform transition-all duration-150 flex-1 min-w-0 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('support');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Need Support</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{analytics.supportNeeded.length}</p>
                  </div>
                  <AlertCircle className="w-12 h-12 text-yellow-600 opacity-80" />
                </div>
              </div>

              <div
                className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-teal-600 cursor-pointer hover:scale-105 transform transition-all duration-150 flex-1 min-w-0 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('finished');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Finished Learners</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{analytics.finishedStudents.length}</p>
                  </div>
                  <Award className="w-12 h-12 text-teal-600 opacity-80" />
                </div>
              </div>

              {/* Consistent Completers card removed per request */}

              <div
                className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-600 cursor-pointer hover:scale-105 transform transition-all duration-150 flex-1 min-w-0 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('reports');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Total Reports</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{snapshots.length}</p>
                  </div>
                  <Award className="w-12 h-12 text-purple-600 opacity-80" />
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Monthly Overview (Bar chart) */}
              <div className="bg-white rounded-xl shadow-lg p-6 card-appear card-hover-transition">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Monthly Overview</h3>
                {/* Month selector controls (All / Range / Single) */}
                {analytics && (
                  <div className="mb-3 flex flex-col md:flex-row items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        className={`px-3 py-1 rounded-md text-sm ${chartMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`}
                        onClick={() => setChartMode('all')}
                      >
                        All
                      </button>
                      <button
                        className={`px-3 py-1 rounded-md text-sm ${chartMode === 'range' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`}
                        onClick={() => setChartMode('range')}
                      >
                        Range
                      </button>
                      <button
                        className={`px-3 py-1 rounded-md text-sm ${chartMode === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`}
                        onClick={() => setChartMode('single')}
                      >
                        Single
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">From</label>
                      <select
                        value={monthFrom}
                        onChange={(e) => setMonthFrom(Number(e.target.value))}
                        disabled={chartMode !== 'range'}
                        className="px-2 py-1 border rounded-md text-xs md:text-sm w-full md:w-auto md:min-width-[90px] bg-white text-black border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 leading-tight"
                      >
                        {analytics.monthlyData.map((m, idx) => (
                          <option key={m.month} value={idx} title={getFullMonthName(m.month)}>{getShortMonthName(m.month)}</option>
                        ))}
                      </select>

                      <label className="text-sm text-gray-600">To</label>
                      <select
                        value={monthTo}
                        onChange={(e) => setMonthTo(Number(e.target.value))}
                        disabled={chartMode !== 'range'}
                        className="px-2 py-1 border rounded-md text-xs md:text-sm w-full md:w-auto md:min-width-[90px] bg-white text-black border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 leading-tight"
                      >
                        {analytics.monthlyData.map((m, idx) => (
                          <option key={m.month} value={idx} title={getFullMonthName(m.month)}>{getShortMonthName(m.month)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 md:ml-auto w-full md:w-auto">
                      <label className="text-sm text-gray-600">Month</label>
                      <select
                        value={singleMonth}
                        onChange={(e) => setSingleMonth(Number(e.target.value))}
                        disabled={chartMode !== 'single'}
                        className="px-2 py-1 border rounded-md text-xs md:text-sm w-full md:w-auto md:min-width-[90px] bg-white text-black border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 leading-tight"
                      >
                        {analytics.monthlyData.map((m, idx) => (
                          <option key={m.month} value={idx} title={getFullMonthName(m.month)}>{getShortMonthName(m.month)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="h-64">
                  {chartsWithRange ? (
                    <Bar data={chartsWithRange.barData} options={chartsWithRange.barOptions} />
                  ) : (
                    <div className="text-center text-sm text-gray-500">No chart data</div>
                  )}
                </div>
              </div>

              {/* Progress Trend (Line chart) */}
              <div className="bg-white rounded-xl shadow-lg p-6 card-appear card-hover-transition">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Average Progress Trend</h3>
                <div className="h-64">
                  {chartsWithRange ? (
                    <Line data={chartsWithRange.lineData} options={chartsWithRange.lineOptions} />
                  ) : (
                    <div className="text-center text-sm text-gray-500">No chart data</div>
                  )}
                </div>
              </div>
            </div>

            {/* Trends Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div
                className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:scale-105 transform transition-all duration-150 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('improved');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center mb-4">
                  <TrendingUp className="w-6 h-6 text-green-600 mr-2" />
                  <h3 className="text-lg font-bold text-gray-800">Improved Students</h3>
                </div>
                <p className="text-3xl font-bold text-green-600">{analytics.improvedLearners}</p>
                <p className="text-sm text-gray-600 mt-2">Completion ≥ 75%</p>
              </div>

              <div
                className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:scale-105 transform transition-all duration-150 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('failed');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center mb-4">
                  <TrendingDown className="w-6 h-6 text-red-600 mr-2" />
                  <h3 className="text-lg font-bold text-gray-800">Failed Students</h3>
                </div>
                <p className="text-3xl font-bold text-red-600">{analytics.failedStudents.length}</p>
                <p className="text-sm text-gray-600 mt-2">Completion &lt; 25%</p>
              </div>

              <div
                className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:scale-105 transform transition-all duration-150 card-appear card-hover-transition"
                role="button"
                onClick={() => {
                  if (analytics) {
                    setListModalType('average');
                    setListModalOpen(true);
                  }
                }}
              >
                <div className="flex items-center mb-4">
                  <BookOpen className="w-6 h-6 text-blue-600 mr-2" />
                  <h3 className="text-lg font-bold text-gray-800">Average Score</h3>
                </div>
                <p className="text-3xl font-bold text-blue-600">{analytics.averageCompletion}%</p>
                <p className="text-sm text-gray-600 mt-2">All students</p>
              </div>
            </div>

            {/* Tables removed from main view — open via the list buttons above */}
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Upload className="w-20 h-20 text-gray-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-800 mb-2">No Data Available</h3>
            <p className="text-gray-600">Please import an Excel file to view the analytics dashboard</p>
          </div>
        )}

        {/* List Modal (Improved / Support) */}
        {analytics && listModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black opacity-40" onClick={() => { setListModalOpen(false); setModalFull(false); }} />
            <div className={
              `relative bg-white shadow-lg w-full mx-4 md:mx-0 p-4 md:p-6 z-10 transform transition-all duration-200 ease-out card-appear ` +
              (modalFull
                ? 'h-full max-w-none rounded-none overflow-auto'
                : 'rounded-lg max-w-5xl max-h-[90vh] overflow-auto')
            }>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">
                  {listModalType === 'improved' ? 'Improved Learners' :
                   listModalType === 'support' ? 'Learners Needing Support' :
                   listModalType === 'total' ? 'All Learners' :
                     listModalType === 'average' ? 'Learners by Average Progress' :
                     listModalType === 'failed' ? 'Failed Students' :
                     listModalType === 'finished' ? 'Finished Learners' :
                     listModalType === 'reports' ? 'Uploaded Reports' : ''}
                </h3>
                {(listModalType === 'improved' || listModalType === 'support') && (
                  <div className="text-xs text-gray-500">
                    {snapshots.length >= 2 ? (
                      <>Comparing: {snapshots[snapshots.length - 2].name} → {snapshots[snapshots.length - 1].name}</>
                    ) : (
                      <>Comparing: Week1 → Week2 (upload two reports)</>
                    )}
                  </div>
                )}
                {listModalType === 'reports' && (
                  <div className="text-xs text-gray-500">Manage uploaded reports — delete any report you no longer need.</div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    className={`px-3 py-1 text-sm font-semibold rounded-md transition-shadow ${modalFull ? 'bg-blue-600 text-white shadow-md' : 'bg-blue-50 text-blue-700'}`}
                    onClick={() => setModalFull(f => !f)}
                    aria-label="Toggle full modal"
                    title={modalFull ? 'Exit full view' : 'Enter full view'}
                  >
                    {modalFull ? 'Exit Full' : 'Full'}
                  </button>
                  <button
                    className="text-gray-600 hover:text-gray-800 p-2 rounded-md"
                    onClick={() => { setListModalOpen(false); setModalFull(false); }}
                    aria-label="Close list modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1 w-full">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search name, id or email"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-10 py-2 border rounded-xl text-sm w-full shadow-sm bg-white border-blue-100 text-black placeholder-gray-400 caret-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-blue-600 hover:text-blue-800 p-1"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as any)}
                    className="px-2 py-2 border rounded-md text-sm bg-white border-blue-100 text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    aria-label="Sort key"
                  >
                    <option value="name">Name</option>
                    <option value="id">ID</option>
                    <option value="avg">Avg</option>
                  </select>
                  <button
                    className="px-2 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 text-sm"
                    onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                    aria-label="Toggle sort direction"
                  >
                    {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                  </button>
                  <select
                    value={csvColumnsOption}
                    onChange={(e) => setCsvColumnsOption(e.target.value as any)}
                    className="px-2 py-2 border rounded-md text-sm bg-white border-blue-100 text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    title="CSV columns"
                  >
                    <option value="compact">CSV: Compact</option>
                    <option value="detailed">CSV: Detailed</option>
                  </select>
                  <button
                    className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm"
                    onClick={() => {
                      // export selected or all if none selected
                      const exportList = ((): Learner[] => {
                        if (!analytics) return [];
                        let list: Learner[] = [];
                        if (listModalType === 'improved') list = analytics.improvedList;
                        else if (listModalType === 'support') list = analytics.supportList;
                        else if (listModalType === 'total') list = analytics.learners;
                        else if (listModalType === 'average') list = [...analytics.learners].sort((a,b) => b.avgCompletion - a.avgCompletion);
                        else if (listModalType === 'failed') list = analytics.failedStudents;
                        // if specific selections exist, filter
                        if (selectedIds.length > 0) return list.filter(l => selectedIds.includes(l.id));
                        return list;
                      })();

                      if (exportList.length === 0) {
                        alert('No learners to export');
                        return;
                      }

                      // prepare recent report names (up to 4)
                      const start = Math.max(0, snapshots.length - 4);
                      const recentNames: string[] = [];
                      for (let i = 0; i < 4; i++) {
                        const s = snapshots[start + i];
                        recentNames.push(s ? s.name : `Report ${start + i + 1}`);
                      }

                      const rows = exportList.map(l => {
                        const rowBase: Record<string, any> = {
                          id: l.id,
                          name: l.name,
                          email: l.email
                        };

                        // attach recent values
                        for (let i = 0; i < recentNames.length; i++) {
                          const key = recentNames[i];
                          const val = (l.recentAvgs && l.recentAvgs[i] != null) ? l.recentAvgs[i] : '';
                          rowBase[key] = val !== '' ? `${val}%` : '';
                        }

                        // compute delta (first non-empty -> last non-empty)
                        let first: number | null = null;
                        let last: number | null = null;
                        const recent = l.recentAvgs || [];
                        for (let v of recent) if (v != null) { first = v; break; }
                        for (let i = recent.length - 1; i >= 0; i--) if (recent[i] != null) { last = recent[i] as number; break; }
                        rowBase['Δ'] = (first != null && last != null) ? `${last - first}%` : '';

                        if (csvColumnsOption === 'compact') {
                          // compact includes id, name, email, recent columns, Δ
                          return rowBase;
                        }

                        // detailed adds more metadata
                        return {
                          ...rowBase,
                          district: l.district,
                          level: l.level,
                          avgCompletion: l.avgCompletion != null ? `${l.avgCompletion}%` : '',
                          courses: l.courses.map(c => `${c.title} (${c.status} - ${c.completion}%)`).join(' | ')
                        };
                      });

                      const header = Object.keys(rows[0]);
                      const csv = [header.map(h => `"${String(h).replace(/"/g,'""')}"`).join(',')].concat(rows.map(r => header.map(h => `"${String((r as any)[h] ?? '').replace(/"/g,'""')}"`).join(','))).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `learners_export_${Date.now()}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export CSV
                  </button>
                  <label className="text-sm text-gray-600">Selected: {selectedIds.length}</label>
                </div>
              </div>

              {listModalType === 'reports' ? (
                <div className="max-h-[60vh] md:max-h-[65vh] overflow-y-auto p-2">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-600">
                        <th className="py-2">#</th>
                        <th className="py-2">Report Name</th>
                        <th className="py-2">Rows</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.map((s, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="py-2 text-sm text-gray-600">{idx + 1}</td>
                          <td className="py-2 text-sm font-medium text-gray-800">{s.name}</td>
                          <td className="py-2 text-sm text-gray-600">{s.rows.length}</td>
                          <td className="py-2 text-sm">
                            <button
                              className="px-2 py-1 text-sm bg-red-50 text-red-700 rounded-md border border-red-100 hover:bg-red-100"
                              onClick={() => {
                                const ok = confirm(`Delete report "${s.name}"? This cannot be undone.`);
                                if (!ok) return;
                                setSnapshots(prev => prev.filter((_, i) => i !== idx));
                                setData(prev => prev.filter(row => !s.rows.includes(row)));
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="max-h-[60vh] md:max-h-[65vh] overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-600">
                        <th className="py-2 w-8">
                          <input
                            type="checkbox"
                              checked={(() => {
                              if (!analytics) return false;
                              let list: Learner[] = [];
                              if (listModalType === 'improved') list = analytics.improvedList;
                              else if (listModalType === 'support') list = analytics.supportList;
                              else if (listModalType === 'total') list = analytics.learners;
                              else if (listModalType === 'average') list = [...analytics.learners].sort((a,b) => b.avgCompletion - a.avgCompletion);
                              else if (listModalType === 'failed') list = analytics.failedStudents;
                              if (list.length === 0) return false;
                              return selectedIds.length === list.length;
                            })()
                            }
                            onChange={(e) => {
                              if (!analytics) return;
                              let list: Learner[] = [];
                              if (listModalType === 'improved') list = analytics.improvedList;
                              else if (listModalType === 'support') list = analytics.supportList;
                              else if (listModalType === 'total') list = analytics.learners;
                              else if (listModalType === 'average') list = [...analytics.learners].sort((a,b) => b.avgCompletion - a.avgCompletion);
                              else if (listModalType === 'failed') list = analytics.failedStudents;
                              if (e.target.checked) setSelectedIds(list.map(l => l.id));
                              else setSelectedIds([]);
                            }}
                          />
                        </th>
                        <th className="py-2">#</th>
                        <th className="py-2 cursor-pointer hover:text-blue-600" onClick={() => { setSortKey('name'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}>Name</th>
                        <th className="py-2 cursor-pointer hover:text-blue-600" onClick={() => { setSortKey('id'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}>ID</th>
                        {(listModalType === 'improved' || listModalType === 'support') ? (
                          <>
                              {(() => {
                                const start = Math.max(0, snapshots.length - 4);
                                return [0,1,2,3].map(i => {
                                  const absIdx = start + i;
                                  const s = snapshots[absIdx];
                                  const key = `report:${absIdx}`;
                                  const isActive = sortKey === key;
                                  return (
                                    <th
                                      className={`py-2 cursor-pointer ${isActive ? 'text-blue-700 font-semibold' : ''}`}
                                      key={i}
                                      onClick={() => { setSortKey(key); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}
                                      title={`Sort by ${s ? s.name : 'report'}`}
                                    >
                                      {s ? s.name : '—'} {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                    </th>
                                  );
                                });
                              })()}
                            <th className="py-2">Δ</th>
                          </>
                        ) : (
                          <th className="py-2">Avg</th>
                        )}
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        if (!analytics) return null;
                        let list: Learner[] = [];
                        if (listModalType === 'improved') list = analytics.improvedList;
                        else if (listModalType === 'support') list = analytics.supportList;
                        else if (listModalType === 'total') list = analytics.learners;
                        else if (listModalType === 'average') list = [...analytics.learners];
                        else if (listModalType === 'failed') list = analytics.failedStudents;
                        else if (listModalType === 'finished') list = analytics.finishedStudents;

                        const filtered = list.filter(l => {
                          if (!searchTerm) return true;
                          const term = searchTerm.toLowerCase();
                          return (`${l.name}`.toLowerCase().includes(term) || String(l.id).includes(term) || l.email.toLowerCase().includes(term));
                        });

                        const sorted = filtered.sort((a,b) => {
                          const dir = sortDirection === 'asc' ? 1 : -1;
                          if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
                          if (sortKey === 'id') return (a.id - b.id) * dir;
                          if (sortKey === 'avg') return (a.avgCompletion - b.avgCompletion) * dir;
                          if (sortKey && sortKey.startsWith('report:')) {
                            const absIdx = Number(sortKey.split(':')[1]);
                            const start = Math.max(0, snapshots.length - 4);
                            const rel = absIdx - start;
                            const va = (a.recentAvgs && a.recentAvgs[rel] != null) ? a.recentAvgs[rel] as number : (Number.NEGATIVE_INFINITY as number);
                            const vb = (b.recentAvgs && b.recentAvgs[rel] != null) ? b.recentAvgs[rel] as number : (Number.NEGATIVE_INFINITY as number);
                            return (va - vb) * dir;
                          }
                          return 0;
                        });

                        return sorted.map((learner, idx) => {
                          const week1 = (learner.week1Avg ?? null);
                          const week2 = (learner.week2Avg ?? learner.avgCompletion ?? null);
                          const delta = week1 !== null && week2 !== null ? (week2 - week1) : null;
                          return (
                          <tr key={learner.id} className="border-t hover:bg-gray-50 hover:shadow-sm transition-all duration-150">
                            <td className="py-2 w-8">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(learner.id)}
                                onChange={(e) => {
                                  setSelectedIds(prev => {
                                    if (e.target.checked) return Array.from(new Set([...prev, learner.id]));
                                    return prev.filter(id => id !== learner.id);
                                  });
                                }}
                              />
                            </td>
                            <td className="py-2 text-sm text-gray-600">{idx + 1}</td>
                            <td className="py-2 text-sm font-medium text-gray-800">{learner.name}</td>
                            <td className="py-2 text-sm text-gray-600">{learner.id}</td>
                            {(listModalType === 'improved' || listModalType === 'support') ? (
                              <>
                                {(() => {
                                  const recent = (learner as any).recentAvgs as Array<number | null> | undefined;
                                  const cells: JSX.Element[] = [];
                                  for (let i = 0; i < 4; i++) {
                                    const val = recent ? recent[i] : null;
                                    cells.push(
                                      <td className="py-2 text-sm text-gray-700" key={i}>{val !== null && val !== undefined ? `${val}%` : '-'}</td>
                                    );
                                  }
                                  return cells;
                                })()}
                                <td className={`py-2 text-sm ${delta !== null ? (delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-700') : 'text-gray-500'}`}>{delta !== null ? `${delta > 0 ? '+' : ''}${delta}%` : '-'}</td>
                              </>
                            ) : (
                              <td className="py-2 text-sm text-gray-700">{learner.avgCompletion}%</td>
                            )}
                            <td className="py-2 text-sm">
                              <button
                                className="text-blue-600 hover:underline"
                                onClick={() => {
                                  setSelectedLearner(learner);
                                  setDetailModalOpen(true);
                                }}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        )});
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        

        {/* Learner Detail Modal */}
        {detailModalOpen && selectedLearner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black opacity-40" onClick={() => setDetailModalOpen(false)} />
            <div className="relative bg-white rounded-lg shadow-lg w-11/12 max-w-2xl p-6 z-10 card-appear">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">{selectedLearner.name}</h3>
                <button className="text-gray-600" onClick={() => setDetailModalOpen(false)}>Close</button>
              </div>

              <div className="text-sm text-gray-700 mb-4">
                <p><strong>Email:</strong> {selectedLearner.email}</p>
                <p><strong>District:</strong> {selectedLearner.district}</p>
                <p><strong>Level:</strong> {selectedLearner.level}</p>
                <p className="mt-2"><strong>Courses:</strong></p>
                <ul className="list-disc list-inside mt-2">
                  {selectedLearner.courses.map((c, i) => (
                    <li key={i}>{c.title} — {c.status} — {c.completion}%</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningDashboard;