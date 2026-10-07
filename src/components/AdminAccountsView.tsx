import React, { useState, useRef, useEffect } from 'react';
import { Company, Account } from '../types';
import {
  Layers,
  Plus,
  Search,
  Check,
  X,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  AlertTriangle,
  Download,
  Upload,
  FileSpreadsheet,
  FileUp,
  FileDown,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface AdminAccountsViewProps {
  currentCompany: Company;
  accounts: (Account & { is_active?: boolean })[];
  onToggleAccount: (accountId: string, isActive: boolean) => Promise<void>;
  onCreateAccount?: (payload: Partial<Account> & { is_active?: boolean }) => Promise<void>;
  onBatchCreateAccounts?: (newAccountsList: any[]) => Promise<any>;
  onDeleteAccount?: (accountId: string) => Promise<void>;
  userRole: string;
}

interface ParsedAccountRow {
  rowNum: number;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  typeName: string;
  category: string;
  description: string;
  isActive: boolean;
  status: 'NEW' | 'EXISTING' | 'INVALID';
  statusReason?: string;
}

// 엑셀 라이브러리는 용량이 커서, 엑셀 입력·출력 버튼을 누를 때만 불러온다
const loadXLSX = () => import('xlsx');

// 과목구분 글자를 내부 분류로 바꾼다. 알 수 없는 값이면 null (임의로 '비용' 처리하지 않는다)
function parseAccountType(raw: string): { type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'; name: string } | null {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper.includes('자산') || upper === 'ASSET') return { type: 'ASSET', name: '자산' };
  if (upper.includes('부채') || upper === 'LIABILITY') return { type: 'LIABILITY', name: '부채' };
  if (upper.includes('자본') || upper === 'EQUITY') return { type: 'EQUITY', name: '자본' };
  if (upper.includes('수익') || upper.includes('매출') || upper.includes('수입') || upper === 'REVENUE') return { type: 'REVENUE', name: '수익' };
  if (upper.includes('비용') || upper.includes('지출') || upper.includes('손실') || upper === 'EXPENSE') return { type: 'EXPENSE', name: '비용' };
  return null;
}

export const AdminAccountsView: React.FC<AdminAccountsViewProps> = ({
  currentCompany,
  accounts,
  onToggleAccount,
  onCreateAccount,
  onBatchCreateAccounts,
  onDeleteAccount,
  userRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<(Account & { is_active?: boolean }) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Excel Export state
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Excel Import state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importParsedRows, setImportParsedRows] = useState<ParsedAccountRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Create form state
  const [formData, setFormData] = useState({
    account_code: '',
    account_name: '',
    account_type: 'EXPENSE' as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
    category: '판매관리비',
    description: '',
    is_active: true,
  });

  // Outside click listener for export dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isExportMenuOpen]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 삭제는 우리 회사가 추가한 계정과목만 가능 (공통 계정과목은 최고관리자만)
  const canDelete = (acc: Account) =>
    userRole !== 'VIEWER' && !!onDeleteAccount && (!!acc.company_id || userRole === 'SUPER_ADMIN');

  const filtered = accounts.filter((a) => {
    if (selectedType !== 'ALL' && a.account_type !== selectedType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = a.account_name.toLowerCase().includes(q);
      const matchCode = a.account_code.toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    return true;
  });

  const handleToggle = async (acc: Account) => {
    if (userRole === 'VIEWER') return;
    try {
      setTogglingId(acc.id);
      await onToggleAccount(acc.id, !acc.is_active);
      setToast({ type: 'success', text: `[${acc.account_code}] ${acc.account_name} 사용 상태를 변경했습니다.` });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || '상태 변경 실패' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.account_code.trim() || !formData.account_name.trim() || !onCreateAccount) return;
    try {
      setIsSubmitting(true);
      await onCreateAccount({
        account_code: formData.account_code.trim(),
        account_name: formData.account_name.trim(),
        account_type: formData.account_type,
        category: formData.category.trim() || (formData.account_type === 'EXPENSE' ? '판관비' : '일반'),
        description: formData.description.trim(),
        is_active: formData.is_active,
      });
      setIsCreateModalOpen(false);
      setToast({ type: 'success', text: `계정과목 [${formData.account_code}] ${formData.account_name}이 등록되었습니다.` });
      setFormData({
        account_code: '',
        account_name: '',
        account_type: 'EXPENSE',
        category: '판매관리비',
        description: '',
        is_active: true,
      });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || '계정과목 생성 실패' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deletingAccount || !onDeleteAccount) return;
    try {
      setIsDeleting(true);
      await onDeleteAccount(deletingAccount.id);
      setToast({ type: 'success', text: `계정과목 [${deletingAccount.account_code}] ${deletingAccount.account_name}이 삭제되었습니다.` });
      setDeletingAccount(null);
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || '계정과목 삭제 실패' });
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'ASSET':
        return '자산';
      case 'LIABILITY':
        return '부채';
      case 'EQUITY':
        return '자본';
      case 'REVENUE':
        return '수익(매출/수입)';
      case 'EXPENSE':
        return '비용(지출)';
      default:
        return type;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 엑셀 출력 핸들러
  // ─────────────────────────────────────────────────────────────
  const handleExportAccounts = async (type: 'all' | 'template') => {
    setIsExportMenuOpen(false);
    try {
      const XLSX = await loadXLSX();
      if (type === 'template') {
        const templateData = [
          {
            계정코드: '101',
            계정과목명: '현금',
            과목구분: '자산',
            세부분류: '당좌자산',
            설명: '사업장 소액 보유 현금',
            사용여부: 'Y',
          },
          {
            계정코드: '103',
            계정과목명: '보통예금',
            과목구분: '자산',
            세부분류: '당좌자산',
            설명: '은행 수시 입출금 계좌',
            사용여부: 'Y',
          },
          {
            계정코드: '251',
            계정과목명: '외상매입금',
            과목구분: '부채',
            세부분류: '유동부채',
            설명: '매입처 미지급 외상 대금',
            사용여부: 'Y',
          },
          {
            계정코드: '411',
            계정과목명: '상품매출',
            과목구분: '수익',
            세부분류: '매출',
            설명: '주요 상품 판매 매출',
            사용여부: 'Y',
          },
          {
            계정코드: '501',
            계정과목명: '급여',
            과목구분: '비용',
            세부분류: '판관비',
            설명: '임직원 기본급 및 수당',
            사용여부: 'Y',
          },
          {
            계정코드: '503',
            계정과목명: '복리후생비',
            과목구분: '비용',
            세부분류: '판관비',
            설명: '직원 식대, 음료 및 경조사비',
            사용여부: 'Y',
          },
          {
            계정코드: '508',
            계정과목명: '소모품비',
            과목구분: '비용',
            세부분류: '판관비',
            설명: '사무용품 및 비품 소모성 지출',
            사용여부: 'Y',
          },
        ];

        const ws = XLSX.utils.json_to_sheet(templateData);
        ws['!cols'] = [
          { wch: 12 }, // 계정코드
          { wch: 18 }, // 계정과목명
          { wch: 12 }, // 과목구분
          { wch: 14 }, // 세부분류
          { wch: 28 }, // 설명
          { wch: 10 }, // 사용여부
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '계정과목_업로드양식');
        XLSX.writeFile(wb, '계정과목_엑셀입력_양식.xlsx');
        setToast({ type: 'success', text: '엑셀 업로드용 양식 파일(계정과목_엑셀입력_양식.xlsx)이 다운로드되었습니다.' });
      } else {
        const rows = accounts.map((acc, idx) => ({
          순번: idx + 1,
          계정코드: acc.account_code,
          계정과목명: acc.account_name,
          과목구분: getTypeName(acc.account_type),
          구분코드: acc.account_type,
          세부분류: acc.category || '',
          계정설명: acc.description || '',
          사용여부: acc.is_active !== false ? '사용(Y)' : '미사용(N)',
          시스템계정: acc.is_system ? '공통' : '사용자추가',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 8 },  // 순번
          { wch: 12 }, // 계정코드
          { wch: 20 }, // 계정과목명
          { wch: 16 }, // 과목구분
          { wch: 12 }, // 구분코드
          { wch: 14 }, // 세부분류
          { wch: 30 }, // 계정설명
          { wch: 12 }, // 사용여부
          { wch: 12 }, // 시스템계정
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '계정과목목록');
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        XLSX.writeFile(wb, `${currentCompany.company_name}_계정과목목록_${todayStr}.xlsx`);
        setToast({ type: 'success', text: `총 ${rows.length}개 계정과목이 엑셀 파일로 출력되었습니다.` });
      }
    } catch (err: any) {
      console.error('Export error:', err);
      setToast({ type: 'error', text: '엑셀 출력 중 오류가 발생했습니다.' });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 엑셀 입력(파싱 및 유효성 검사) 핸들러
  // ─────────────────────────────────────────────────────────────
  const processSelectedFile = (file: File) => {
    setImportFile(file);
    setImportResult(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onerror = () => {
      setImportError('파일을 읽지 못했습니다. 파일이 다른 프로그램에서 열려 있지 않은지 확인해 주세요.');
      setImportParsedRows([]);
    };
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!buffer) throw new Error('파일 데이터를 읽을 수 없습니다.');
        const XLSX = await loadXLSX();
        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) throw new Error('엑셀 시트가 비어 있습니다.');
        const ws = wb.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rawJson.length === 0) {
          throw new Error('시트에 읽을 수 있는 데이터 행이 없습니다.');
        }

        const existingCodes = new Set(accounts.map((a) => String(a.account_code).trim()));
        const parsedRows: ParsedAccountRow[] = [];
        const seenInFileCodes = new Set<string>();

        rawJson.forEach((row, idx) => {
          const code = String(
            row['계정코드'] ?? row['코드'] ?? row['과목코드'] ?? row['account_code'] ?? row['code'] ?? ''
          ).trim();
          const name = String(
            row['계정과목명'] ?? row['계정과목'] ?? row['과목명'] ?? row['account_name'] ?? row['name'] ?? ''
          ).trim();
          const rawType = String(
            row['과목구분'] ?? row['구분'] ?? row['분류구분'] ?? row['account_type'] ?? row['type'] ?? ''
          ).trim();
          const category = String(row['세부분류'] ?? row['분류'] ?? row['category'] ?? '').trim();
          const description = String(row['설명'] ?? row['계정설명'] ?? row['비고'] ?? row['description'] ?? '').trim();
          const rawActive = String(row['사용여부'] ?? row['사용'] ?? row['is_active'] ?? 'Y').trim().toUpperCase();
          const isActive = !(rawActive === 'N' || rawActive === 'FALSE' || rawActive === '미사용' || rawActive === '0');

          if (!code && !name) {
            return; // 빈 행 무시
          }

          const parsedType = parseAccountType(rawType);
          const type = parsedType?.type ?? 'EXPENSE';
          const typeKorean = parsedType?.name ?? (rawType || '(비어 있음)');

          let status: 'NEW' | 'EXISTING' | 'INVALID' = 'NEW';
          let statusReason = '';

          if (!code || !name) {
            status = 'INVALID';
            statusReason = '계정코드 또는 과목명 누락';
          } else if (!parsedType) {
            status = 'INVALID';
            statusReason = '과목구분 확인 필요 (자산·부채·자본·수익·비용)';
          } else if (existingCodes.has(code)) {
            status = 'EXISTING';
            statusReason = '이미 시스템에 존재하는 계정코드';
          } else if (seenInFileCodes.has(code)) {
            status = 'INVALID';
            statusReason = '엑셀 파일 내 중복된 계정코드';
          } else {
            seenInFileCodes.add(code);
          }

          parsedRows.push({
            rowNum: idx + 2,
            code,
            name,
            type,
            typeName: typeKorean,
            category: category || (type === 'EXPENSE' ? '판관비' : '일반'),
            description,
            isActive,
            status,
            statusReason,
          });
        });

        if (parsedRows.length === 0) {
          throw new Error('유효한 계정과목 행을 찾을 수 없습니다. 컬럼 제목(계정코드, 계정과목명, 과목구분 등)을 확인해 주세요.');
        }

        setImportParsedRows(parsedRows);
      } catch (err: any) {
        console.error('Excel parse error:', err);
        setImportError(err.message || '엑셀 파일을 분석하는 중 오류가 발생했습니다.');
        setImportParsedRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleExecuteImport = async () => {
    const validRows = importParsedRows.filter((r) => r.status === 'NEW');
    if (validRows.length === 0) {
      setToast({ type: 'info', text: '새로 등록 가능한 계정과목이 없습니다.' });
      return;
    }

    try {
      setIsImporting(true);
      const payloadList = validRows.map((r) => ({
        account_code: r.code,
        account_name: r.name,
        account_type: r.type,
        category: r.category,
        description: r.description,
        is_active: r.isActive,
      }));

      if (onBatchCreateAccounts) {
        const res = await onBatchCreateAccounts(payloadList);
        const createdCount = res.created_count ?? validRows.length;
        setImportResult({
          created: createdCount,
          skipped: importParsedRows.length - createdCount,
          total: importParsedRows.length,
        });
        setToast({
          type: 'success',
          text: `계정과목 ${createdCount}건이 성공적으로 등록되었습니다.`,
        });
      } else if (onCreateAccount) {
        let count = 0;
        for (const item of payloadList) {
          await onCreateAccount(item);
          count++;
        }
        setImportResult({
          created: count,
          skipped: importParsedRows.length - count,
          total: importParsedRows.length,
        });
        setToast({
          type: 'success',
          text: `계정과목 ${count}건이 등록되었습니다.`,
        });
      }
    } catch (err: any) {
      console.error('Import submit error:', err);
      setToast({ type: 'error', text: err.message || '계정과목 일괄 등록 중 오류가 발생했습니다.' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-bold ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-indigo-50 border-indigo-200 text-indigo-800'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {toast.type === 'info' && <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />}
            <span>{toast.text}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">계정과목 관리 (Chart of Accounts)</h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              방법 B: 공통 계정과목 + 회사별 사용 활성화
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            표준 계정과목 체계를 바탕으로 <strong className="text-slate-800">{currentCompany.company_name}</strong>에서 실제 사용할 과목을 회사별로 On/Off 설정합니다.
          </p>
        </div>

        {/* Action Buttons: 엑셀 출력, 엑셀 입력, + 계정과목 생성 */}
        <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto shrink-0">
          {/* 엑셀 출력 버튼 */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
              title="계정과목 목록을 엑셀로 다운로드하거나 업로드 양식을 다운로드합니다."
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>엑셀 출력</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 text-xs animate-in fade-in duration-100">
                <button
                  type="button"
                  onClick={() => handleExportAccounts('all')}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800 font-semibold cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-900">계정과목 전체 다운로드</div>
                    <div className="text-[10px] text-slate-500">현재 등록된 과목 목록 (.xlsx)</div>
                  </div>
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  type="button"
                  onClick={() => handleExportAccounts('template')}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800 font-semibold cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-900">엑셀 입력용 양식 받기</div>
                    <div className="text-[10px] text-slate-500">샘플 포함 템플릿 서식 (.xlsx)</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 엑셀 입력 버튼 */}
          {userRole !== 'VIEWER' && (onCreateAccount || onBatchCreateAccounts) && (
            <button
              type="button"
              onClick={() => {
                setIsImportModalOpen(true);
                setImportParsedRows([]);
                setImportFile(null);
                setImportResult(null);
                setImportError(null);
              }}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="엑셀 파일(.xlsx, .csv)을 업로드하여 계정과목을 일괄 등록합니다."
            >
              <FileUp className="w-3.5 h-3.5 text-emerald-100" />
              <span>엑셀 입력</span>
            </button>
          )}

          {/* + 계정과목 생성 버튼 */}
          {userRole !== 'VIEWER' && onCreateAccount && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors self-start sm:self-auto shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ 계정과목 생성</span>
            </button>
          )}
        </div>
      </div>

      {/* Concept Architecture Info Banner */}
      <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <div className="font-bold text-amber-400 text-sm">계정과목 멀티테넌트 전략 (Method B)</div>
            <div className="text-slate-300 mt-0.5">
              전체 회사의 통일된 재무 통계를 유지하면서, 회사 특성에 맞지 않는 계정과목은 비활성화하여 전표 입력 시 불필요한 노출을 방지합니다.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className="text-slate-400 text-[11px]">사용 활성화 과목:</span>{' '}
            <strong className="text-emerald-400 font-mono text-sm">
              {accounts.filter((a) => a.is_active !== false).length}개
            </strong>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-none sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="계정코드, 과목명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs px-3 py-2 sm:py-1.5 rounded-lg border border-slate-200 bg-white"
          >
            <option value="ALL">과목분류: 전체</option>
            <option value="ASSET">자산 (Asset)</option>
            <option value="LIABILITY">부채 (Liability)</option>
            <option value="EQUITY">자본 (Equity)</option>
            <option value="REVENUE">수익 (Revenue)</option>
            <option value="EXPENSE">비용 (Expense)</option>
          </select>
        </div>

        <span className="text-xs text-slate-500 text-right">
          총 <strong className="font-mono text-slate-900">{filtered.length}</strong>개 과목
        </span>
      </div>

      {/* Accounts: Mobile Cards (< md) & Desktop Table (>= md) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Mobile Card List */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              조건에 맞는 계정과목이 없습니다.
            </div>
          ) : (
            filtered.map((acc) => {
              const active = acc.is_active !== false;
              const isToggling = togglingId === acc.id;

              return (
                <div key={acc.id} className="p-4 space-y-2 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                          {acc.account_code}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">{acc.account_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            acc.account_type === 'EXPENSE'
                              ? 'bg-rose-50 text-rose-700'
                              : acc.account_type === 'REVENUE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {getTypeName(acc.account_type)}
                        </span>
                        {acc.category && (
                          <span className="text-[11px] text-slate-500 font-medium">· {acc.category}</span>
                        )}
                      </div>
                    </div>

                    {canDelete(acc) && (
                      <button
                        onClick={() => setDeletingAccount(acc)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                        title={`${acc.account_name} 삭제`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {acc.description && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {acc.description}
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-500">당사 장부 활성화:</span>
                    <button
                      onClick={() => handleToggle(acc)}
                      disabled={isToggling || userRole === 'VIEWER'}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[36px] ${
                        active
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      } disabled:opacity-50`}
                    >
                      {active ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>사용 중 (ON)</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3.5 h-3.5" />
                          <span>미사용 (OFF)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4 w-24">계정코드</th>
                <th className="py-2.5 px-4">계정과목명</th>
                <th className="py-2.5 px-4">분류 (Type)</th>
                <th className="py-2.5 px-4">카테고리</th>
                <th className="py-2.5 px-4">설명 / 표준 가이드</th>
                <th className="py-2.5 px-4 text-center w-36">
                  {currentCompany.company_name} 사용 여부
                </th>
                {userRole !== 'VIEWER' && onDeleteAccount && (
                  <th className="py-2.5 px-4 text-center w-20">계정 삭제</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((acc) => {
                const active = acc.is_active !== false;
                const isToggling = togglingId === acc.id;

                return (
                  <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{acc.account_code}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800 text-sm">
                      {acc.account_name}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          acc.account_type === 'EXPENSE'
                            ? 'bg-rose-50 text-rose-700'
                            : acc.account_type === 'REVENUE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {getTypeName(acc.account_type)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {acc.category || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {acc.description || '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggle(acc)}
                        disabled={isToggling || userRole === 'VIEWER'}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 mx-auto ${
                          active
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-150 text-slate-500 hover:bg-slate-200'
                        } disabled:opacity-50`}
                      >
                        {active ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>사용 중 (ON)</span>
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5" />
                            <span>미사용 (OFF)</span>
                          </>
                        )}
                      </button>
                    </td>
                    {userRole !== 'VIEWER' && onDeleteAccount && (
                      <td className="py-3 px-4 text-center">
                        {canDelete(acc) ? (
                          <button
                            onClick={() => setDeletingAccount(acc)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                            title={`${acc.account_name} (${acc.account_code}) 삭제`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400" title="모든 회사가 함께 쓰는 공통 계정과목은 삭제할 수 없습니다. 쓰지 않으려면 사용 여부를 OFF로 바꾸세요.">
                            공통
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Account Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-400 font-semibold">신규 계정과목 등록</div>
                <h3 className="text-base font-bold text-white">계정코드 및 과목 생성</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    계정코드 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 5260, 105"
                    value={formData.account_code}
                    onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    과목 구분 (Type) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.account_type}
                    onChange={(e: any) => setFormData({ ...formData, account_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="EXPENSE">비용 (EXPENSE)</option>
                    <option value="REVENUE">수익 (REVENUE)</option>
                    <option value="ASSET">자산 (ASSET)</option>
                    <option value="LIABILITY">부채 (LIABILITY)</option>
                    <option value="EQUITY">자본 (EQUITY)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  계정과목명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 소프트웨어구독료, 통신비, 행사비"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  대분류 카테고리 (Category) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="판매관리비">판매관리비</option>
                  <option value="유동자산">유동자산</option>
                  <option value="유형자산">유형자산</option>
                  <option value="매출채권">매출채권</option>
                  <option value="매입채무">매입채무</option>
                  <option value="유동부채">유동부채</option>
                  <option value="자본금">자본금</option>
                  <option value="사업수익">사업수익</option>
                  <option value="영업외수익">영업외수익</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  설명 / 전표 가이드
                </label>
                <textarea
                  rows={2}
                  placeholder="전표 작성 시 참고할 용도나 계정 처리 기준..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  id="account_is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="account_is_active" className="text-slate-800 font-medium cursor-pointer">
                  생성 즉시 현재 회사({currentCompany.company_name})에서 사용 활성화 (ON)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? '생성 중...' : '계정과목 생성'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                  <FileUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">계정과목 엑셀 일괄 등록 (Excel Import)</h3>
                  <p className="text-[11px] text-slate-300">엑셀(.xlsx, .xls) 또는 CSV 파일을 업로드하여 계정과목을 일괄 등록합니다.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setImportParsedRows([]);
                  setImportResult(null);
                  setImportError(null);
                }}
                disabled={isImporting}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* Guidance & Template Download Box */}
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                    <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                    <span>엑셀 작성 가이드 & 양식</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    필수 컬럼: <strong className="text-slate-800">계정코드, 계정과목명, 과목구분</strong> (자산, 부채, 자본, 수익, 비용)<br />
                    선택 컬럼: <strong className="text-slate-800">세부분류, 계정설명, 사용여부(Y/N)</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExportAccounts('template')}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 shadow-2xs flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>업로드용 양식 받기 (.xlsx)</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              {!importResult && (
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-50/60'
                        : importFile
                        ? 'border-indigo-300 bg-indigo-50/30 hover:border-indigo-400'
                        : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/20'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-indigo-600 shadow-2xs flex items-center justify-center mx-auto mb-2">
                      <FileUp className="w-6 h-6 text-emerald-600" />
                    </div>
                    {importFile ? (
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 text-sm">{importFile.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {(importFile.size / 1024).toFixed(1)} KB · 클릭하여 다른 파일로 변경
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-bold text-slate-800 text-sm">
                          엑셀 파일을 이곳에 드래그하거나 클릭하여 선택하세요
                        </div>
                        <div className="text-[11px] text-slate-500">지원 형식: .xlsx, .xls, .csv</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Parse Error Banner */}
              {importError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>{importError}</div>
                </div>
              )}

              {/* Parsed Preview Section */}
              {importParsedRows.length > 0 && !importResult && (
                <div className="space-y-3">
                  {/* Summary Status Badges */}
                  {(() => {
                    const validCount = importParsedRows.filter((r) => r.status === 'NEW').length;
                    const existingCount = importParsedRows.filter((r) => r.status === 'EXISTING').length;
                    const invalidCount = importParsedRows.filter((r) => r.status === 'INVALID').length;
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-500 font-bold">전체 읽은 행</div>
                          <div className="text-base font-black text-slate-900">{importParsedRows.length}건</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                          <div className="text-[10px] text-emerald-700 font-bold">신규 등록 가능</div>
                          <div className="text-base font-black text-emerald-700">{validCount}건</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                          <div className="text-[10px] text-amber-700 font-bold">기존 등록 (건너뜀)</div>
                          <div className="text-base font-black text-amber-700">{existingCount}건</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
                          <div className="text-[10px] text-rose-700 font-bold">누락·구분 오류 (제외)</div>
                          <div className="text-base font-black text-rose-700">{invalidCount}건</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-xs">엑셀 데이터 미리보기</span>
                      <span className="text-[11px] text-slate-500">상위 최대 50건 표시</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold">
                            <th className="py-2 px-3 text-center">행</th>
                            <th className="py-2 px-3">상태</th>
                            <th className="py-2 px-3">계정코드</th>
                            <th className="py-2 px-3">계정과목명</th>
                            <th className="py-2 px-3">과목구분</th>
                            <th className="py-2 px-3">세부분류</th>
                            <th className="py-2 px-3">사용</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importParsedRows.slice(0, 50).map((row) => (
                            <tr
                              key={row.rowNum}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                row.status === 'INVALID'
                                  ? 'bg-rose-50/30'
                                  : row.status === 'EXISTING'
                                  ? 'bg-amber-50/20'
                                  : ''
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-slate-400 font-mono">{row.rowNum}</td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {row.status === 'NEW' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    등록 가능
                                  </span>
                                )}
                                {row.status === 'EXISTING' && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                                    title={row.statusReason}
                                  >
                                    기존 중복
                                  </span>
                                )}
                                {row.status === 'INVALID' && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
                                    title={row.statusReason}
                                  >
                                    {row.statusReason || '오류'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{row.code || '-'}</td>
                              <td className="py-2 px-3 font-semibold text-slate-900">{row.name || '-'}</td>
                              <td className="py-2 px-3 text-slate-600">{row.typeName}</td>
                              <td className="py-2 px-3 text-slate-500">{row.category}</td>
                              <td className="py-2 px-3">
                                <span className={`font-bold ${row.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {row.isActive ? 'Y' : 'N'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Import Result Banner */}
              {importResult && (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3 animate-in zoom-in-95 duration-200">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-black text-slate-900">계정과목 엑셀 일괄 등록 완료</h4>
                  <div className="text-xs text-slate-700 leading-relaxed max-w-sm mx-auto">
                    총 <strong className="font-bold text-slate-900">{importResult.total}건</strong> 중{' '}
                    <strong className="text-emerald-700 font-bold">{importResult.created}건</strong>이 신규 등록되었으며,{' '}
                    나머지 <strong className="text-amber-700 font-bold">{importResult.skipped}건</strong>(기존 중복·오류 행)은 건너뛰었습니다.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div>
                {importParsedRows.length > 0 && !importResult && (
                  <button
                    type="button"
                    onClick={() => {
                      setImportFile(null);
                      setImportParsedRows([]);
                      setImportError(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                  >
                    다른 파일 선택하기
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportFile(null);
                    setImportParsedRows([]);
                    setImportResult(null);
                    setImportError(null);
                  }}
                  disabled={isImporting}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  {importResult ? '닫기' : '취소'}
                </button>

                {!importResult && (
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={isImporting || importParsedRows.filter((r) => r.status === 'NEW').length === 0}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>일괄 등록 중...</span>
                      </>
                    ) : (
                      <>
                        <FileUp className="w-3.5 h-3.5" />
                        <span>
                          {importParsedRows.filter((r) => r.status === 'NEW').length}건 계정과목 일괄 등록
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {deletingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-300" />
                <h3 className="text-base font-bold text-white">계정과목 삭제 확인</h3>
              </div>
              <button
                onClick={() => setDeletingAccount(null)}
                className="text-rose-200 hover:text-white"
                disabled={isDeleting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900">
                <div className="font-bold text-sm text-rose-800">
                  [{deletingAccount.account_code}] {deletingAccount.account_name}
                </div>
                <p className="text-rose-700 text-[11px] mt-1 leading-relaxed">
                  주의: 이미 전표(거래 내역)에 사용된 계정과목은 데이터 무결성을 위해 삭제가 제한되며, 대신 <strong>미사용(OFF)</strong>으로 변경할 수 있습니다.
                </p>
              </div>

              <p className="text-slate-600 font-medium">
                정말로 <strong className="text-slate-900 font-bold">[{deletingAccount.account_code} {deletingAccount.account_name}]</strong> 계정코드를 삭제하시겠습니까?
              </p>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingAccount(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSubmit}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? '삭제 중...' : '계정코드 삭제'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
