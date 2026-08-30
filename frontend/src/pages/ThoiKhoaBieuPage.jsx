import { Fragment, useState, useEffect, useRef } from 'react';
import { lopAPI, khoiAPI, tkbAPI, giaoVienAPI } from '../services/api';

const THU_NAMES = ['', '', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
const BUOI_CONFIG = {
  sang: { label: 'Sáng', tiets: [1, 2, 3, 4], moTa: ['Chào cờ', 'Tiết 2', 'Tiết 3', 'Tiết 4'] },
  chieu: { label: 'Chiều', tiets: [5, 6, 7], moTa: ['Tiết 5', 'Tiết 6', 'Tiết 7'] }
};

const normalizePhanHieu = (value) => String(value || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const QUY_TAC_TKB = [
  { icon: '🚫', text: 'Giáo viên không dạy 2 lớp cùng một tiết' },
  { icon: '📚', text: 'Mỗi buổi (sáng/chiều) chỉ xếp tối đa 1 tiết cho mỗi môn' },
  { icon: '🌅', text: 'Buổi sáng: 4 tiết (tiết 1 = chào cờ)' },
  { icon: '🌇', text: 'Buổi chiều: 3 tiết' },
  { icon: '📅', text: 'Học từ Thứ 2 đến Thứ 6' },
  { icon: '🎯', text: 'Tôn trọng nguyện vọng giáo viên (số buổi tối đa, thứ nghỉ, thứ ưu tiên)' },
  { icon: '⚖️', text: 'Cân bằng số tiết giữa các giáo viên cùng chuyên môn' }
];

function ThoiKhoaBieuPage() {
  const [lops, setLops] = useState([]);
  const [khois, setKhois] = useState([]);
  const [tkb, setTkb] = useState(null);
  const [giaoViens, setGiaoViens] = useState([]);
  const [viPhamNV, setViPhamNV] = useState(null); // {tongSoTiet, danhSachGV, _runPhanHieu} khi có vi phạm
  const [thongKeBuoi, setThongKeBuoi] = useState(null); // mảng thống kê desired/actual per GV
  const [thongKeBuoiFilter, setThongKeBuoiFilter] = useState(''); // lọc bảng thống kê theo phân hiệu
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(null); // { percent, stage, message } khi đang chạy autoGenerate
  const [selectedLop, setSelectedLop] = useState('');
  const [selectedKhoi, setSelectedKhoi] = useState('');
  const [selectedPhanHieu, setSelectedPhanHieu] = useState('');
  const [namHoc, setNamHoc] = useState('2024-2025');
  const [viewMode, setViewMode] = useState('lop'); // 'lop' or 'giao-vien'
  const [selectedGV, setSelectedGV] = useState('');
  const [gvSchedule, setGvSchedule] = useState([]);
  const [allTkbsCache, setAllTkbsCache] = useState([]); // cache tất cả TKB của năm học (cho preview GV)
  const [reloadTick, setReloadTick] = useState(0); // force re-render sau commit
  const [expandedGV, setExpandedGV] = useState(null); // GV đang mở rộng chi tiết
  const [showConfirmModal, setShowConfirmModal] = useState(false); // modal xác nhận sắp xếp TKB (toàn trường - legacy)
  const [showPhanHieuModal, setShowPhanHieuModal] = useState(false); // modal chọn phân hiệu để sắp
  const [selectedPhanHieuForGenerate, setSelectedPhanHieuForGenerate] = useState(''); // phân hiệu được chọn trong modal
  const [hasPhanHieuScheduled, setHasPhanHieuScheduled] = useState(false); // đánh dấu đã sắp theo phân hiệu ít nhất 1 lần
  const [scheduledPhanHieus, setScheduledPhanHieus] = useState([]); // các phân hiệu đã được sắp xếp thành công
  const [showPostScheduleChoiceModal, setShowPostScheduleChoiceModal] = useState(false); // modal chọn 2 option SAU khi sắp gặp lỗi
  const [postScheduleContext, setPostScheduleContext] = useState(null); // { targetPhanHieu, missingCount }
  const [showDieuChuyenModal, setShowDieuChuyenModal] = useState(false); // modal gợi ý điều chuyển
  const [dieuChuyenData, setDieuChuyenData] = useState(null); // { missingSubjects, candidates, scheduledPhanHieus }
  const [dieuChuyenLoading, setDieuChuyenLoading] = useState(false);
  const [warningModal, setWarningModal] = useState(null); // { title, message, warnings }
  const [lastWarnings, setLastWarnings] = useState([]); // cảnh báo mới nhất từ DB để xem lại sau khi OK
  const [groupedError, setGroupedError] = useState(null); // { groups: { phanHieu: [warnings] }, raw, targetPhanHieu, jobLabel }
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  // Lần điều chuyển GV gần nhất (luôn hiển thị banner để user biết đã phân công cho ai)
  const [lastResolution, setLastResolution] = useState(null); // { resolvedFromUnresolved, soAddCases, soMoveCases, soStillUnresolved, hidden }
  // Lịch sử điều chuyển (assignOverflow)
  const [showDieuChuyenHistoryModal, setShowDieuChuyenHistoryModal] = useState(false);
  const [dieuChuyenHistoryList, setDieuChuyenHistoryList] = useState([]); // summary list
  const [dieuChuyenHistoryLoading, setDieuChuyenHistoryLoading] = useState(false);
  const [dieuChuyenHistoryDetail, setDieuChuyenHistoryDetail] = useState(null); // log chi tiết
  const [dieuChuyenHistoryDetailLoading, setDieuChuyenHistoryDetailLoading] = useState(false);
  // Danh sách các lớp-môn chưa xử lý được, lưu qua localStorage để user xem lại sau khi đóng modal
  const [unresolvedCases, setUnresolvedCases] = useState(() => {
    try {
      const raw = localStorage.getItem('unresolvedCases');
      return raw ? JSON.parse(raw) : { groups: {}, totalCount: 0 };
    } catch { return { groups: {}, totalCount: 0 }; }
  });
  // Sync xuống localStorage mỗi khi thay đổi
  useEffect(() => {
    try {
      localStorage.setItem('unresolvedCases', JSON.stringify(unresolvedCases));
    } catch {}
  }, [unresolvedCases]);

  // Load unresolved cases từ DB khi mount (ưu tiên DB, fallback localStorage)
  useEffect(() => {
    const loadUnresolved = async () => {
      try {
        const res = await tkbAPI.getUnresolvedCases(namHoc);
        const doc = res?.data?.data;
        if (doc && doc.missingClasses && doc.missingClasses.length > 0) {
          const groups = {};
          for (const mc of doc.missingClasses) {
            const ph = mc.phanHieu || '(không rõ)';
            if (!groups[ph]) groups[ph] = [];
            // Parse reason từ message: "thiếu 2/4 tiết (không có GV dạy môn này)"
            const reasonMatch = mc.message ? mc.message.match(/\(([^)]+)\)/) : null;
            groups[ph].push({
              lop: mc.lop,
              mon: mc.mon,
              missing: mc.soTietConThieu,
              needed: mc.soTietConThieu,
              reason: reasonMatch ? reasonMatch[1] : 'không rõ',
            });
          }
          const totalCount = Object.values(groups).reduce((s, arr) => s + arr.length, 0);
          setUnresolvedCases({ groups, totalCount });
        }
      } catch {}
    };
    loadUnresolved();
  }, [namHoc]);

  useEffect(() => {
    const fetchSavedWarnings = async () => {
      try {
        const response = await tkbAPI.getWarningLogs(namHoc);
        const logs = response?.data?.data || [];
        if (logs.length > 0) {
          const latest = logs[0]?.warnings || [];
          setLastWarnings(latest);
        } else {
          setLastWarnings([]);
        }
      } catch (error) {
        console.warn('Không tải được cảnh báo từ server:', error);
      }
    };

    fetchSavedWarnings();
  }, [namHoc]);

  // Drag & Drop state
  const [draggedTiet, setDraggedTiet] = useState(null); // { tkbId, thu, buoi, tiet, tietData, lopId }
  const [dropTarget, setDropTarget] = useState(null); // { thu, buoi, tiet }
  const [swapConfirm, setSwapConfirm] = useState(null); // { source, target } khi cần xác nhận swap
  const [error, setError] = useState(null); // thông báo lỗi
  const [success, setSuccess] = useState(null); // thông báo thành công

  // === CLICK-TO-SWAP (cho view Giáo Viên) ===
  // selectedSlot: { thu, buoi, tiet, tietData, tkbId, lopId } - ô được chọn lần 1
  // Click lần 2 vào ô khác để swap/move, click lần 3 vào ô khác nữa để đổi selection
  const [selectedSlot, setSelectedSlot] = useState(null);

  // === STAGING MODE: Thay đổi chưa commit ===
  // pendingChanges: { [tkbId]: { [thu]: { [buoi]: { [tiet]: tietData|null } } } }
  // null = xóa, object = thêm/cập nhật
  const [pendingChanges, setPendingChanges] = useState({});
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null); // { conflicts, warnings, success }

  // Undo/Redo: lưu các snapshot của pendingChanges
  // history: mảng các state pendingChanges, historyIndex là vị trí hiện tại
  const [history, setHistory] = useState([{}]); // bắt đầu với state rỗng
  const [historyIndex, setHistoryIndex] = useState(0);
  const HISTORY_MAX = 50;

  // Reset pendingChanges + history khi đổi năm học / view / lớp / GV
  useEffect(() => {
    setPendingChanges({});
    setHistory([{}]);
    setHistoryIndex(0);
    setSelectedSlot(null);
  }, [namHoc, selectedLop, selectedGV, viewMode]);

  // === Helper: Lấy TKB có áp dụng pendingChanges ===
  const getPreviewTkb = (tkbData) => {
    if (!tkbData) return null;
    const result = JSON.parse(JSON.stringify(tkbData)); // deep clone
    const tkbChanges = pendingChanges[tkbData._id];
    if (!tkbChanges) return result;

    // Xóa các tiết bị remove (chuyển đi)
    for (const [thu, buoiMap] of Object.entries(tkbChanges)) {
      for (const [buoi, tietMap] of Object.entries(buoiMap)) {
        for (const [tiet, val] of Object.entries(tietMap)) {
          let ngay = result.ngayTrongTuan.find(n => n.thu === Number(thu) && n.buoi === buoi);
          if (val === null) {
            // Xóa
            if (ngay) {
              ngay.tiets = ngay.tiets.filter(t => t.tiet !== Number(tiet));
              if (ngay.tiets.length === 0) {
                result.ngayTrongTuan = result.ngayTrongTuan.filter(
                  n => !(n.thu === Number(thu) && n.buoi === buoi)
                );
              }
            }
          } else {
            // Thêm/cập nhật
            if (!ngay) {
              ngay = { thu: Number(thu), buoi, tiets: [] };
              result.ngayTrongTuan.push(ngay);
            }
            const existingIdx = ngay.tiets.findIndex(t => t.tiet === Number(tiet));
            if (existingIdx >= 0) {
              ngay.tiets[existingIdx] = val;
            } else {
              ngay.tiets.push(val);
            }
          }
        }
      }
    }
    return result;
  };

  // Trả về true nếu slot đang được staged trong pendingChanges
  // kind: 'removed' (đã xóa/chuyển đi), 'modified' (đã sửa/thêm)
  const getSlotPendingState = (tkbId, thu, buoi, tiet) => {
    const tkb = pendingChanges[tkbId];
    if (!tkb) return null;
    const buoiMap = tkb[thu]?.[buoi];
    if (!buoiMap) return null;
    const val = buoiMap[tiet];
    if (val === undefined) return null;
    if (val === null) return 'removed';
    return 'modified';
  };

  // Lấy gvSchedule có áp dụng pendingChanges
  // Logic: Build lại từ TẤT CẢ preview TKB (gom slot có giaoVien === selectedGV)
  // + Giữ lại các slot gốc của GV từ gvSchedule ban đầu mà không bị ảnh hưởng
  const getPreviewGvSchedule = () => {
    if (!selectedGV) return [];
    const gvIdStr = String(selectedGV);

    // Bước 1: Lấy tất cả slot thuộc GV đang chọn từ preview TKB
    const slotsFromPreview = [];
    const seen = new Set(); // key: thu-bui-tiet-lopId, tránh duplicate

    for (const tkb of allTkbsCache) {
      const preview = getPreviewTkb(tkb);
      if (!preview || !preview.ngayTrongTuan) continue;
      const lopId = tkb.lop?._id;
      for (const ngay of preview.ngayTrongTuan) {
        for (const tiet of (ngay.tiets || [])) {
          if (!tiet || !tiet.giaoVien) continue;
          // So sánh GV id (object hoặc string)
          const tietGvId = typeof tiet.giaoVien === 'object'
            ? String(tiet.giaoVien._id || '')
            : String(tiet.giaoVien);
          if (tietGvId !== gvIdStr) continue;
          const key = `${ngay.thu}-${ngay.buoi}-${tiet.tiet}-${lopId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          slotsFromPreview.push({
            thu: ngay.thu,
            buoi: ngay.buoi,
            tiet: tiet.tiet,
            tkbId: tkb._id,
            lop: tkb.lop,
            chuyenMon: tiet.chuyenMon,
            giaoVien: tiet.giaoVien
          });
        }
      }
    }

    return slotsFromPreview;
  };

  const hasPendingChanges = () => Object.keys(pendingChanges).length > 0;

  // Áp dụng 1 thay đổi vào pendingChanges (và ghi history để undo)
  // Dùng functional updater để tránh race condition khi kéo thả liên tục
  const applyPendingChange = (tkbId, thu, buoi, tiet, tietData) => {
    // Đọc pendingChanges hiện tại qua ref-like pattern: dùng setState callback
    setPendingChanges(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next[tkbId]) next[tkbId] = {};
      if (!next[tkbId][thu]) next[tkbId][thu] = {};
      if (!next[tkbId][thu][buoi]) next[tkbId][thu][buoi] = {};
      next[tkbId][thu][buoi][tiet] = tietData; // null = xóa

      // Push history (cũng dùng callback để tránh race)
      setHistory(h => {
        const idx = historyIndexRef.current;
        const newH = h.slice(0, idx + 1);
        newH.push(JSON.parse(JSON.stringify(next)));
        if (newH.length > HISTORY_MAX) newH.shift();
        // Cập nhật historyIndexRef đồng bộ
        historyIndexRef.current = Math.min(idx + 1, HISTORY_MAX - 1);
        return newH;
      });
      setHistoryIndex(idx => Math.min(idx + 1, HISTORY_MAX - 1));

      return next;
    });
  };

  // Ref lưu historyIndex hiện tại (để applyPendingChange không bị stale closure)
  const historyIndexRef = useRef(0);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // Undo: quay lại state trước
  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setPendingChanges(JSON.parse(JSON.stringify(prev)));
    setHistoryIndex(historyIndex - 1);
    setError('Đã undo');
    setTimeout(() => setError(null), 1500);
  };

  // Redo: đi tới state sau
  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setPendingChanges(JSON.parse(JSON.stringify(next)));
    setHistoryIndex(historyIndex + 1);
    setError('Đã redo');
    setTimeout(() => setError(null), 1500);
  };

  // Map lopId -> tkbId (dùng cho drag & drop trong GV view)
  const [lopTkbMap, setLopTkbMap] = useState({});

  // Lock mode: khóa giáo viên ưu tiên (bypass check trùng khi kéo thả)
  const [lockMode, setLockMode] = useState(false);
  const [lockedGVs, setLockedGVs] = useState([]); // mảng GV id được khóa
  const [showLockPanel, setShowLockPanel] = useState(false);
  const [rearranging, setRearranging] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Keyboard shortcuts: Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo
  useEffect(() => {
    const onKey = (e) => {
      // Bỏ qua nếu đang gõ trong input/textarea
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'y') || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIndex, history.length]);

  useEffect(() => {
    if (selectedLop && namHoc) {
      fetchTKB();
    }
  }, [selectedLop, namHoc]);

  useEffect(() => {
    if (selectedGV && namHoc) {
      fetchGVSchedule();
      fetchAllTkbsCache();
    } else if (namHoc) {
      // Lớp view: cũng cần cache all TKB để preview chính xác
      fetchAllTkbsCache();
    }
  }, [selectedGV, namHoc]);

  const fetchInitialData = async () => {
    try {
      const [khoisRes, lopsRes, gvRes] = await Promise.all([
        khoiAPI.getAll(),
        lopAPI.getAll(),
        giaoVienAPI.getAll()
      ]);
      setKhois(khoisRes.data.data);
      setLops(lopsRes.data.data);
      setGiaoViens(gvRes.data.data);
      
      if (lopsRes.data.data.length > 0) {
        setSelectedLop(lopsRes.data.data[0]._id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTKB = async () => {
    try {
      setLoading(true);
      const response = await tkbAPI.getByLop(selectedLop, namHoc);
      if (response.data.success) {
        setTkb(response.data.data);
      } else {
        setTkb(null);
      }
    } catch (err) {
      setTkb(null);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGVSchedule = async () => {
    try {
      setLoading(true);
      const response = await tkbAPI.getByGiaoVien(selectedGV, namHoc);
      if (response.data.success) {
        setGvSchedule(response.data.data);

        // Build lopTkbMap từ danh sách lớp
        const map = {};
        // Lấy tất cả TKB của năm học để map lop -> tkb
        const allTkbRes = await tkbAPI.getAll({ namHoc });
        if (allTkbRes.data.success) {
          for (const t of allTkbRes.data.data) {
            if (t.lop?._id) {
              map[t.lop._id] = t._id;
            }
          }
          setLopTkbMap(map);
          setAllTkbsCache(allTkbRes.data.data);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Cache tất cả TKB để preview GV view (cần khi pendingChanges có thay đổi ở TKB khác)
  const fetchAllTkbsCache = async (force = false) => {
    try {
      const params = { namHoc };
      if (force) params._t = Date.now();
      const res = await tkbAPI.getAll(params);
      if (res.data.success) {
        setAllTkbsCache(res.data.data);
      }
    } catch (err) {
      console.error('fetchAllTkbsCache error:', err);
    }
  };

  // === DRAG & DROP HANDLERS ===

  const handleDragStart = (e, tietData, thu, buoi, tiet, tkbId, lopId = null) => {
    e.stopPropagation();
    // Lấy lopId từ nhiều nguồn
    const finalLopId = lopId || tietData?.lop?._id || tietData?.lop || null;
    const finalTkbId = tkbId || tietData?.tkbId || null;
    setDraggedTiet({ tietData, thu, buoi, tiet, tkbId: finalTkbId, lopId: finalLopId });
    setError(null);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${thu}-${buoi}-${tiet}`);
    } catch (err) {
      console.error('drag start error:', err);
    }
  };

  const handleDragOver = (e, thu, buoi, tiet) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ thu, buoi, tiet });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e, targetThu, targetBuoi, targetTiet, targetTkbId = null, targetLopId = null) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedTiet) {
      console.warn('No dragged tiet');
      return;
    }

    const { thu: sourceThu, buoi: sourceBuoi, tiet: sourceTiet, tkbId: sourceTkbId, tietData, lopId: sourceLopId } = draggedTiet;

    console.log('Drop:', { sourceThu, sourceBuoi, sourceTiet, sourceTkbId, sourceLopId, targetThu, targetBuoi, targetTiet, targetTkbId, targetLopId, viewMode });

    // Không làm gì nếu drop vào chính slot nguồn
    if (sourceThu === targetThu && sourceBuoi === targetBuoi && sourceTiet === targetTiet) {
      setDraggedTiet(null);
      return;
    }

    // Xác định TKB IDs và lopId
    let sourceTkb = sourceTkbId;
    let sourceLop = sourceLopId;

    // Trong GV view: lấy tkbId và lopId từ gvSchedule
    if (viewMode === 'giao-vien') {
      const sourceTietInSched = gvSchedule.find(
        s => s.thu === sourceThu && s.buoi === sourceBuoi && s.tiet === sourceTiet
      );
      if (sourceTietInSched) {
        sourceTkb = sourceTietInSched.tkbId || lopTkbMap[sourceTietInSched.lop?._id];
        sourceLop = sourceTietInSched.lop?._id;
      }
    }

    if (!sourceTkb && viewMode === 'lop') {
      sourceTkb = tkb?._id;
    }
    if (!sourceLop && viewMode === 'lop') {
      sourceLop = selectedLop;
    }

    if (!sourceTkb || !sourceLop) {
      setError(`Không xác định được thời khóa biểu nguồn (tkb=${sourceTkb}, lop=${sourceLop})`);
      setTimeout(() => setError(null), 4000);
      setDraggedTiet(null);
      return;
    }

    // Xác định lớp đích
    let destLop = targetLopId;
    let destTkb = targetTkbId;

    if (viewMode === 'giao-vien') {
      // Tìm tiết đang có ở slot đích TRONG LỊCH CỦA GV HIỆN TẠI
      const targetTietHoc = gvSchedule.find(
        s => s.thu === targetThu && s.buoi === targetBuoi && s.tiet === targetTiet
      );
      if (targetTietHoc) {
        // Slot đích có tiết của GV hiện tại → swap với lớp đó
        destLop = targetTietHoc.lop?._id;
        destTkb = targetTietHoc.tkbId || lopTkbMap[destLop];
      } else {
        // Slot đích KHÔNG có tiết của GV hiện tại
        // Có 2 trường hợp: (1) slot trống hoàn toàn, hoặc (2) slot có tiết của GV KHÁC
        // Cần query TKB để biết chính xác
        let targetHasTiet = false;
        let targetTkbIdFromQuery = null;
        let targetLopIdFromQuery = null;

        // Thử tìm trong tất cả lớp mà GV hiện tại dạy
        const gvLops = [...new Set(gvSchedule.map(s => s.lop?._id).filter(Boolean))];
        for (const lopId of gvLops) {
          const tkbId = lopTkbMap[lopId];
          if (!tkbId) continue;
          try {
            const response = await tkbAPI.getByLop(lopId, namHoc);
            if (response.data.success) {
              const tkbData = response.data.data;
              const ngay = tkbData.ngayTrongTuan.find(
                n => n.thu === targetThu && n.buoi === targetBuoi
              );
              const tiet = ngay?.tiets.find(t => t.tiet === targetTiet);
              if (tiet && tiet.chuyenMon) {
                // Tìm thấy tiết ở slot này → đây là tiết của GV khác!
                targetHasTiet = true;
                targetTkbIdFromQuery = tkbId;
                targetLopIdFromQuery = lopId;
                break;
              }
            }
          } catch (e) {
            // bỏ qua lỗi, thử lớp tiếp theo
          }
        }

        if (targetHasTiet && targetTkbIdFromQuery) {
          // TRƯỜNG HỢP 2: Slot đích CÓ TIẾT của GV khác → swap
          destTkb = targetTkbIdFromQuery;
          destLop = targetLopIdFromQuery;
        } else {
          // TRƯỜNG HỢP 1: Slot đích TRỐNG → chọn lớp để move
          const possibleLops = lops.filter(l =>
            !lockedGVs.length || true
          );
          if (possibleLops.length === 0) {
            setError('Không có lớp nào');
            setDraggedTiet(null);
            return;
          }
          // Ưu tiên lớp cùng nguồn
          const sameLopOption = possibleLops.find(l => l._id === sourceLop);
          if (sameLopOption) {
            destLop = sourceLop;
            destTkb = sourceTkb;
          } else {
            // Hỏi user chọn lớp
            const lopNames = possibleLops.map((l, i) => `${i+1}. ${l.tenLop}`).join('\n');
            const choice = prompt(
              `Chọn lớp đích để xếp tiết vào:\n${lopNames}\n\nNhập số:`,
              '1'
            );
            if (!choice) {
              setDraggedTiet(null);
              return;
            }
            const idx = parseInt(choice) - 1;
            if (idx < 0 || idx >= possibleLops.length) {
              setError('Lựa chọn không hợp lệ');
              setDraggedTiet(null);
              return;
            }
            destLop = possibleLops[idx]._id;
            destTkb = lopTkbMap[destLop] || sourceTkb;
          }
        }
      }
    }

    if (!destLop && viewMode === 'lop') {
      destLop = selectedLop;
      destTkb = tkb?._id;
    }
    // Dam bao destTkb luon co gia tri
    if (destLop && !destTkb) {
      destTkb = lopTkbMap[destLop] || (viewMode === 'lop' ? tkb?._id : null);
    }

    // Lam giau destTkb truoc (phong truong hop view=giao-vien, slot trong)
    if (!destTkb) {
      destTkb = lopTkbMap[destLop] || sourceTkb;
    }
    if (!destTkb) {
      setError('Khong xac dinh duoc TKB dich (lop=' + destLop + ')');
      setTimeout(() => setError(null), 3000);
      setDraggedTiet(null);
      return;
    }

    // Kiểm tra slot đích có tiết chưa
    let targetTietObj = null;
    try {
      const response = await tkbAPI.getByLop(destLop, namHoc);
      if (response.data.success && response.data.data) {
        const targetTkbData = response.data.data;
        const targetNgay = targetTkbData.ngayTrongTuan.find(
          n => n.thu === targetThu && n.buoi === targetBuoi
        );
        targetTietObj = targetNgay?.tiets.find(t => t.tiet === targetTiet);
      }
    } catch (err) {
      console.error('Check target error:', err);
    }

    // Lam giau targetTietObj voi giaoVien populate tu gvSchedule (neu co)
    if (targetTietObj) {
      const enrich = gvSchedule.find(s =>
        s.thu === targetThu &&
        s.buoi === targetBuoi &&
        s.tiet === targetTiet &&
        (s.tkbId === destTkb || (s.lop && s.lop._id === destLop))
      );
      if (enrich && enrich.giaoVien) {
        targetTietObj = {
          ...targetTietObj,
          giaoVien: typeof enrich.giaoVien === 'object' ? enrich.giaoVien : { _id: enrich.giaoVien },
          chuyenMon: targetTietObj.chuyenMon || enrich.chuyenMon,
          lop: enrich.lop || targetTietObj.lop
        };
      }
    }

    // === STAGING: Chỉ cập nhật pendingChanges, KHÔNG gọi API ngay ===
    // Swap check: xác định xem đây là swap hay move
    const isSwap = !!targetTietObj;
    console.log('[handleDrop] isSwap:', isSwap, 'targetTietObj:', !!targetTietObj, 'destTkb:', destTkb, 'sourceTkb:', sourceTkb);

    // TH1: Swap (slot đích có tiết) → gọi API swap riêng
    if (isSwap) {
      try {
        console.log('[handleDrop] Calling swapTiet API...', { sourceTkb, sourceThu, sourceBuoi, sourceTiet, targetTkbId: destTkb, targetThu, targetBuoi, targetTiet });
        const response = await tkbAPI.swapTiet({
          sourceTkbId: sourceTkb,
          sourceThu, sourceBuoi, sourceTiet,
          targetTkbId: destTkb,
          targetThu, targetBuoi, targetTiet
        });
        console.log('[handleDrop] swapTiet response:', response.data);
        if (response.data.success) {
          setError('✅ Đã đổi 2 tiết thành công');
          setTimeout(() => setError(null), 3000);
          setDraggedTiet(null);
          // Reload để hiển thị data mới
          setTimeout(() => window.location.reload(), 500);
          return;
        } else {
          setError('❌ ' + (response.data.message || 'Lỗi không xác định'));
          setTimeout(() => setError(null), 4000);
          setDraggedTiet(null);
          return;
        }
      } catch (err) {
        console.error('[handleDrop] moveOrSwap error:', err);
        setError('❌ ' + (err.response?.data?.message || err.message));
        setTimeout(() => setError(null), 4000);
        setDraggedTiet(null);
        return;
      }
    }

    // TH2: Move (slot đích trống) → staging như cũ
    // Tạo tiết mới với vị trí đích
    const newTietData = {
      ...tietData,
      tiet: targetTiet,
      lop: tietData?.lop ? { ...tietData.lop, _id: destLop } : { _id: destLop }
    };

    // Xóa tiết khỏi vị trí nguồn
    applyPendingChange(sourceTkb, sourceThu, sourceBuoi, sourceTiet, null);
    // Thêm tiết vào vị trí đích
    applyPendingChange(destTkb, targetThu, targetBuoi, targetTiet, newTietData);

    setError('Move: Da luu tam');
    setTimeout(() => setError(null), 3000);
    setDraggedTiet(null);
  };

  // Đếm số thay đổi đang chờ
  const pendingCount = () => {
    let c = 0;
    for (const tkb of Object.values(pendingChanges)) {
      for (const buoi of Object.values(tkb)) {
        for (const tiet of Object.values(buoi)) {
          c++;
        }
      }
    }
    return c;
  };

  const performMove = async (sourceTkbId, sourceThu, sourceBuoi, sourceTiet, targetThu, targetBuoi, targetTiet, action, targetTkbId = null) => {
    try {
      setError(null);
      const finalTargetTkbId = targetTkbId || sourceTkbId;
      const payload = {
        sourceTkbId,
        sourceThu,
        sourceBuoi,
        sourceTiet,
        targetTkbId: finalTargetTkbId,
        targetThu,
        targetBuoi,
        targetTiet,
        lockedGVs: lockMode ? lockedGVs : []
      };
      // Chọn endpoint phù hợp với action
      const apiCall = action === 'swap' ? tkbAPI.swapTiet : tkbAPI.moveTiet;
      const response = await apiCall(payload);

      console.log('Move response:', response.data);

      if (response.data.success) {
        // Force refresh tất cả state liên quan
        if (viewMode === 'giao-vien' && selectedGV) {
          await fetchGVSchedule();
        } else if (viewMode === 'lop' && selectedLop) {
          await fetchTKB();
        } else {
          // Reload cả 2
          if (selectedGV) await fetchGVSchedule();
          await fetchTKB();
        }
        setError('✅ ' + (response.data.message || 'Thành công'));
        setTimeout(() => setError(null), 2000);
      } else {
        setError('❌ ' + (response.data.message || 'Có lỗi xảy ra'));
        setTimeout(() => setError(null), 4000);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra';
      console.error('Move error:', err);
      setError('❌ ' + msg);
      setTimeout(() => setError(null), 5000);
    }
    setDraggedTiet(null);
    setSwapConfirm(null);
  };

  // Sau khi kéo thả xong với GV bị khóa → gọi API rearrange
  // Commit tất cả pendingChanges lên server
  const handleCommitChanges = async () => {
    if (!hasPendingChanges()) return;
    try {
      setCommitting(true);
      setError(null);
      console.log('[handleCommit] START, pendingChanges:', JSON.stringify(pendingChanges).slice(0, 500));

      // Lấy tất cả TKB của năm học
      const allTkbRes = await tkbAPI.getAll({ namHoc, _t: Date.now() });
      if (!allTkbRes.data.success) {
        setError('Không lấy được danh sách TKB');
        return;
      }

      // Build tkbData: { [tkbId]: { ngayTrongTuan: [...] } }
      // Mỗi TKB chứa preview (đã apply pendingChanges)
      const tkbData = {};
      for (const tkb of allTkbRes.data.data) {
        const preview = getPreviewTkb(tkb);
        if (!preview) continue;
        const tkbIdStr = String(tkb._id);
        // Chỉ gửi các field cần thiết
        tkbData[tkbIdStr] = {
          ngayTrongTuan: (preview.ngayTrongTuan || []).map(ngay => ({
            thu: ngay.thu,
            buoi: ngay.buoi,
            tiets: (ngay.tiets || [])
            .filter(t => t && t.chuyenMon && t.giaoVien)
            .map(t => {
              // Lay dung ID cua giaoVien (co the la object hoac string)
              let gvId = null;
              if (typeof t.giaoVien === 'string') gvId = t.giaoVien;
              else if (typeof t.giaoVien === 'object' && t.giaoVien !== null) {
                gvId = t.giaoVien._id || t.giaoVien;
              }
              return {
                tiet: t.tiet,
                chuyenMon: t.chuyenMon,
                giaoVien: gvId
              };
            })
          }))
        };
      }
      console.log('[handleCommit] tkbData keys:', Object.keys(tkbData).length);
      console.log('[handleCommit] pendingChanges:', JSON.stringify(pendingChanges));
      console.log('[handleCommit] tkbData sample (1st TKB):', JSON.stringify(tkbData[Object.keys(tkbData)[0]]).slice(0, 800));

      const response = await tkbAPI.applyBatch({
        namHoc,
        tkbData,
        lockedGVs: lockMode ? lockedGVs : [],
        autoRearrange: lockMode && lockedGVs.length > 0,
        _t: Date.now() // cache buster
      });

      const data = response.data?.data || {};
      const conflicts = data.conflicts || [];
      const warnings = data.warnings || [];
      const rearrangeInfo = data.rearrange;

      if (response.data.success) {
        let msg = '✅ ' + (response.data.message || 'Áp dụng thành công');
        // Nếu có warnings/conflicts thì hiển thị modal chi tiết
        if (conflicts.length > 0 || warnings.length > 0) {
          setCommitResult({
            success: true,
            conflicts,
            warnings,
            rearranged: rearrangeInfo?.rearranged || 0
          });
          setError(msg);
          setTimeout(() => setError(null), 4000);
        } else {
          setError(msg);
          setTimeout(() => setError(null), 4000);
        }
        // Reload tất cả - force fresh fetch TRƯỚC, sau đó clear pending
        if (viewMode === 'giao-vien' && selectedGV) {
          await fetchGVSchedule();
          await fetchAllTkbsCache(true);
        } else if (viewMode === 'lop' && selectedLop) {
          await fetchTKB();
          await fetchAllTkbsCache(true);
        } else {
          await fetchAllTkbsCache(true);
        }
        // Force re-render để chắc chắn UI refresh
        setReloadTick(t => t + 1);
        // Clear pending SAU khi reload xong
        setPendingChanges({});
        setHistory([{}]);
        setHistoryIndex(0);

        // Force reload trang sau commit để chắc chắn UI hiển thị data mới
        // (tránh trường hợp React state không refresh dù data đã đổi)
        setTimeout(() => {
          console.log('[handleCommit] Force reload page to show fresh data');
          window.location.reload();
        }, 500);
      } else {
        // Lỗi: giữ pendingChanges để user có thể undo
        setCommitResult({
          success: false,
          conflicts,
          warnings,
          message: response.data.message
        });
        setError('❌ ' + (response.data.message || 'Có lỗi'));
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra';
      setCommitResult({
        success: false,
        conflicts: [],
        warnings: [],
        message: msg
      });
      setError('❌ ' + msg);
      console.error('Commit error:', err);
    } finally {
      setCommitting(false);
    }
  };

  const handleCancelChanges = () => {
    setPendingChanges({});
    setHistory([{}]);
    setHistoryIndex(0);
    setError('Đã hủy các thay đổi chưa lưu');
    setTimeout(() => setError(null), 2000);
  };

  const handleFinishRearrange = async () => {
    if (!lockMode || lockedGVs.length === 0) {
      setError('Chưa có giáo viên nào được khóa');
      setTimeout(() => setError(null), 3000);
      return;
    }
    try {
      setRearranging(true);
      setError(null);
      const response = await tkbAPI.rearrangeAfterLock({
        namHoc,
        lockedGVs
      });
      if (response.data.success) {
        await fetchTKB();
        if (selectedGV) await fetchGVSchedule();
        setError('✅ ' + response.data.message);
        setTimeout(() => setError(null), 4000);
      } else {
        setError(response.data.message || 'Có lỗi');
        setTimeout(() => setError(null), 4000);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Có lỗi';
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } finally {
      setRearranging(false);
    }
  };

  const confirmSwap = () => {
    if (!swapConfirm) return;
    const { source, target } = swapConfirm;
    performMove(source.tkbId, source.thu, source.buoi, source.tiet, target.thu, target.buoi, target.tiet, 'swap', target.tkbId);
  };

  const cancelSwap = () => {
    setSwapConfirm(null);
    setDraggedTiet(null);
  };

  const handleDragEnd = () => {
    setDraggedTiet(null);
    setDropTarget(null);
  };

  // === CLICK-TO-SWAP cho view Giáo Viên ===
  // Click lần 1: chọn ô (chỉ ô có tiết)
  // Click lần 2 vào ô khác:
  //   - Ô trống: hỏi lớp đích → move
  //   - Ô có tiết: swap 2 tiết
  // Click lần 3 vào ô khác nữa: đổi selection sang ô mới
  const handleCellClick = (thu, buoi, tiet, tietHocs, tkbId, lopId) => {
    if (tietHocs.length === 0) return; // ô trống không thể chọn làm nguồn

    const clickedSlot = {
      thu, buoi, tiet,
      tietData: tietHocs[0],
      tkbId: tkbId || lopTkbMap[lopId],
      lopId: lopId || tietHocs[0].lop?._id
    };

    if (!selectedSlot) {
      // Lần click đầu tiên → chọn
      setSelectedSlot(clickedSlot);
      setError(`✓ Đã chọn tiết tại ${THU_NAMES[thu]} - ${BUOI_CONFIG[buoi].label} - Tiết ${tiet}. Click ô khác để đổi chỗ.`);
      setTimeout(() => setError(null), 2500);
      return;
    }

    // Click cùng ô → bỏ chọn
    if (selectedSlot.thu === thu && selectedSlot.buoi === buoi && selectedSlot.tiet === tiet) {
      setSelectedSlot(null);
      setError(null);
      return;
    }

    // Click ô khác → swap (cả 2 đều có tiết)
    const source = selectedSlot;
    const target = clickedSlot;
    setError(`🔄 Đang đổi chỗ 2 tiết...`);
    performMove(source.tkbId, source.thu, source.buoi, source.tiet,
                target.thu, target.buoi, target.tiet, 'swap', target.tkbId);
    setSelectedSlot(null);
  };

  const handleGenerateTKB = async () => {
    setShowConfirmModal(true);
  };

  /**
   * Parse error message group theo phân hiệu.
   * Input dạng:
   *   "❌ [KHÔNG THỂ TỰ SẮP] Có 5 lớp-môn...\n\n
   *    📍 Phân hiệu \"Chính\" (3 lớp-môn):\n
   *       • Lớp \"5B3\" - môn \"Tiếng Anh\" thiếu 2/4 tiết (GV không đủ slot trống)\n
   *    📍 Phân hiệu \"Cơ sở 2\" (2 lớp-môn):\n
   *       • Lớp \"3A\" - môn \"Hóa\" thiếu 2/2 tiết (không có GV dạy môn này)"
   * Output: { 'Chính': [{lop, mon, missing, needed, reason}], 'Cơ sở 2': [...] } hoặc null nếu không phải dạng group.
   */
  const parseGroupedError = (msg) => {
    if (!msg || typeof msg !== 'string') return null;
    if (!msg.includes('[KHÔNG THỂ TỰ SẮP]')) return null;
    const lines = msg.split('\n');
    const groups = {};
    let currentPh = null;
    for (const line of lines) {
      const phMatch = line.match(/📍 Phân hiệu\s+"([^"]+)"/);
      if (phMatch) {
        currentPh = phMatch[1];
        if (!groups[currentPh]) groups[currentPh] = [];
        continue;
      }
      const caseMatch = line.match(/•\s*Lớp\s+"([^"]+)"\s*-\s*môn\s+"([^"]+)"\s*thiếu\s+(\d+)\/(\d+)\s*tiết\s*\(([^)]+)\)/);
      if (caseMatch && currentPh) {
        groups[currentPh].push({
          lop: caseMatch[1],
          mon: caseMatch[2],
          missing: Number(caseMatch[3]),
          needed: Number(caseMatch[4]),
          reason: caseMatch[5].trim(),
        });
      }
    }
    return Object.keys(groups).length > 0 ? groups : null;
  };

  /**
   * Helper chung: chạy 1 job TKB (poll progress) rồi xử lý kết quả.
   * @param {() => Promise<any>} startFn - gọi API bắt đầu job
   * @param {string} jobLabel - nhãn hiển thị
   */
  const runTkbJob = async (startFn, jobLabel = 'Sắp xếp TKB') => {
    try {
      setGenerating(true);
      setViPhamNV(null);
      setViPhamNV(null);
      setThongKeBuoi(null);
      setThongKeBuoiFilter('');
      setProgress({ percent: 0, stage: 'init', message: `Đang khởi động ${jobLabel}...` });

      // Bước 1: gọi API, nhận jobId ngay
      const startResult = await startFn();
      if (!startResult.data?.success || !startResult.data?.jobId) {
        throw new Error(startResult.data?.message || 'Không lấy được jobId');
      }
      const jobId = startResult.data.jobId;

      // Bước 2: poll progress mỗi 300ms
      const finalResult = await new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
          try {
            const res = await tkbAPI.getProgress(jobId);
            const job = res.data?.data;
            if (!job) {
              clearInterval(pollInterval);
              reject(new Error('Job not found'));
              return;
            }
            setProgress({
              percent: job.percent || 0,
              stage: job.stage || 'running',
              message: job.message || 'Đang xử lý...',
            });

            if (job.status === 'done') {
              clearInterval(pollInterval);
              resolve(job.result);
            } else if (job.status === 'error') {
              clearInterval(pollInterval);
              reject(new Error(job.error || 'Lỗi không xác định'));
            }
          } catch (pollErr) {
            clearInterval(pollInterval);
            reject(pollErr);
          }
        }, 300);
      });

      // Bước 3: xử lý kết quả
      setProgress({ percent: 100, stage: 'done', message: 'Hoàn tất!' });
      const result = finalResult;

      if (result && result.success) {
        if (result.thongKeBuoi) {
          setThongKeBuoi(result.thongKeBuoi);
        }

        // === LỌC THEO PHÂN HIỆU (nếu đang sắp theo phân hiệu) ===
        // Khi job là "Sắp theo phân hiệu X", chỉ hiển thị cảnh báo về GV thuộc phân hiệu X
        // (và GV không có phân hiệu - hiếm gặp nhưng có thể).
        const isByPhanHieuJob = jobLabel && jobLabel.startsWith('Sắp TKB phân hiệu');
        // Lấy tên phân hiệu từ jobLabel dạng: "Sắp TKB phân hiệu \"Chính\""
        const currentPhanHieu = isByPhanHieuJob
          ? (jobLabel.match(/phân hiệu\s+"([^"]+)"/) || [])[1]
          : null;

        const filteredThongKeBuoi = isByPhanHieuJob
          ? result.thongKeBuoi.filter(row => !row.phanHieu || row.phanHieu === currentPhanHieu)
          : result.thongKeBuoi;

        const unmetRows = Array.isArray(filteredThongKeBuoi)
          ? filteredThongKeBuoi.filter(row => row.desired != null && row.satisfied === false)
          : [];
        const hasUnmetNguyenVong = unmetRows.length > 0;
        const hasViolation = result.viPhamNV && result.viPhamNV.tongSoTiet > 0;

        if (hasViolation) {
          setViPhamNV({ ...result.viPhamNV, _runPhanHieu: currentPhanHieu });
        } else if (hasUnmetNguyenVong) {
          setViPhamNV({
            _runPhanHieu: currentPhanHieu,
            tongSoTiet: unmetRows.reduce((sum, row) => sum + Math.max(0, row.actual - row.desired), 0),
            danhSachGV: unmetRows.map((row) => ({
              tenGV: row.gv,
              phanHieu: row.phanHieu || '—',
              soTiet: Math.max(0, row.actual - row.desired),
              lyDo: `Không đạt nguyện vọng: ${row.actual}/${row.desired} buổi`
            }))
          });
        }

        if (result.warnings && result.warnings.length > 0) {
          setWarningModal({
            title: 'Cảnh báo',
            message: result.message,
            warnings: result.warnings,
            extraCount: result.warnings.length
          });
          setLastWarnings(result.warnings || []);
          setShowAllWarnings(false);
        } else if (hasUnmetNguyenVong) {
          const phanHieuTag = currentPhanHieu ? ` [phân hiệu "${currentPhanHieu}"]` : '';
          setWarningModal({
            title: `Cảnh báo nguyện vọng GV${phanHieuTag}`,
            message: `${result.message}. Giáo viên chưa đạt nguyện vọng buổi tối đa: ${unmetRows.map(row => `${row.gv}${row.phanHieu ? ` (${row.phanHieu})` : ''}: ${row.actual}/${row.desired}`).join('; ')}`,
            warnings: unmetRows.map(row => `${row.gv}${row.phanHieu ? ` (${row.phanHieu})` : ''}: hiện ${row.actual} buổi, mục tiêu ${row.desired} buổi`),
            extraCount: unmetRows.length
          });
          setLastWarnings(unmetRows.map(row => `${row.gv}${row.phanHieu ? ` (${row.phanHieu})` : ''}: hiện ${row.actual} buổi, mục tiêu ${row.desired} buổi`));
          setShowAllWarnings(false);
        } else if (result.partialSuccess && Array.isArray(result.missingClasses) && result.missingClasses.length > 0) {
          // SẮP THIẾU - thông báo đã sắp được + còn case chưa xếp → sẽ điều chuyển sau
          const mcCount = result.missingClasses.length;
          const phTag = currentPhanHieu ? ` phân hiệu "${currentPhanHieu}"` : '';
          setWarningModal({
            title: `✅ Sắp${phTag} hoàn tất — còn ${mcCount} lớp-môn cần điều chuyển`,
            message: `${result.message}\n\n📌 Hệ thống đã tự ghi nhận ${mcCount} lớp-môn chưa xếp được vào danh sách "chờ điều chuyển". Bạn có thể:\n  • Bấm "🔄 Sắp điều chuyển" để hệ thống tự tìm GV phù hợp từ phân hiệu khác.\n  • Hoặc thêm GV dạy môn này vào phân hiệu rồi bấm "Sắp theo phân hiệu" lại.`,
            warnings: result.missingClasses.slice(0, 30).map(mc => `${mc.lop} - ${mc.mon} thiếu ${mc.soTietConThieu} tiết`),
            extraCount: Math.max(0, mcCount - 30),
            missingClasses: result.missingClasses,
          });
          setLastWarnings(result.missingClasses.slice(0, 30).map(mc => `${mc.lop} - ${mc.mon} thiếu ${mc.soTietConThieu} tiết`));
          setShowAllWarnings(false);
        } else {
          setWarningModal({
            title: 'Thông báo',
            message: result.message,
            warnings: []
          });
        }
      } else if (result && !result.success) {
        setWarningModal({
          title: 'Lỗi',
          message: result.message,
          warnings: []
        });
        setLastWarnings([]);
      }

      // Hiển thị nhắc nhở GV vượt định mức (nếu có) - chỉ cho autoGenerateByPhanHieu
      if (result && Array.isArray(result.nhanhCheGV) && result.nhanhCheGV.length > 0) {
        const vuotDinhMuc = result.nhanhCheGV.filter(g => g.soTietDaDay > g.soTietDinhMuc);
        if (vuotDinhMuc.length > 0) {
          const msg = vuotDinhMuc.map(g =>
            `${g.gv} (${g.phanHieu || 'N/A'}): dạy ${g.soTietDaDay} tiết, vượt định mức ${g.soTietDaDay - g.soTietDinhMuc} tiết`
          ).join('; ');
          setWarningModal(prev => ({
            ...(prev || { title: 'Nhắc nhở', message: '', warnings: [] }),
            title: 'Nhắc nhở GV vượt định mức',
            message: msg,
            warnings: [
              ...((prev && prev.warnings) || []),
              ...vuotDinhMuc.map(g => `${g.gv}: ${g.soTietDaDay}/${g.soTietDinhMuc} tiết (vượt ${g.soTietDaDay - g.soTietDinhMuc})`)
            ],
          }));
        }
      }

      if (selectedLop) fetchTKB();
      if (selectedGV) fetchGVSchedule();

      // Trả về true khi job chạy thành công, false khi có lỗi
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setProgress({ percent: 100, stage: 'error', message: msg });
      // Parse grouped error thành cấu trúc { phanHieu -> [warnings] } nếu có thể
      const structured = parseGroupedError(msg);
      if (structured) {
        // Lấy tên phân hiệu từ jobLabel dạng: Sắp TKB phân hiệu "Chính"
        const phMatch = jobLabel.match(/phân hiệu\s+"([^"]+)"/);
        const targetPhanHieu = phMatch ? phMatch[1] : null;
        // Render modal lỗi có cấu trúc, group theo phân hiệu
        setGroupedError({ groups: structured, raw: msg, targetPhanHieu, jobLabel });
        // Lưu vào unresolvedCases (localStorage + DB) để user xem lại sau khi đóng modal
        setUnresolvedCases(prev => {
          const merged = { ...prev.groups };
          for (const [ph, cases] of Object.entries(structured)) {
            const old = merged[ph] || [];
            const seen = new Set(old.map(c => `${c.lop}|${c.mon}`));
            const fresh = cases.filter(c => !seen.has(`${c.lop}|${c.mon}`));
            merged[ph] = [...old, ...fresh];
          }
          const totalCount = Object.values(merged).reduce((s, arr) => s + arr.length, 0);
          return { groups: merged, totalCount };
        });
        // Lưu vào DB bất đồng bộ
        try {
          await tkbAPI.saveUnresolvedCases(namHoc, structured);
        } catch (saveErr) {
          console.warn('Không lưu được unresolved cases vào DB:', saveErr.message);
        }
      } else {
        // Fallback: dùng warningModal cũ
        setWarningModal({
          title: '⚠️ Hệ thống không thể tự sắp',
          message: msg,
          warnings: [],
        });
      }
      return false;
    } finally {
      // Giữ progress hiển thị 1.5s trước khi ẩn
      setTimeout(() => {
        setGenerating(false);
        setProgress(null);
      }, 1500);
    }
  };

  /**
   * Sắp xếp TKB toàn trường (legacy - dùng /auto-generate).
   */
  const confirmGenerateTKB = async () => {
    setShowConfirmModal(false);
    await runTkbJob(
      () => tkbAPI.autoGenerate(namHoc),
      'Sắp xếp TKB toàn trường'
    );
  };

  /**
   * Mở modal sắp TKB theo phân hiệu.
   * Mặc định chọn phân hiệu đang lọc trên UI (nếu có).
   */
  const handleOpenSapTheoPhanHieu = () => {
    setSelectedPhanHieuForGenerate(selectedPhanHieu || phanHieuOptions[0] || '');
    setShowPhanHieuModal(true);
  };

  /**
   * Sắp TKB cho 1 phân hiệu cụ thể.
   * - Có thể thành công một phần: TKB đã sắp được save vào DB,
   *   các lớp-môn thiếu được ghi vào WarningLog để điều chuyển sau.
   */
  const handleConfirmSapTheoPhanHieu = async () => {
    if (!selectedPhanHieuForGenerate) {
      setError('Vui lòng chọn phân hiệu cần sắp xếp.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    const targetPhanHieu = selectedPhanHieuForGenerate;
    setShowPhanHieuModal(false);
    const ok = await runTkbJob(
      () => tkbAPI.autoGenerateByPhanHieu(namHoc, targetPhanHieu),
      `Sắp TKB phân hiệu "${targetPhanHieu}"`
    );
    if (!ok) {
      setHasPhanHieuScheduled(false);
      return;
    }
    // Thành công (kể cả partial) → set scheduled
    setHasPhanHieuScheduled(true);
    setScheduledPhanHieus(prev => prev.includes(targetPhanHieu) ? prev : [...prev, targetPhanHieu]);

    // Tính số lớp-môn bị thiếu (chỉ đếm case thuộc phân hiệu đang sắp)
    const { missing } = await calcMissing(targetPhanHieu);
    const totalMissing = missing.length;

    if (totalMissing > 0) {
      // Mở modal chọn: điều chuyển ngay hoặc để sau
      setPostScheduleContext({ targetPhanHieu, missingCount: totalMissing });
      setShowPostScheduleChoiceModal(true);
    }
  };

  /**
   * Sắp TKB cho TẤT CẢ phân hiệu tuần tự (dùng job poll progress).
   */
  const handleSapTatCaPhanHieu = async () => {
    if (phanHieuOptions.length === 0) {
      setError('Chưa có phân hiệu nào trong hệ thống.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (!window.confirm(`Sắp TKB cho TẤT CẢ ${phanHieuOptions.length} phân hiệu (chạy tuần tự)?\n\nQuá trình có thể mất vài phút.`)) {
      return;
    }
    setShowPhanHieuModal(false);
    const ok = await runTkbJob(
      () => tkbAPI.autoGenerateAllPhanHieus(namHoc),
      `Sắp TKB tất cả phân hiệu (${phanHieuOptions.length})`
    );
    if (ok) {
      setHasPhanHieuScheduled(true);
      setScheduledPhanHieus(phanHieuOptions);
      setSuccess(`Đã sắp xong TKB cho ${phanHieuOptions.length} phân hiệu`);
      setTimeout(() => setSuccess(null), 4000);
      if (typeof loadData === 'function') await loadData();
    }
  };

  /**
   * Xóa toàn bộ TKB của năm học hiện tại.
   */
  const handleDeleteAllTkb = async () => {
    if (!window.confirm(
      `⚠️ XÓA TOÀN BỘ TKB năm học "${namHoc}"?\n\n` +
      `Hành động này:\n` +
      `• Xóa tất cả TKB đã tạo\n` +
      `• Xóa danh sách lớp-môn "chờ điều chuyển"\n` +
      `• KHÔNG thể khôi phục!\n\nBạn có chắc?`
    )) return;
    try {
      const res = await tkbAPI.deleteAllTkbByNamHoc(namHoc);
      setSuccess(res.data.message || 'Đã xóa hết TKB');
      setTimeout(() => setSuccess(null), 4000);
      setHasPhanHieuScheduled(false);
      setScheduledPhanHieus([]);
      if (typeof loadData === 'function') await loadData();
    } catch (e) {
      console.error('deleteAllTkb failed:', e);
      setError('Lỗi xóa TKB: ' + (e.response?.data?.message || e.message));
      setTimeout(() => setError(null), 5000);
    }
  };

  /**
   * Tính các lớp-môn bị thiếu (không xếp đủ tiết) ở 1 phân hiệu.
   */
  const calcMissing = async (targetPhanHieu) => {
    try {
      const [tkbRes, lopRes] = await Promise.all([
        tkbAPI.getAll({ namHoc }),
        lopAPI.getAll()
      ]);
      const tkbs = tkbRes.data?.data || [];
      const lops = lopRes.data?.data || [];
      const lopByPhanHieu = lops.filter(l => (l.phanHieu || '').trim() === targetPhanHieu);
      const missing = [];
      lopByPhanHieu.forEach(lop => {
        const lid = String(lop._id);
        (lop.chuyenMons || []).forEach(mon => {
          const ten = mon.tenChuyenMon || mon.mon || '';
          if (!ten) return;
          const cacTietDaXep = tkbs
            .filter(t => String(t.lop?._id || t.lop) === lid)
            .reduce((sum, t) => sum + (t.ngayTrongTuan || []).reduce((s2, d) => s2 + (d.tiets || []).filter(t => t.chuyenMon === ten).length, 0), 0);
          if (cacTietDaXep < (mon.soTietTuan || 0)) {
            missing.push({
              lopId: lid,
              lopTen: lop.tenLop,
              phanHieu: targetPhanHieu,
              mon: ten,
              canThem: (mon.soTietTuan || 0) - cacTietDaXep,
            });
          }
        });
      });
      return { missing };
    } catch (err) {
      console.error('[calcMissing]', err);
      return { missing: [] };
    }
  };


  /**
   * Tính toán GV thiếu tiết & môn thiếu GV ở phân hiệu target,
   * mở modal điều chuyển nếu có dữ liệu gợi ý.
   */
  const openDieuChuyenModal = async (targetPhanHieu) => {
    try {
      setDieuChuyenLoading(true);
      const [gvRes, tkbRes, lopRes] = await Promise.all([
        giaoVienAPI.getAll({ namHoc }),
        tkbAPI.getAll({ namHoc }),
        lopAPI.getAll()
      ]);
      const gvs = gvRes.data?.data || [];
      const tkbs = tkbRes.data?.data || [];
      const lops = lopRes.data?.data || [];

      // Tính số tiết đã dạy cho từng GV từ TKB (tổng + tại phân hiệu đích)
      const tietByGv = {};
      const tietByGvAtTarget = {}; // chỉ đếm tiết dạy tại phân hiệu đích
      tkbs.forEach(tkb => {
        const lid = String(tkb.lop?._id || tkb.lop);
        const lop = lops.find(l => String(l._id) === lid);
        const lopPhanHieu = (lop?.phanHieu || '').trim();
        const isAtTarget = lopPhanHieu === targetPhanHieu;
        (tkb.ngayTrongTuan || []).forEach(day => {
          (day.tiets || []).forEach(t => {
            const gvId = typeof t.giaoVien === 'object' ? t.giaoVien?._id : t.giaoVien;
            if (!gvId) return;
            const idStr = String(gvId);
            tietByGv[idStr] = (tietByGv[idStr] || 0) + 1;
            if (isAtTarget) tietByGvAtTarget[idStr] = (tietByGvAtTarget[idStr] || 0) + 1;
          });
        });
      });

      // GV thuộc phân hiệu KHÁC, đã được sắp (có tiết > 0), còn thiếu tiết (soTietDaDay < soTietDinhMuc)
      const candidates = gvs
        .map(gv => {
          const gvId = String(gv._id);
          const daDay = tietByGv[gvId] || 0;
          const daDayAtTarget = tietByGvAtTarget[gvId] || 0; // đã dạy tại phân hiệu đích (điều chuyển tới)
          const dinhMuc = gv?.phanCong?.soTietDinhMuc || 0;
          const kiemNhiem = gv?.phanCong?.soTietKiemNhiem || 0;
          const congThem = daDay + kiemNhiem;
          const conThieu = dinhMuc - congThem; // tổng slot còn trống
          const conThieuNgoaiTarget = Math.max(0, conThieu - daDayAtTarget); // còn dư slot NGOÀI target (vì tại target cô ấy đã dạy daDayAtTarget rồi, không nhận thêm được nếu chỗ trống < số tiết thiếu)
          const phanHieu = (gv?.phanHieu || '').trim();
          return {
            gvId, gv, daDay, daDayAtTarget, dinhMuc, kiemNhiem, conThieu, conThieuNgoaiTarget, phanHieu,
            chuyenMonNames: (gv?.chuyenMon || []).map(c => c?.tenChuyenMon || c?.ten || c).filter(Boolean)
          };
        })
        .filter(c => c.phanHieu && c.phanHieu !== targetPhanHieu && c.conThieu > 0);

      // Gom theo chuyên môn
      const byMon = {};
      candidates.forEach(c => {
        c.chuyenMonNames.forEach(mon => {
          if (!byMon[mon]) byMon[mon] = [];
          byMon[mon].push(c);
        });
      });

      // Lớp thiếu GV: tìm các lớp thuộc targetPhanHieu mà có môn không có GV trong TKB
      const lopByPhanHieu = lops.filter(l => (l.phanHieu || '').trim() === targetPhanHieu);
      const tkbByLop = {};
      tkbs.forEach(tkb => {
        const lid = String(tkb.lop?._id || tkb.lop);
        tkbByLop[lid] = tkbByLop[lid] || new Set();
        (tkb.ngayTrongTuan || []).forEach(day => {
          (day.tiets || []).forEach(t => {
            if (t.giaoVien) tkbByLop[lid].add(t.chuyenMon);
          });
        });
      });

      const missingClasses = [];
      lopByPhanHieu.forEach(lop => {
        const lid = String(lop._id);
        const assignedMons = tkbByLop[lid] || new Set();
        (lop.chuyenMons || []).forEach(mon => {
          const ten = mon.tenChuyenMon || mon.mon || '';
          if (!ten) return;
          const cacTietDaXep = tkbs
            .filter(t => String(t.lop?._id || t.lop) === lid)
            .reduce((sum, t) => sum + (t.ngayTrongTuan || []).reduce((s2, d) => s2 + (d.tiets || []).filter(t => t.chuyenMon === ten).length, 0), 0);
          if (cacTietDaXep < (mon.soTietTuan || 0)) {
            missingClasses.push({
              lopId: lid,
              lopTen: lop.tenLop,
              phanHieu: targetPhanHieu,
              mon: ten,
              canThem: (mon.soTietTuan || 0) - cacTietDaXep,
            });
          }
        });
      });

      setDieuChuyenData({
        targetPhanHieu,
        byMon,
        missingClasses,
        candidates,
        scheduledPhanHieus: [...scheduledPhanHieus]
      });
      // CHỈ hiện modal khi có lớp thiếu GV chưa xử lý được
      if (missingClasses.length > 0) {
        setShowDieuChuyenModal(true);
      } else {
        // Nếu sau khi chạy hết (cả option 2) không còn lớp thiếu → không hiện modal
        setShowDieuChuyenModal(false);
        setDieuChuyenData(null);
      }
    } catch (err) {
      console.error('[openDieuChuyenModal]', err);
    } finally {
      setDieuChuyenLoading(false);
    }
  };

  /**
   * Sắp điều chuyển tự động - đọc WarningLog.unresolved và tự xếp GV.
   * Có thể chạy nhiều lần (sẽ giải quyết từng đợt).
   */
  const handleSapDieuChuyen = async () => {
    // Đóng tất cả modal đang mở để user thấy kết quả
    setGroupedError(null);
    setShowDieuChuyenModal(false);
    setShowPostScheduleChoiceModal(false);
    setWarningModal(null);

    let success = false;
    let resolvedCount = 0;
    let stillCount = 0;
    let moveCount = 0;
    let addCount = 0;
    try {
      // runTkbJob giờ return boolean thay vì result, nên ta poll progress lấy jobId
      // rồi tự check kết quả
      const startRes = await tkbAPI.assignOverflow(namHoc);
      const jobId = startRes.data?.jobId;
      if (!jobId) throw new Error('Không lấy được jobId');
      // Poll cho tới done
      const finalResult = await new Promise((resolve, reject) => {
        let elapsed = 0;
        const pollInterval = setInterval(async () => {
          try {
            const r = await tkbAPI.getProgress(jobId);
            const job = r.data?.data;
            if (job?.status === 'done') {
              clearInterval(pollInterval);
              resolve(job.result);
            } else if (job?.status === 'error') {
              clearInterval(pollInterval);
              reject(new Error(job.error || 'Lỗi'));
            }
            elapsed += 300;
            if (elapsed > 60000) {
              clearInterval(pollInterval);
              reject(new Error('Timeout'));
            }
          } catch (e) {
            clearInterval(pollInterval);
            reject(e);
          }
        }, 300);
      });
      success = true;
      resolvedCount = (finalResult?.resolvedFromUnresolved || []).length;
      stillCount = finalResult?.soStillUnresolved || 0;
      moveCount = (finalResult?.resolvedFromUnresolved || []).filter(r => r.action === 'move').length;
      addCount = (finalResult?.resolvedFromUnresolved || []).filter(r => r.action === 'add').length;
      // Lưu lại để banner luôn hiển thị (kể cả khi không còn case chưa xếp được)
      setLastResolution({
        resolvedFromUnresolved: finalResult?.resolvedFromUnresolved || [],
        soAddCases: addCount,
        soMoveCases: moveCount,
        soStillUnresolved: stillCount,
        hidden: false,
        at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('assignOverflow thất bại:', e);
    }

    // Force refetch mọi thứ
    if (selectedLop) await fetchTKB();
    if (selectedGV) await fetchGVSchedule();
    await fetchAllTkbsCache(true);

    // Đảm bảo các modal không che TKB
    setWarningModal(null);
    setShowDieuChuyenModal(false);
    setGroupedError(null);

    // Reload unresolved cases từ DB (backend đã tự cập nhật)
    try {
      const res = await tkbAPI.getUnresolvedCases(namHoc);
      const data = res?.data?.data;
      const totalCount = data?.summary?.totalMissingClasses || data?.missingClasses?.length || 0;
      if (totalCount > 0 && data.missingClasses) {
        const groups = {};
        for (const mc of data.missingClasses) {
          const ph = mc.phanHieu || '(không rõ)';
          if (!groups[ph]) groups[ph] = [];
          const reasonMatch = mc.message ? mc.message.match(/\(([^)]+)\)/) : null;
          groups[ph].push({
            lop: mc.lop,
            mon: mc.mon,
            missing: mc.soTietConThieu,
            needed: mc.soTietConThieu,
            reason: reasonMatch ? reasonMatch[1] : 'không rõ',
          });
        }
        setUnresolvedCases({ groups, totalCount });
      } else {
        setUnresolvedCases({ groups: {}, totalCount: 0 });
      }
    } catch (e) {
      console.warn('Reload unresolved thất bại:', e.message);
    }

    // Toast ngắn
    if (success) {
      const parts = [];
      if (resolvedCount > 0) parts.push(`✅ Đã giải quyết ${resolvedCount} case (${addCount} add + ${moveCount} move)`);
      if (stillCount > 0) parts.push(`⚠️ Còn ${stillCount} case chưa xếp được`);
      if (parts.length === 0) parts.push('Không có gì để điều chuyển (TKB đã ổn hoặc không có GV surplus)');
      setError(parts.join(' · '));
    } else {
      setError('⚠️ Điều chuyển không hoàn tất');
    }
    setTimeout(() => setError(null), 5000);
  };

  /**
   * Mở modal lịch sử điều chuyển: load danh sách các lần chạy assignOverflow.
   */
  const handleOpenDieuChuyenHistory = async () => {
    setShowDieuChuyenHistoryModal(true);
    setDieuChuyenHistoryList([]);
    setDieuChuyenHistoryDetail(null);
    setDieuChuyenHistoryLoading(true);
    try {
      const res = await tkbAPI.getAssignOverflowLogs(namHoc, 50);
      setDieuChuyenHistoryList(res.data?.data || []);
    } catch (e) {
      console.error('load history error:', e);
      setError('Không tải được lịch sử điều chuyển: ' + (e.response?.data?.message || e.message));
      setTimeout(() => setError(null), 4000);
    } finally {
      setDieuChuyenHistoryLoading(false);
    }
  };

  /**
   * Xem chi tiết 1 lần chạy.
   */
  const handleViewDieuChuyenDetail = async (logId) => {
    setDieuChuyenHistoryDetail(null);
    setDieuChuyenHistoryDetailLoading(true);
    try {
      const res = await tkbAPI.getAssignOverflowLogById(logId);
      setDieuChuyenHistoryDetail(res.data?.data || null);
    } catch (e) {
      console.error('load detail error:', e);
      setError('Không tải được chi tiết log: ' + (e.response?.data?.message || e.message));
      setTimeout(() => setError(null), 4000);
    } finally {
      setDieuChuyenHistoryDetailLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await tkbAPI.exportExcel(namHoc);
    } catch (err) {
      alert('Lỗi khi xuất Excel: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleKhoiChange = (khoiId) => {
    setSelectedKhoi(khoiId);
    const nextLops = lops.filter(l => {
      const matchesKhoi = !khoiId || l.khoi === khoiId || l.khoi?._id === khoiId;
      const matchesPhanHieu = !selectedPhanHieu || l.phanHieu === selectedPhanHieu;
      return matchesKhoi && matchesPhanHieu;
    });
    
    setSelectedLop(nextLops.length > 0 ? nextLops[0]._id : '');
  };

  const handlePhanHieuChange = (phanHieu) => {
    setSelectedPhanHieu(phanHieu);
    const nextLops = lops.filter(l => {
      const matchesKhoi = !selectedKhoi || l.khoi === selectedKhoi || l.khoi?._id === selectedKhoi;
      return matchesKhoi && (!phanHieu || l.phanHieu === phanHieu);
    });
    setSelectedLop(nextLops.length > 0 ? nextLops[0]._id : '');
    const nextGVs = giaoViens.filter(gv => !phanHieu || gv.phanHieu === phanHieu);
    if (selectedGV && !nextGVs.some(gv => gv._id === selectedGV)) setSelectedGV('');
  };

  const phanHieuOptions = [...new Set(lops.map(lop => lop.phanHieu).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, 'vi', { numeric: true }));
  const filteredLops = lops.filter(l => {
    const matchesKhoi = !selectedKhoi || l.khoi === selectedKhoi || l.khoi?._id === selectedKhoi;
    return matchesKhoi && (!selectedPhanHieu || l.phanHieu === selectedPhanHieu);
  });
  const filteredGiaoViens = giaoViens.filter(gv => !selectedPhanHieu || gv.phanHieu === selectedPhanHieu);

  // Tạo grid TKB - dùng preview
  const renderTKBGrid = () => {
    const previewTkbData = getPreviewTkb(tkb);
    if (!previewTkbData || !previewTkbData.ngayTrongTuan) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Chưa có thời khóa biểu</p>
          <p className="text-sm mt-2">Nhấn "Sắp theo phân hiệu" để tạo TKB cho từng phân hiệu, sau đó nhấn "Sắp điều chuyển" để phân bổ GV dư.</p>
        </div>
      );
    }

    const weekdays = [2, 3, 4, 5, 6]; // Thứ 2 - Thứ 6

    return (
      <div className="overflow-x-auto">
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            💡 <b>Cách đổi tiết:</b> Click ô có tiết (chọn) → Click ô khác có tiết (đổi chỗ 2 tiết). Click lại ô đang chọn để bỏ.
            {selectedSlot && (
              <span className="ml-3 inline-block px-2 py-1 bg-blue-600 text-white rounded text-xs">
                Đã chọn: {THU_NAMES[selectedSlot.thu]} - {BUOI_CONFIG[selectedSlot.buoi].label} - Tiết {selectedSlot.tiet}
              </span>
            )}
          </div>
        </div>
        <table className="min-w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-center font-medium w-24">Buổi</th>
              {weekdays.map(thu => (
                <th key={thu} className="border border-gray-300 px-4 py-3 text-center font-medium min-w-32">
                  {THU_NAMES[thu]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(BUOI_CONFIG).map(([buoi, config]) => (
              <Fragment key={`grid-${buoi}`}>
                <tr className="bg-blue-50">
                  <td colSpan={6} className="border border-gray-300 px-4 py-2 font-semibold text-blue-800">
                    Buổi {config.label}
                  </td>
                </tr>
                {config.tiets.map((tiet, idx) => (
                  <tr key={`${buoi}-${tiet}`} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-center bg-gray-50">
                      <div className="font-medium">{tiet}</div>
                      <div className="text-xs text-gray-500">{config.moTa[idx]}</div>
                    </td>
                    {weekdays.map(thu => {
                      const ngay = previewTkbData.ngayTrongTuan.find(
                        n => n.thu === thu && n.buoi === buoi
                      );
                      const tietHoc = ngay?.tiets.find(t => t.tiet === tiet);
                      const isChaoCo = buoi === 'sang' && tiet === 1 && thu === 2;
                      const isDropTarget = dropTarget?.thu === thu && dropTarget?.buoi === buoi && dropTarget?.tiet === tiet;
                      const isDragging = draggedTiet?.thu === thu && draggedTiet?.buoi === buoi && draggedTiet?.tiet === tiet;
                      const isWarningFill = !!tietHoc?.filledByWarning;
                      const pendingState = getSlotPendingState(tkb._id, thu, buoi, tiet);
                      const isMoved = pendingState === 'modified'; // tiết mới/sửa
                      const isRemoved = pendingState === 'removed'; // tiết đã xóa (sẽ không hiển thị)

                      return (
                        <td key={`${thu}-${buoi}-${tiet}`}
                            onDragOver={(e) => handleDragOver(e, thu, buoi, tiet)}
                            onDrop={(e) => handleDrop(e, thu, buoi, tiet)}
                            onDragLeave={handleDragLeave}
                            onClick={() => {
                              if (tietHoc) {
                                handleCellClick(thu, buoi, tiet,
                                  [{ ...tietHoc, tkbId: tkb._id, lop: { _id: selectedLop, tenLop: '' } }],
                                  tkb._id, selectedLop);
                              }
                            }}
                            className={`border border-gray-300 px-2 py-2 text-center min-h-16 transition-colors cursor-pointer ${
                              isChaoCo ? 'bg-yellow-100' : ''
                            } ${isDropTarget ? 'bg-yellow-200 border-2 border-yellow-500' : ''}
                            ${isDragging ? 'opacity-50' : ''}
                            ${isMoved ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''}`}
                        >
                          {isChaoCo ? (
                            <div className="text-yellow-700 font-medium">📢 Chào cờ</div>
                          ) : tietHoc ? (
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, tietHoc, thu, buoi, tiet, tkb._id)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClick(thu, buoi, tiet,
                                  [{ ...tietHoc, tkbId: tkb._id, lop: { _id: selectedLop, tenLop: '' } }],
                                  tkb._id, selectedLop);
                              }}
                              className={`cursor-pointer hover:bg-blue-100 rounded p-1 transition-colors ${
                                isMoved ? 'bg-yellow-100 hover:bg-yellow-200' : ''
                              } ${isWarningFill ? 'bg-yellow-200 border border-yellow-400 shadow-sm' : ''}`}
                              title={isWarningFill ? `Đã lấp cảnh báo: ${tietHoc.giaoVien?.hoTen || 'GV'} • ${tietHoc.chuyenMon}` : isMoved ? 'Tiết vừa được di chuyển đến (chưa lưu)' : ''}
                            >
                              <div className="font-medium text-blue-700">{tietHoc.chuyenMon}</div>
                              <div className="text-sm text-gray-600">
                                {tietHoc.giaoVien?.hoTen || 'GV'}
                              </div>
                              {isWarningFill && (
                                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">Lấp cảnh báo</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // TKB theo giáo viên
  const renderGVSchedule = () => {
    if (!selectedGV) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p>Chọn giáo viên để xem lịch dạy</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      );
    }

    if (gvSchedule.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p>Giáo viên chưa có lịch dạy</p>
        </div>
      );
    }

    const weekdays = [2, 3, 4, 5, 6];
    const buois = ['sang', 'chieu'];
    const previewSched = getPreviewGvSchedule();
    const selectedTeacher = giaoViens.find(gv => String(gv._id) === String(selectedGV));
    const teacherBranch = normalizePhanHieu(selectedTeacher?.phanHieu);
    // eslint-disable-next-line no-unused-vars
    const _tick = reloadTick; // ép React track reloadTick để force re-render

    return (
      <div className="overflow-x-auto" data-tick={reloadTick}>
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="text-sm text-blue-800">
            💡 <b>Cách đổi tiết:</b> Click vào ô có tiết (chọn) → Click ô khác có tiết (đổi chỗ 2 tiết). Click lại ô đang chọn để bỏ.
            {selectedSlot && (
              <span className="ml-3 inline-block px-2 py-1 bg-blue-600 text-white rounded text-xs">
                Đã chọn: {THU_NAMES[selectedSlot.thu]} - {BUOI_CONFIG[selectedSlot.buoi].label} - Tiết {selectedSlot.tiet} ({selectedSlot.tietData?.lop?.tenLop})
              </span>
            )}
          </div>
        </div>
        <table className="min-w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-center w-24">Buổi/Tiết</th>
              {weekdays.map(thu => (
                <th key={thu} className="border border-gray-300 px-4 py-3 text-center">
                  {THU_NAMES[thu]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buois.map(buoi => (
              <Fragment key={`gv-${buoi}`}>
                <tr className="bg-blue-50">
                  <td colSpan={6} className="border border-gray-300 px-4 py-2 font-semibold text-blue-800">
                    Buổi {BUOI_CONFIG[buoi].label}
                  </td>
                </tr>
                {BUOI_CONFIG[buoi].tiets.map(tiet => (
                  <tr key={`${buoi}-${tiet}`} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-center bg-gray-50 font-medium">
                      Tiết {tiet}
                    </td>
                    {weekdays.map(thu => {
                      const tietHocs = previewSched.filter(
                        s => s.thu === thu && s.buoi === buoi && s.tiet === tiet
                      );
                      const isDropTarget = dropTarget?.thu === thu && dropTarget?.buoi === buoi && dropTarget?.tiet === tiet;
                      const isSelected = selectedSlot && selectedSlot.thu === thu && selectedSlot.buoi === buoi && selectedSlot.tiet === tiet;
                      const hasWarningFill = tietHocs.some(item => item.filledByWarning);

                      return (
                        <td key={`${thu}-${buoi}-${tiet}`}
                            onDragOver={(e) => handleDragOver(e, thu, buoi, tiet)}
                            onDrop={(e) => handleDrop(e, thu, buoi, tiet)}
                            onDragLeave={handleDragLeave}
                            onClick={() => {
                              const firstTiet = tietHocs[0];
                              handleCellClick(thu, buoi, tiet, tietHocs, firstTiet?.tkbId, firstTiet?.lop?._id);
                            }}
                            className={`border border-gray-300 px-2 py-2 text-center min-h-16 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-200 border-2 border-blue-600 ring-2 ring-blue-400'
                                : isDropTarget
                                  ? 'bg-yellow-200 border-2 border-yellow-500'
                                  : hasWarningFill
                                    ? 'bg-yellow-50'
                                    : 'hover:bg-blue-50'
                            }`}
                        >
                          {tietHocs.length > 0 ? (
                            <div className="space-y-1">
                              {tietHocs.map((tietHoc, idx) => {
                                const tietTkbId = tietHoc.tkbId || lopTkbMap[tietHoc.lop?._id];
                                const isCrossBranch = teacherBranch && normalizePhanHieu(tietHoc.lop?.phanHieu) !== teacherBranch;
                                const isWarningFill = !!tietHoc.filledByWarning;
                                return (
                                  <div key={`${thu}-${buoi}-${tiet}-${idx}`}
                                       className={`rounded p-1 transition-colors ${
                                         isWarningFill
                                           ? 'bg-yellow-200 border border-yellow-400 shadow-sm'
                                           : isSelected
                                             ? 'bg-blue-300 border-2 border-blue-700'
                                             : isCrossBranch
                                               ? 'bg-red-100 hover:bg-red-200'
                                               : 'bg-green-100 hover:bg-green-200'
                                       } cursor-pointer`}
                                       draggable
                                       onDragStart={(e) => handleDragStart(e, tietHoc, thu, buoi, tiet, tietTkbId, tietHoc.lop?._id)}
                                       onDragEnd={handleDragEnd}
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleCellClick(thu, buoi, tiet, tietHocs, tietTkbId, tietHoc.lop?._id);
                                       }}
                                  >
                                    <div className={`font-medium text-sm ${isWarningFill ? 'text-yellow-900' : isCrossBranch ? 'text-red-800' : 'text-green-800'}`}>{tietHoc.lop?.tenLop}</div>
                                    <div className={`text-xs ${isWarningFill ? 'text-yellow-700' : isCrossBranch ? 'text-red-600' : 'text-green-600'}`}>{tietHoc.chuyenMon}</div>
                                    {isWarningFill && <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-800">Lấp cảnh báo</div>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading && lops.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Banner: luôn hiển thị khi có unresolved HOẶC vừa chạy assignOverflow xong */}
      {(() => {
        const unresolvedTotal = unresolvedCases.totalCount || 0;
        const last = lastResolution && !lastResolution.hidden ? lastResolution : null;
        if (unresolvedTotal === 0 && !last) return null;

        // === TRƯỜNG HỢP CÒN UNRESOLVED (đỏ) ===
        if (unresolvedTotal > 0) {
          return (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-300 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-xl">⚠️</div>
                  <div>
                    <div className="text-sm font-bold text-red-800">
                      Có {unresolvedTotal} lớp-môn chưa xếp được
                    </div>
                    <div className="text-xs text-red-600 mt-0.5">
                      {Object.keys(unresolvedCases.groups).map((ph, i) =>
                        `${ph} (${unresolvedCases.groups[ph].length})`
                      ).join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      // Bấm "Xem lại" → toggle hiển thị inline (scroll xuống xem)
                      const el = document.getElementById('unresolved-detail-anchor');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
                  >
                    📋 Hiện chi tiết
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await tkbAPI.getUnresolvedCases(namHoc);
                        const data = res?.data?.data;
                        const total = data?.summary?.totalMissingClasses || data?.missingClasses?.length || 0;
                        if (total > 0 && data.missingClasses) {
                          const groups = {};
                          for (const mc of data.missingClasses) {
                            const ph = mc.phanHieu || '(không rõ)';
                            if (!groups[ph]) groups[ph] = [];
                            const reasonMatch = mc.message ? mc.message.match(/\(([^)]+)\)/) : null;
                            groups[ph].push({
                              lop: mc.lop, mon: mc.mon,
                              missing: mc.soTietConThieu, needed: mc.soTietConThieu,
                              reason: reasonMatch ? reasonMatch[1] : 'không rõ',
                            });
                          }
                          setUnresolvedCases({ groups, totalCount: total });
                        } else {
                          setUnresolvedCases({ groups: {}, totalCount: 0 });
                        }
                        setError(`Đã tải lại: ${total} lớp-môn chưa xếp được`);
                        setTimeout(() => setError(null), 3000);
                      } catch (e) {
                        setError('Lỗi tải lại: ' + e.message);
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-white border border-red-300 hover:bg-red-100 text-red-700 rounded-lg font-semibold"
                    title="Tải lại danh sách lớp-môn chưa xếp được từ server"
                  >
                    🔄 Tải lại
                  </button>
                  <button
                    onClick={() => handleSapDieuChuyen()}
                    className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold"
                    title="Tự động điều chuyển GV từ phân hiệu khác để lấp các lớp-môn đang thiếu"
                  >
                    🔄 Điều chuyển tự động
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Xóa ${unresolvedTotal} lớp-môn khỏi danh sách chưa xử lý?`)) return;
                      setUnresolvedCases({ groups: {}, totalCount: 0 });
                      try { await tkbAPI.clearUnresolvedCases(namHoc); } catch {}
                    }}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded-lg"
                  >
                    Đóng
                  </button>
                </div>
              </div>

              {/* Hiện chi tiết các lớp-môn chưa xếp được luôn, không cần bấm */}
              <div id="unresolved-detail-anchor" />
              <UnresolvedCasesList groups={unresolvedCases.groups} totalCount={unresolvedTotal} />

              {/* Nếu vừa chạy xong nhưng vẫn còn unresolved, hiển thị luôn phần đã giải quyết */}
              {last && last.resolvedFromUnresolved.length > 0 && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <div className="text-xs font-semibold text-emerald-700 mb-1">
                    ✅ Lần chạy vừa rồi đã phân công {last.resolvedFromUnresolved.length} case
                    ({last.soAddCases} thêm mới + {last.soMoveCases} điều chuyển) — vẫn còn {unresolvedTotal} case chưa xếp được.
                  </div>
                  <LastResolutionDetail last={last} />
                </div>
              )}
            </div>
          );
        }

        // === TRƯỜNG HỢP ĐÃ HẾT UNRESOLVED, VỪA CHẠY XONG (xanh) ===
        if (last && last.resolvedFromUnresolved.length > 0) {
          const uniqueGVs = new Set(last.resolvedFromUnresolved.map(r => r.gvTen).filter(Boolean));
          const uniquePHs = new Set(last.resolvedFromUnresolved.map(r => r.phanHieu).filter(Boolean));
          return (
            <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-300 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-xl">✅</div>
                  <div>
                    <div className="text-sm font-bold text-emerald-800">
                      ✅ Đã phân công xong {last.resolvedFromUnresolved.length} lớp-môn
                      ({last.soAddCases} thêm mới + {last.soMoveCases} điều chuyển)
                      · {uniqueGVs.size} GV · {uniquePHs.size} phân hiệu
                    </div>
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Danh sách đã phân công (GV · phân hiệu · buổi · tiết):
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setLastResolution({ ...last, hidden: true })}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded-lg"
                  >
                    Đóng
                  </button>
                </div>
              </div>
              {/* Luôn hiển thị chi tiết, không cần bấm */}
              <LastResolutionDetail last={last} />
            </div>
          );
        }

        return null;
      })()}

      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Thời Khóa Biểu</h2>
        <div className="flex gap-4 items-center">
          <select
            value={namHoc}
            onChange={(e) => setNamHoc(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="2024-2025">2024-2025</option>
            <option value="2025-2026">2025-2026</option>
            <option value="2026-2027">2026-2027</option>
          </select>
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            📥 Xuất Excel
          </button>
          <button
            onClick={handleOpenSapTheoPhanHieu}
            disabled={generating}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              generating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title="Sắp xếp TKB cho 1 phân hiệu cụ thể - GV ở phân hiệu sẽ dạy đủ tiết tại phân hiệu chính trước"
          >
            🎯 Sắp theo phân hiệu
          </button>
          <button
            onClick={handleSapDieuChuyen}
            disabled={generating || !hasPhanHieuScheduled}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              generating || !hasPhanHieuScheduled
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
            title={
              !hasPhanHieuScheduled
                ? 'Vui lòng chạy "Sắp theo phân hiệu" trước'
                : 'Phân bổ GV dư ở phân hiệu chính sang phân hiệu đang thiếu (theo phanHieuDieuChuyen)'
            }
          >
            🔄 Sắp điều chuyển
          </button>
          <button
            onClick={handleOpenDieuChuyenHistory}
            className="px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors flex items-center gap-1"
            title="Xem lịch sử các lần Sắp điều chuyển trước đó"
          >
            📜 Lịch sử điều chuyển
          </button>
          <button
            onClick={handleGenerateTKB}
            disabled={generating}
            className={`px-3 py-2 rounded-lg text-white transition-colors text-sm ${
              generating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gray-500 hover:bg-gray-600'
            }`}
            title="Sắp xếp TKB toàn trường (cũ - không khuyến nghị)"
          >
            ⋯
          </button>
          <button
            onClick={handleDeleteAllTkb}
            disabled={generating}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              generating
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'
            }`}
            title={`Xóa tất cả TKB của năm học ${namHoc} (không thể khôi phục)`}
          >
            🗑️ Xóa hết TKB
          </button>
        </div>
      </div>

      {/* Progress Bar - hiển thị khi đang chạy autoGenerate */}
      {generating && progress && (
        <div className="bg-white rounded-lg shadow p-4 mb-6 border-2 border-blue-300">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
              <span className="font-semibold text-gray-800">
                {progress.stage === 'init' && '🚀 Khởi động'}
                {progress.stage === 'cleanup' && '🧹 Dọn dẹp TKB cũ'}
                {progress.stage === 'greedy' && '📚 Sắp xếp từng lớp'}
                {progress.stage === 'optimize-prep' && '⚙️ Chuẩn bị tối ưu'}
                {progress.stage === 'optimize' && '🎯 Tối ưu nguyện vọng'}
                {progress.stage === 'repair' && '🔧 Sửa xung đột'}
                {progress.stage === 'save' && '💾 Lưu thời khóa biểu'}
                {progress.stage === 'done' && '✅ Hoàn tất'}
                {progress.stage === 'error' && '❌ Lỗi'}
                {!['init','cleanup','greedy','optimize-prep','optimize','repair','save','done','error'].includes(progress.stage) && '⏳ Đang xử lý'}
              </span>
            </div>
            <span className="font-mono font-bold text-blue-700 text-lg">
              {progress.percent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progress.stage === 'error'
                  ? 'bg-red-500'
                  : progress.stage === 'done'
                    ? 'bg-green-500'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
            />
          </div>

          {/* Message */}
          {progress.message && (
            <div className="mt-2 text-sm text-gray-600 truncate" title={progress.message}>
              {progress.message}
            </div>
          )}

          {/* Step indicators */}
          <div className="mt-3 flex justify-between text-xs text-gray-500">
            <span className={progress.percent >= 8 ? 'text-blue-600 font-semibold' : ''}>1. Khởi tạo</span>
            <span className={progress.percent >= 15 ? 'text-blue-600 font-semibold' : ''}>2. Sắp xếp</span>
            <span className={progress.percent >= 75 ? 'text-blue-600 font-semibold' : ''}>3. Tối ưu</span>
            <span className={progress.percent >= 85 ? 'text-blue-600 font-semibold' : ''}>4. Sửa lỗi</span>
            <span className={progress.percent >= 100 ? 'text-green-600 font-semibold' : ''}>5. Lưu</span>
          </div>
        </div>
      )}

      {/* View Mode Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode('lop')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'lop'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Theo Lớp
        </button>
        <button
          onClick={() => setViewMode('giao-vien')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'giao-vien'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Theo Giáo Viên
        </button>
      </div>

      {/* Drag hint */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500">
          💡 Kéo và thả tiết học để di chuyển hoặc đổi chỗ
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLockPanel(!showLockPanel)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              lockMode 
                ? 'bg-purple-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {lockMode ? '🔓 Đang bật khóa ưu tiên' : '🔒 Bật khóa ưu tiên'}
          </button>
          {hasPendingChanges() && (
            <>
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Undo (Ctrl+Z)"
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors disabled:opacity-30"
              >
                ↶ Undo
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Redo (Ctrl+Y)"
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors disabled:opacity-30"
              >
                ↷ Redo
              </button>
              <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                📝 {pendingCount()} thay đổi chưa lưu
              </span>
              <button
                onClick={handleCommitChanges}
                disabled={committing}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {committing ? '⏳ Đang áp dụng...' : '✅ Xác nhận & Áp dụng'}
              </button>
              <button
                onClick={handleCancelChanges}
                disabled={committing}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
              >
                ✖ Hủy
              </button>
            </>
          )}
          {lockMode && lockedGVs.length > 0 && (
            <button
              onClick={handleFinishRearrange}
              disabled={rearranging}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
            >
              {rearranging ? '⏳ Đang sắp xếp lại...' : '✨ Sắp xếp lại các lớp khác'}
            </button>
          )}
        </div>
      </div>

      {/* Lock panel */}
      {showLockPanel && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-purple-600 text-xl">🔒</span>
            <div className="flex-1">
              <h4 className="font-semibold text-purple-800 mb-1">Chế độ khóa ưu tiên giáo viên</h4>
              <p className="text-sm text-purple-700">
                Bật chế độ này, chọn giáo viên cần khóa. Khi kéo thả, hệ thống sẽ <b>bỏ qua check trùng</b> cho các giáo viên đã khóa. 
                Sau khi kéo xong, nhấn "Sắp xếp lại các lớp khác" để tự động điều chỉnh lịch các lớp còn lại.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setLockMode(!lockMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                lockMode 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-white border border-purple-300 text-purple-700'
              }`}
            >
              {lockMode ? '✓ Đang bật' : 'Bật chế độ khóa'}
            </button>
            {lockedGVs.length > 0 && (
              <button
                onClick={() => setLockedGVs([])}
                className="px-3 py-1.5 rounded-lg text-sm text-purple-700 hover:bg-purple-100"
              >
                Bỏ chọn tất cả
              </button>
            )}
            <span className="text-sm text-purple-700 ml-2">
              Đã chọn: <b>{lockedGVs.length}</b> giáo viên
            </span>
          </div>

          {/* Danh sách GV */}
          <div className="max-h-48 overflow-y-auto bg-white rounded-lg p-3 border border-purple-200">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {giaoViens.map(gv => (
                <label key={gv._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-purple-50 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={lockedGVs.includes(gv._id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setLockedGVs([...lockedGVs, gv._id]);
                      } else {
                        setLockedGVs(lockedGVs.filter(id => id !== gv._id));
                      }
                    }}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>{gv.hoTen}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        {viewMode === 'lop' ? (
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Phân hiệu</label>
              <select
                value={selectedPhanHieu}
                onChange={(e) => handlePhanHieuChange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tất cả phân hiệu</option>
                {phanHieuOptions.map(phanHieu => (
                  <option key={phanHieu} value={phanHieu}>{phanHieu}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Khối</label>
              <select
                value={selectedKhoi}
                onChange={(e) => handleKhoiChange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tất cả các khối</option>
                {khois.map(k => (
                  <option key={k._id} value={k._id}>{k.tenKhoi}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Lớp</label>
              <select
                value={selectedLop}
                onChange={(e) => setSelectedLop(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-32"
              >
                {filteredLops.map(l => (
                  <option key={l._id} value={l._id}>{l.tenLop}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Phân hiệu</label>
              <select
                value={selectedPhanHieu}
                onChange={(e) => handlePhanHieuChange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tất cả phân hiệu</option>
                {phanHieuOptions.map(phanHieu => (
                  <option key={phanHieu} value={phanHieu}>{phanHieu}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Giáo Viên</label>
              <select
                value={selectedGV}
                onChange={(e) => setSelectedGV(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-48"
              >
                <option value="">Chọn giáo viên</option>
                {filteredGiaoViens.filter(g => g.trangThai === 'active').map(gv => (
                  <option key={gv._id} value={gv._id}>
                    {gv.hoTen} ({gv.chuyenMon.map(c => c.tenChuyenMon).join(', ')})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* TKB Info */}
      {viewMode === 'lop' && tkb && (
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-lg text-blue-800">
            {tkb.lop?.tenLop} - {tkb.lop?.khoi?.tenKhoi}
          </h3>
          <p className="text-blue-600">Năm học: {tkb.namHoc}</p>
        </div>
      )}

      {/* TKB Content */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Đang tải...</p>
          </div>
        ) : (
          viewMode === 'lop' ? renderTKBGrid() : renderGVSchedule()
        )}
      </div>

      {/* Thống kê nguyện vọng buổi */}
      {thongKeBuoi && thongKeBuoi.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800">Thống kê nguyện vọng số buổi của giáo viên</h3>
            {thongKeBuoi.some(row => row.phanHieu) && (
              <div className="flex gap-2 items-center text-sm">
                <span className="text-gray-600">Lọc phân hiệu:</span>
                <select
                  value={thongKeBuoiFilter || ''}
                  onChange={(e) => setThongKeBuoiFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="">Tất cả</option>
                  {[...new Set(thongKeBuoi.map(r => r.phanHieu).filter(Boolean))].sort().map(ph => (
                    <option key={ph} value={ph}>{ph}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Phân hiệu</th>
                  <th className="px-3 py-2 text-left">Giáo viên</th>
                  <th className="px-3 py-2 text-center">Nguyện vọng</th>
                  <th className="px-3 py-2 text-center">Thực tế</th>
                  <th className="px-3 py-2 text-center">Chênh lệch</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {thongKeBuoi
                  .filter(row => !thongKeBuoiFilter || row.phanHieu === thongKeBuoiFilter)
                  .map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-gray-600">
                      {row.phanHieu ? (
                        <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                          {row.phanHieu}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.gv}</td>
                    <td className="px-3 py-2 text-center">{row.desired ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{row.actual}</td>
                    <td className="px-3 py-2 text-center font-medium">
                      {row.desired == null ? '—' : (() => {
                        const diff = row.actual - row.desired;
                        if (diff === 0) return <span className="text-green-700">0</span>;
                        if (diff > 0) return <span className="text-orange-700">+{diff}</span>;
                        return <span className="text-blue-700">{diff}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.satisfied === null ? (
                        <span className="text-gray-500">—</span>
                      ) : row.satisfied ? (
                        <span className="text-green-700">✓ Đạt</span>
                      ) : (
                        <span className="text-orange-700">⚠ Không đạt</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 text-sm text-gray-600">
        <h4 className="font-medium mb-2">Ghi chú:</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><span className="bg-yellow-100 px-2 py-1 rounded">Tiết 1 buổi sáng</span>: Luôn là Chào cờ</li>
          <li>Sáng: 4 tiết (1-4), Chiều: 3 tiết (5-7)</li>
          <li>Học từ Thứ 2 đến Thứ 6</li>
        </ul>
      </div>

      {/* Modal xác nhận sắp xếp TKB - chuyên nghiệp */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !generating && setShowConfirmModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 my-8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header gradient */}
            <div className="px-6 py-5 bg-gradient-to-r from-green-600 to-emerald-600 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">
                    🔄
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Sắp xếp Thời Khóa Biểu tự động</h3>
                    <p className="text-sm text-green-50 mt-0.5">Năm học {namHoc}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={generating}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                  title="Đóng"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  📋 Quy tắc sắp xếp
                </h4>
                <ul className="space-y-2.5">
                  {QUY_TAC_TKB.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-700">
                      <span className="text-lg leading-none mt-0.5">{rule.icon}</span>
                      <span className="flex-1">{rule.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-2">
                <div className="flex items-start gap-3">
                  <span className="text-amber-600 text-xl">⚠️</span>
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-amber-900 mb-1">Lưu ý quan trọng</p>
                    <p className="text-amber-800">
                      <b>Dữ liệu TKB cũ</b> của tất cả các lớp trong năm học <b>{namHoc}</b> sẽ bị
                      <b className="text-red-700"> thay thế hoàn toàn</b>. Hành động này không thể hoàn tác.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-blue-600 text-xl">ℹ️</span>
                  <div className="flex-1 text-sm text-blue-800">
                    <p>
                      Hệ thống sẽ <b>đảm bảo đủ số tiết</b> cho mỗi lớp theo phân công chuyên môn.
                      Nếu không thể xếp đủ, hệ thống sẽ thông báo lỗi cụ thể để bạn bổ sung giáo viên
                      hoặc điều chỉnh nguyện vọng.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={generating}
                className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={confirmGenerateTKB}
                disabled={generating}
                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang sắp xếp...
                  </>
                ) : (
                  <>🚀 Bắt đầu sắp xếp</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {lastWarnings.length > 0 && (
        <button
          onClick={() => {
            setWarningModal({
              title: 'Cảnh báo',
              message: 'Đã sắp xếp TKB cho tất cả lớp. Dưới đây là các cảnh báo từ lần sắp xếp gần nhất:',
              warnings: lastWarnings,
              extraCount: lastWarnings.length
            });
            setShowAllWarnings(false);
          }}
          className="fixed right-5 bottom-16 z-40 px-4 py-2 rounded-lg bg-[#d8a75a] text-[#2a1d0d] font-bold shadow-lg hover:bg-[#e5b86a] transition-colors"
        >
          Xem cảnh báo
        </button>
      )}

      {/* Modal chọn phân hiệu để sắp TKB */}
      {showPhanHieuModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !generating && setShowPhanHieuModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 my-8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">
                  🎯
                </div>
                <div>
                  <h3 className="text-xl font-bold">Sắp TKB theo phân hiệu</h3>
                  <p className="text-sm text-blue-50 mt-0.5">Năm học {namHoc}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chọn phân hiệu cần sắp xếp <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedPhanHieuForGenerate}
                  onChange={(e) => setSelectedPhanHieuForGenerate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={generating}
                >
                  <option value="">-- Chọn phân hiệu --</option>
                  {phanHieuOptions.map(ph => (
                    <option key={ph} value={ph}>{ph}</option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-2">
                <p className="mb-1">ℹ️ <b>Quy tắc sắp theo phân hiệu:</b></p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Chỉ xếp TKB cho các lớp thuộc phân hiệu đã chọn.</li>
                  <li>GV cùng phân hiệu sẽ được ưu tiên dạy.</li>
                  <li>1 môn trong 1 lớp luôn do 1 GV phụ trách.</li>
                  <li>Nếu GV không đủ slot → vẫn dạy tăng tiết (có nhắc nhở).</li>
                  <li>Sau khi xong, chạy "Sắp điều chuyển" để phân bổ GV dư.</li>
                </ul>
              </div>

              {phanHieuOptions.length === 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  ⚠️ Chưa có phân hiệu nào. Vui lòng cấu hình phân hiệu cho các lớp trước.
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setShowPhanHieuModal(false)}
                disabled={generating}
                className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmSapTheoPhanHieu}
                disabled={generating || !selectedPhanHieuForGenerate}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang sắp xếp...
                  </>
                ) : (
                  <>🚀 Bắt đầu sắp</>
                )}
              </button>
              <button
                onClick={handleSapTatCaPhanHieu}
                disabled={generating || phanHieuOptions.length === 0}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                title={`Sắp TKB cho TẤT CẢ ${phanHieuOptions.length} phân hiệu (chạy tuần tự)`}
              >
                🚀 Tạo tất cả phân hiệu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal chọn cách xử lý khi sắp TKB theo phân hiệu gặp lớp thiếu GV */}
      {showPostScheduleChoiceModal && postScheduleContext && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
          onClick={() => setShowPostScheduleChoiceModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 bg-gradient-to-r from-red-500 to-orange-500 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">⚠️</div>
                <div>
                  <h3 className="text-xl font-bold">Có {postScheduleContext.missingCount} lớp-môn bị thiếu GV</h3>
                  <p className="text-sm text-orange-50 mt-0.5">
                    Phân hiệu <b>"{postScheduleContext.targetPhanHieu}"</b> không xếp đủ GV cho một số lớp
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-gray-700 mb-4">
                Chọn cách xử lý tiếp theo:
              </p>
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    setShowPostScheduleChoiceModal(false);
                    await handleSapDieuChuyen();
                  }}
                  className="w-full text-left p-4 border-2 border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded-lg transition"
                >
                  <div className="font-semibold text-gray-800 flex items-center gap-2">
                    🔄 Điều chuyển tự động GV thiếu tiết
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Tự động tìm GV <b>cùng chuyên môn</b> đang ở phân hiệu khác (thiếu tiết so với định mức)
                    → điều chuyển sang lớp đang thiếu.
                  </div>
                </button>
                <button
                  onClick={async () => {
                    setShowPostScheduleChoiceModal(false);
                    // Sắp tuần tự các phân hiệu còn lại (chưa có TKB) trước
                    const remaining = phanHieuOptions.filter(ph => ph !== postScheduleContext.targetPhanHieu && !scheduledPhanHieus.includes(ph));
                    for (const ph of remaining) {
                      await runTkbJob(
                        () => tkbAPI.autoGenerateByPhanHieu(namHoc, ph),
                        `Sắp TKB phân hiệu "${ph}"`
                      );
                      setScheduledPhanHieus(prev => prev.includes(ph) ? prev : [...prev, ph]);
                    }
                    await handleSapDieuChuyen();
                  }}
                  className="w-full text-left p-4 border-2 border-orange-300 hover:border-orange-500 hover:bg-orange-50 rounded-lg transition"
                >
                  <div className="font-semibold text-gray-800 flex items-center gap-2">
                    ⏩ Sắp các phân hiệu khác trước, rồi tự động điều chuyển
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Tự động chạy sắp TKB cho <b>tất cả phân hiệu chưa có TKB</b> theo thứ tự,
                    sau đó mới tự động điều chuyển GV (pool ứng viên rộng hơn).
                  </div>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end">
              <button
                onClick={() => setShowPostScheduleChoiceModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded"
              >
                Để sau
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal gợi ý điều chuyển GV thiếu tiết */}
      {showDieuChuyenModal && dieuChuyenData && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
          onClick={() => !dieuChuyenLoading && setShowDieuChuyenModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 my-6 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">🔁</div>
              <div className="flex-1">
                <h3 className="text-xl font-bold">Điều chuyển GV thiếu tiết → lớp bị thiếu GV</h3>
                <p className="text-sm text-orange-50 mt-0.5">
                  Phân hiệu đích: <b>{dieuChuyenData.targetPhanHieu}</b> · Các phân hiệu đã sắp: <b>{dieuChuyenData.scheduledPhanHieus.join(', ') || '(chưa có)'}</b>
                </p>
              </div>
              <button
                onClick={() => setShowDieuChuyenModal(false)}
                className="text-white text-2xl hover:bg-white hover:bg-opacity-20 rounded p-1"
              >×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {dieuChuyenLoading ? (
                <div className="flex items-center justify-center h-40 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-3" />
                  Đang tính toán gợi ý điều chuyển...
                </div>
              ) : (
                <>
                  {/* Lớp thiếu GV */}
                  <div className="mb-5">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      🚨 Lớp đang thiếu GV tại phân hiệu "{dieuChuyenData.targetPhanHieu}"
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                        {dieuChuyenData.missingClasses.length} lớp-môn
                      </span>
                    </h4>
                    {dieuChuyenData.missingClasses.length === 0 ? (
                      <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                        ✅ Tất cả lớp ở phân hiệu "{dieuChuyenData.targetPhanHieu}" đã được xếp GV đầy đủ.
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-red-50">
                            <tr>
                              <th className="px-3 py-2 text-left">Lớp</th>
                              <th className="px-3 py-2 text-left">Môn thiếu</th>
                              <th className="px-3 py-2 text-center">Số tiết còn thiếu</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dieuChuyenData.missingClasses.map((mc, idx) => (
                              <tr key={idx} className="border-t hover:bg-red-50">
                                <td className="px-3 py-2 font-medium">{mc.lopTen}</td>
                                <td className="px-3 py-2"><span className="px-2 py-0.5 bg-red-100 text-red-800 rounded">{mc.mon}</span></td>
                                <td className="px-3 py-2 text-center font-bold text-red-700">{mc.canThem} tiết</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Ứng viên GV thiếu tiết */}
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      💼 GV khác phân hiệu, cùng chuyên môn & đang thiếu tiết
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                        {dieuChuyenData.candidates.length} ứng viên
                      </span>
                    </h4>
                    {dieuChuyenData.candidates.length === 0 ? (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                        ⚠️ Không tìm thấy GV khác phân hiệu đang thiếu tiết (soTietDaDay + soTietKiemNhiem &lt; soTietDinhMuc).
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(dieuChuyenData.byMon).map(([mon, list]) => (
                          <div key={mon} className="border rounded-lg overflow-hidden">
                            <div className="px-3 py-2 bg-blue-50 font-medium text-blue-800 border-b">
                              📘 {mon} <span className="text-xs text-gray-500">({list.length} GV)</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-1 text-left">Giáo viên</th>
                                  <th className="px-3 py-1 text-left">Phân hiệu</th>
                                  <th className="px-3 py-1 text-center">Đã dạy / Kiêm nhiệm</th>
                                  <th className="px-3 py-1 text-center">Định mức</th>
                                  <th className="px-3 py-1 text-center">Còn thiếu (tổng)</th>
                                  <th className="px-3 py-1 text-center">Đã dạy tại PH đích</th>
                                </tr>
                              </thead>
                              <tbody>
                                {list.map(c => {
                                  const overloadAtTarget = c.daDayAtTarget > c.conThieu;
                                  return (
                                    <tr
                                      key={c.gvId}
                                      className={`border-t hover:bg-blue-50 ${overloadAtTarget ? 'bg-red-50' : ''}`}
                                      title={overloadAtTarget
                                        ? `GV đã dạy ${c.daDayAtTarget} tiết tại ${dieuChuyenData.targetPhanHieu}, tổng định mức chỉ còn dư ${c.conThieu} → không nhận thêm được tại phân hiệu đích.`
                                        : ''}
                                    >
                                      <td className="px-3 py-1 font-medium">{c.gv?.hoTen || c.gv?.ten || '—'}</td>
                                      <td className="px-3 py-1"><span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">{c.phanHieu}</span></td>
                                      <td className="px-3 py-1 text-center">{c.daDay} + {c.kiemNhiem}</td>
                                      <td className="px-3 py-1 text-center">{c.dinhMuc}</td>
                                      <td className={`px-3 py-1 text-center font-bold ${c.conThieu > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {c.conThieu > 0 ? `+${c.conThieu}` : c.conThieu}
                                      </td>
                                      <td className={`px-3 py-1 text-center font-bold ${overloadAtTarget ? 'text-red-700' : c.daDayAtTarget > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                        {c.daDayAtTarget > 0 ? c.daDayAtTarget : '—'}
                                        {overloadAtTarget && <span className="ml-1 text-xs">⚠</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                    📌 <b>Cách đọc:</b> <i>Đã dạy tại PH đích</i> = số tiết GV này đang dạy tại <b>{dieuChuyenData.targetPhanHieu}</b> (thường là do điều chuyển từ trước). Nếu cột này ≥ <i>Còn thiếu</i> thì GV đã "gần kín" định mức tại đây — hệ thống tự động điều chuyển có thể sẽ bỏ qua.
                  </div>

                  <div className="mt-5 p-3 bg-yellow-50 border border-yellow-300 rounded text-sm text-yellow-800">
                    💡 <b>Gợi ý:</b> Mở từng lớp-môn thiếu ở trên → dùng nút "Sắp điều chuyển" hoặc chỉnh tay trên TKB để chọn ứng viên phù hợp từ danh sách bên phải.
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
              <button
                onClick={handleOpenDieuChuyenHistory}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 hover:bg-gray-100 rounded flex items-center gap-1"
                title="Xem lại các lần sắp điều chuyển trước"
              >
                📜 Lịch sử điều chuyển
              </button>
              <button
                onClick={() => setShowDieuChuyenModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  setShowDieuChuyenModal(false);
                  setSelectedPhanHieuForGenerate(''); // để user chọn lại phân hiệu khác
                  setShowPhanHieuModal(true);
                }}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded text-sm"
              >
                ⏩ Sắp các phân hiệu khác
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup cảnh báo chung */}
      {warningModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-[900px] max-h-[90vh] rounded-2xl border border-yellow-700/60 bg-[#2d2218] text-[#f4e1b7] shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-yellow-700/50">
              <div className="flex items-center gap-3 text-lg font-bold">
                <span className="text-yellow-300">⚠</span>
                <span>{warningModal.title}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-6">
              <div className="mb-3 text-[#f6efde] whitespace-pre-line">{warningModal.message}</div>

              {warningModal.warnings.length > 0 && (
                <div className="mt-3 rounded-md border border-yellow-700/40 bg-[#3a2a1d] p-3">
                  <div className="font-semibold mb-2 text-yellow-200">
                    {warningModal.title === 'Đã lấp' ? 'Đã lấp:' : 'Cảnh báo:'}
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[#f5e8c9] max-h-[46vh] overflow-y-auto pr-2">
                    {(showAllWarnings ? warningModal.warnings : warningModal.warnings.slice(0, 8)).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                    {!showAllWarnings && warningModal.warnings.length > 8 && (
                      <li className="list-none pl-0 mt-2 text-yellow-200 cursor-pointer underline" onClick={() => setShowAllWarnings(true)}>
                        ... và {warningModal.warnings.length - 8} cảnh báo khác
                      </li>
                    )}
                    {showAllWarnings && warningModal.warnings.length > 8 && (
                      <li className="list-none pl-0 mt-2 text-yellow-200 cursor-pointer underline" onClick={() => setShowAllWarnings(false)}>
                        Thu gọn cảnh báo
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="px-5 py-4 flex justify-end gap-3 border-t border-yellow-700/40 bg-[#2d2218]">
              {warningModal.missingClasses && warningModal.missingClasses.length > 0 && (
                <button
                  onClick={async () => {
                    setWarningModal(null);
                    await handleSapDieuChuyen();
                  }}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold hover:from-orange-600 hover:to-red-600 transition-colors shadow-md"
                >
                  🔄 Sắp điều chuyển ngay
                </button>
              )}
              <button
                onClick={() => {
                  setWarningModal(null);
                  setShowAllWarnings(false);
                }}
                className="px-8 py-2.5 rounded-full bg-[#d8a75a] text-[#2a1d0d] font-bold hover:bg-[#e5b86a] transition-colors shadow-md"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal lỗi có cấu trúc (group theo phân hiệu) khi hệ thống không tự sắp được */}
      {groupedError && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4"
          onClick={() => setGroupedError(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 bg-gradient-to-r from-red-500 to-orange-500 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">❌</div>
                <div>
                  <h3 className="text-xl font-bold">[KHÔNG THỂ TỰ SẮP]</h3>
                  <p className="text-sm text-orange-50 mt-0.5">
                    {Object.values(groupedError.groups).reduce((s, arr) => s + arr.length, 0)} lớp-môn không xếp được,
                    phân bổ ở {Object.keys(groupedError.groups).length} phân hiệu
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              {Object.entries(groupedError.groups).map(([phanHieu, cases]) => (
                <div key={phanHieu} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-red-200">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-red-700">📍 Phân hiệu "{phanHieu}"</span>
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{cases.length} lớp-môn</span>
                    </div>
                    <button
                      onClick={async () => {
                        setGroupedError(null);
                        await handleSapDieuChuyen();
                      }}
                      className="px-3 py-1.5 text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 rounded border border-orange-300 font-semibold flex items-center gap-1"
                      title={`Tự động điều chuyển GV cho phân hiệu "${phanHieu}"`}
                    >
                      🔄 Điều chuyển tự động
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {cases.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="text-red-500 mt-0.5">•</span>
                        <div className="flex-1">
                          <span className="font-semibold text-gray-800">Lớp "{c.lop}"</span>
                          <span className="text-gray-500"> - môn </span>
                          <span className="font-semibold text-gray-800">"{c.mon}"</span>
                          <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">
                            thiếu {c.missing}/{c.needed} tiết
                          </span>
                          <span className="ml-2 text-xs text-gray-500 italic">({c.reason})</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="mt-5 pt-4 border-t border-gray-200 bg-blue-50 -mx-6 px-6 py-4 -mb-5">
                <div className="text-sm font-bold text-blue-800 mb-2">→ Hướng xử lý:</div>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-900">
                  <li>Thêm giáo viên dạy các môn thiếu vào phân hiệu tương ứng.</li>
                  <li>Giảm số tiết/tuần yêu cầu của các lớp.</li>
                  <li>Điều chuyển giáo viên cùng chuyên môn từ phân hiệu khác sang.</li>
                </ol>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(groupedError.raw || '');
                  alert('Đã copy nội dung lỗi vào clipboard');
                }}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded flex items-center gap-1"
              >
                📋 Copy chi tiết
              </button>
              <div className="flex gap-2">
                {groupedError.targetPhanHieu && (
                  <button
                    onClick={() => {
                      setGroupedError(null);
                      handleSapDieuChuyen();
                    }}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold"
                  >
                    🔄 Điều chuyển tự động
                  </button>
                )}
                <button
                  onClick={() => setGroupedError(null)}
                  className="px-5 py-2 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-lg font-semibold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cảnh báo vi phạm nguyện vọng */}
      {viPhamNV && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 my-8 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b bg-orange-50">
              <h3 className="text-lg font-semibold text-orange-800">
                ⚠️ Giáo viên có nguyện vọng - hệ thống không tìm được hướng giải quyết
                {viPhamNV._runPhanHieu && (
                  <span className="ml-2 inline-block px-2 py-0.5 bg-blue-600 text-white rounded text-sm">
                    phân hiệu "{viPhamNV._runPhanHieu}"
                  </span>
                )}
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                Đã phải xếp <b>{viPhamNV.tongSoTiet} tiết</b> vi phạm nguyện vọng giáo viên (do không tìm được phương án khác):
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(() => {
                // Backend đã lọc chỉ trả về GV thuộc phân hiệu đang sắp (hoặc GV không có phanHieu).
                // Hiển thị gọn theo nhóm phanHieu (chỉ phân biệt "đang sắp" vs "không xác định").
                const groups = {};
                for (const gv of viPhamNV.danhSachGV) {
                  const key = gv.phanHieu || '—';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(gv);
                }
                const groupKeys = Object.keys(groups).sort((a, b) => {
                  if (viPhamNV._runPhanHieu) {
                    if (a === viPhamNV._runPhanHieu) return -1;
                    if (b === viPhamNV._runPhanHieu) return 1;
                  }
                  return a.localeCompare(b);
                });

                return groupKeys.map((phanHieuKey) => {
                  const gvsInGroup = groups[phanHieuKey];
                  const isCurrentPhanHieu = viPhamNV._runPhanHieu && phanHieuKey === viPhamNV._runPhanHieu;

                  return (
                    <div key={phanHieuKey} className="mb-4">
                      <div className={`text-sm font-semibold mb-2 px-2 py-1 rounded ${
                        isCurrentPhanHieu
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-gray-100 text-gray-700 border border-gray-300'
                      }`}>
                        {isCurrentPhanHieu
                          ? `🎯 GV phân hiệu "${phanHieuKey}" - ${gvsInGroup.length} GV`
                          : `❓ Phân hiệu không xác định - ${gvsInGroup.length} GV`}
                      </div>
                      <div className="space-y-2">
                        {gvsInGroup.map((gv, idx) => (
                          <div key={`${phanHieuKey}-${idx}`} className="border border-orange-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setExpandedGV(expandedGV === `${phanHieuKey}-${idx}` ? null : `${phanHieuKey}-${idx}`)}
                              className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 flex justify-between items-center text-left"
                            >
                              <div>
                                <div className="font-semibold text-gray-800">{gv.tenGV}</div>
                                <div className="text-sm text-orange-700 mt-0.5">{gv.lyDo}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded">
                                  {gv.soTiet} tiết vi phạm
                                </span>
                                <span className="text-gray-500">
                                  {expandedGV === `${phanHieuKey}-${idx}` ? '▲' : '▼'}
                                </span>
                              </div>
                            </button>

                            {expandedGV === `${phanHieuKey}-${idx}` && (
                              <div className="px-4 py-3 bg-white border-t border-orange-200">
                                <p className="text-sm font-medium text-gray-700 mb-2">Chi tiết các tiết bị ảnh hưởng:</p>
                                <div className="space-y-1 text-sm">
                                  {gv.chiTiet.map((line, i) => (
                                    <div key={i} className="px-2 py-1 bg-gray-50 rounded font-mono text-xs">
                                      {line}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}

              <div className="mt-5 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                💡 <b>Gợi ý xử lý:</b>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Tăng "Số buổi tối đa" cho giáo viên, hoặc</li>
                  <li>Bỏ/bớt "Thứ nghỉ" trong nguyện vọng, hoặc</li>
                  <li>Thêm giáo viên khác cùng chuyên môn để phân bổ tiết</li>
                  {viPhamNV._runPhanHieu && (
                    <li>Cảnh báo này <b>chỉ tính giáo viên thuộc phân hiệu "{viPhamNV._runPhanHieu}"</b>. GV điều chuyển từ phân hiệu khác sẽ được tính khi chạy chức năng "Sắp điều chuyển" riêng.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setViPhamNV(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error notification */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse">
          <div className="flex items-center gap-3">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center gap-3">
            <span>✅</span>
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Swap confirmation modal */}
      {swapConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b bg-yellow-50">
              <h3 className="text-lg font-semibold text-yellow-800">
                🔄 Xác nhận đổi chỗ tiết
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Tiết nguồn:</div>
                  <div className="font-medium">
                    {swapConfirm.source.tietData?.chuyenMon || '?'} - {swapConfirm.source.tietData?.giaoVien?.hoTen || 'GV'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Thứ {swapConfirm.source.thu} | {BUOI_CONFIG[swapConfirm.source.buoi]?.label} | Tiết {swapConfirm.source.tiet}
                  </div>
                </div>
                <div className="text-center text-gray-400">↕️</div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Tiết đích:</div>
                  <div className="font-medium">
                    {swapConfirm.target.tietData?.chuyenMon || '?'} - {swapConfirm.target.tietData?.giaoVien?.hoTen || 'GV'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Thứ {swapConfirm.target.thu} | {BUOI_CONFIG[swapConfirm.target.buoi]?.label} | Tiết {swapConfirm.target.tiet}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-600 text-center">
                Bạn có muốn đổi chỗ 2 tiết này cho nhau không?
              </p>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={cancelSwap}
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={confirmSwap}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors"
              >
                🔄 Đổi chỗ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commit Result Modal: hiển thị conflicts/warnings chi tiết */}
      {commitResult && (commitResult.conflicts.length > 0 || commitResult.warnings.length > 0) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className={`p-4 border-b ${commitResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex justify-between items-center">
                <h3 className={`font-bold text-lg ${commitResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {commitResult.success ? '✅ Kết quả áp dụng' : '❌ Lỗi áp dụng'}
                </h3>
                <button
                  onClick={() => setCommitResult(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              {commitResult.rearranged > 0 && (
                <p className="text-sm text-blue-700 mt-1">
                  Đã tự động sắp xếp lại <b>{commitResult.rearranged}</b> tiết để tránh xung đột
                </p>
              )}
              {commitResult.message && (
                <p className="text-sm text-gray-700 mt-1">{commitResult.message}</p>
              )}
            </div>
            <div className="p-4 space-y-3">
              {commitResult.conflicts.length > 0 && (
                <div>
                  <h4 className="font-semibold text-red-700 mb-2">
                    ⚠️ Xung đột ({commitResult.conflicts.length}):
                  </h4>
                  <ul className="text-sm space-y-2 max-h-60 overflow-y-auto bg-red-50 p-3 rounded">
                    {commitResult.conflicts.slice(0, 20).map((c, idx) => (
                      <li key={idx} className="text-red-800 border-b border-red-200 pb-2 last:border-0">
                        <div className="font-semibold">
                          GV: {c.gvTen || c.gvId} <span className="text-red-600 text-xs">({c.gvChuyenMon || '—'})</span>
                        </div>
                        <div className="text-sm">
                          Trùng lịch dạy môn <b>{c.chuyenMon || '—'}</b> vào thứ {c.thu} {c.buoi === 'sang' ? 'sáng' : 'chiều'} tiết {c.tiet}
                        </div>
                        <div className="text-xs text-red-700 mt-1">
                          Tại các lớp: {c.classes?.join(', ')}
                        </div>
                      </li>
                    ))}
                    {commitResult.conflicts.length > 20 && (
                      <li className="text-red-600 italic">... và {commitResult.conflicts.length - 20} xung đột khác</li>
                    )}
                  </ul>
                </div>
              )}
              {commitResult.warnings.length > 0 && (
                <div>
                  <h4 className="font-semibold text-yellow-700 mb-2">
                    💬 Thông báo ({commitResult.warnings.length}):
                  </h4>
                  <ul className="text-sm space-y-1 max-h-40 overflow-y-auto bg-yellow-50 p-2 rounded">
                    {commitResult.warnings.slice(0, 20).map((w, idx) => (
                      <li key={idx} className="text-yellow-800">{w}</li>
                    ))}
                    {commitResult.warnings.length > 20 && (
                      <li className="text-yellow-600 italic">... và {commitResult.warnings.length - 20} thông báo khác</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setCommitResult(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal lịch sử điều chuyển GV (assignOverflow) */}
      {showDieuChuyenHistoryModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4"
          onClick={() => { setShowDieuChuyenHistoryModal(false); setDieuChuyenHistoryDetail(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 my-6 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-gradient-to-r from-slate-700 to-slate-900 text-white flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">📜</div>
              <div className="flex-1">
                <h3 className="text-xl font-bold">Lịch sử điều chuyển GV (Sắp điều chuyển)</h3>
                <p className="text-sm text-slate-200 mt-0.5">
                  Năm học: <b>{namHoc}</b> · {dieuChuyenHistoryList.length} lần chạy
                </p>
              </div>
              <button
                onClick={() => { setShowDieuChuyenHistoryModal(false); setDieuChuyenHistoryDetail(null); }}
                className="text-white text-2xl hover:bg-white hover:bg-opacity-20 rounded p-1"
              >×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {dieuChuyenHistoryLoading ? (
                <div className="flex items-center justify-center h-40 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mr-3" />
                  Đang tải lịch sử...
                </div>
              ) : dieuChuyenHistoryDetail ? (
                // ==== CHI TIẾT 1 LẦN CHẠY ====
                <div>
                  <button
                    onClick={() => setDieuChuyenHistoryDetail(null)}
                    className="mb-3 text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    ← Quay lại danh sách
                  </button>
                  {dieuChuyenHistoryDetailLoading ? (
                    <div className="flex items-center justify-center h-32 text-gray-500">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600 mr-2" />
                      Đang tải chi tiết...
                    </div>
                  ) : (
                    <DieuChuyenHistoryDetail log={dieuChuyenHistoryDetail} />
                  )}
                </div>
              ) : dieuChuyenHistoryList.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700">
                  📭 Chưa có lần sắp điều chuyển nào được ghi nhận cho năm học này.
                </div>
              ) : (
                // ==== DANH SÁCH ====
                <div className="space-y-2">
                  {dieuChuyenHistoryList.map(log => (
                    <button
                      key={log._id}
                      onClick={() => handleViewDieuChuyenDetail(log._id)}
                      className="w-full text-left p-4 border rounded-lg hover:bg-slate-50 hover:border-slate-400 transition flex items-center gap-4"
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl ${
                        log.status === 'error' ? 'bg-red-500' :
                        log.partialSuccess ? 'bg-orange-500' : 'bg-green-500'
                      }`}>
                        {log.status === 'error' ? '✗' : log.partialSuccess ? '◐' : '✓'}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800">
                          {new Date(log.createdAt).toLocaleString('vi-VN')}
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5">
                          {log.message}
                        </div>
                        <div className="flex gap-3 mt-1 text-xs">
                          <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded">
                            ADD: {log.soAddCases || 0}
                          </span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                            MOVE: {log.soMoveCases || 0}
                          </span>
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                            Tiết GV dư: {log.tongSoTietDieuChuyen}
                          </span>
                          <span className={`px-2 py-0.5 rounded ${
                            log.soStillUnresolved > 0
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            Còn thiếu: {log.soStillUnresolved}
                          </span>
                          {log.duration > 0 && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                              ⏱ {(log.duration / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-gray-400">→</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => { setShowDieuChuyenHistoryModal(false); setDieuChuyenHistoryDetail(null); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Component hiển thị chi tiết 1 lần chạy assignOverflow.
 */
function DieuChuyenHistoryDetail({ log }) {
  const resolved = log.resolvedFromUnresolved || [];
  const stillUnresolved = log.stillUnresolved || [];
  const lichSu = log.lichSuDieuChuyen || [];
  const nhanhChe = log.nhanhCheGV || [];
  const addCases = resolved.filter(r => r.action === 'add');
  const moveCases = resolved.filter(r => r.action === 'move');

  return (
    <div className="space-y-5">
      {/* Tổng quan */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-3 mb-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            log.status === 'error' ? 'bg-red-100 text-red-700' :
            log.partialSuccess ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
          }`}>
            {log.status === 'error' ? 'LỖI' : log.partialSuccess ? 'Một phần' : 'Hoàn tất'}
          </span>
          <span className="text-sm text-gray-600">
            {new Date(log.createdAt).toLocaleString('vi-VN')}
          </span>
          {log.duration > 0 && (
            <span className="text-xs text-gray-500">
              ⏱ {(log.duration / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        <div className="text-sm text-gray-700">{log.message}</div>
      </div>

      {/* Thống kê nhanh */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-xs text-green-700">ADD (slot trống)</div>
          <div className="text-2xl font-bold text-green-800">{addCases.length}</div>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-xs text-blue-700">MOVE (từ lớp khác)</div>
          <div className="text-2xl font-bold text-blue-800">{moveCases.length}</div>
        </div>
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="text-xs text-purple-700">Tiết GV dư → điều chuyển</div>
          <div className="text-2xl font-bold text-purple-800">{log.tongSoTietDieuChuyen || 0}</div>
        </div>
        <div className={`p-3 border rounded-lg ${
          (log.soStillUnresolved || 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className={`text-xs ${(log.soStillUnresolved || 0) > 0 ? 'text-red-700' : 'text-gray-600'}`}>
            Còn lại chưa xếp
          </div>
          <div className={`text-2xl font-bold ${(log.soStillUnresolved || 0) > 0 ? 'text-red-800' : 'text-gray-700'}`}>
            {log.soStillUnresolved || 0}
          </div>
        </div>
      </div>

      {/* Bảng ADD */}
      {addCases.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            ✅ Các case ADD (slot trống + GV rảnh)
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">{addCases.length}</span>
          </h4>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-3 py-2 text-left">Lớp</th>
                  <th className="px-3 py-2 text-left">Môn</th>
                  <th className="px-3 py-2 text-left">GV</th>
                  <th className="px-3 py-2 text-left">Phân hiệu</th>
                  <th className="px-3 py-2 text-center">Thứ</th>
                  <th className="px-3 py-2 text-center">Buổi</th>
                  <th className="px-3 py-2 text-center">Tiết</th>
                </tr>
              </thead>
              <tbody>
                {addCases.map((r, idx) => (
                  <tr key={idx} className="border-t hover:bg-green-50">
                    <td className="px-3 py-1.5 font-medium">{r.lop}</td>
                    <td className="px-3 py-1.5"><span className="px-2 py-0.5 bg-green-100 text-green-800 rounded">{r.mon}</span></td>
                    <td className="px-3 py-1.5">{r.gvTen}</td>
                    <td className="px-3 py-1.5"><span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">{r.phanHieu}</span></td>
                    <td className="px-3 py-1.5 text-center">{r.thu}</td>
                    <td className="px-3 py-1.5 text-center">{r.buoi}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-green-700">{r.tiet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bảng MOVE */}
      {moveCases.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            🔄 Các case MOVE (chuyển tiết từ lớp khác sang)
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{moveCases.length}</span>
          </h4>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-3 py-2 text-left">Lớp đích</th>
                  <th className="px-3 py-2 text-left">Môn</th>
                  <th className="px-3 py-2 text-left">GV</th>
                  <th className="px-3 py-2 text-left">Từ lớp</th>
                  <th className="px-3 py-2 text-left">Từ PH</th>
                  <th className="px-3 py-2 text-center">Môn gốc</th>
                  <th className="px-3 py-2 text-center">Thứ</th>
                  <th className="px-3 py-2 text-center">Buổi</th>
                  <th className="px-3 py-2 text-center">Tiết</th>
                </tr>
              </thead>
              <tbody>
                {moveCases.map((r, idx) => (
                  <tr key={idx} className="border-t hover:bg-blue-50">
                    <td className="px-3 py-1.5 font-medium">{r.lop}</td>
                    <td className="px-3 py-1.5"><span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">{r.mon}</span></td>
                    <td className="px-3 py-1.5">{r.gvTen}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.tuLop}</td>
                    <td className="px-3 py-1.5"><span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs">{r.tuPhanHieu}</span></td>
                    <td className="px-3 py-1.5 text-center">
                      {r.tuMon !== r.mon ? (
                        <span className="text-xs">
                          <span className="line-through text-gray-400">{r.tuMon}</span>
                          {' → '}
                          <b className="text-blue-700">{r.mon}</b>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">(giữ nguyên)</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">{r.thu}</td>
                    <td className="px-3 py-1.5 text-center">{r.buoi}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-blue-700">{r.tiet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GV nhận thêm tiết */}
      {nhanhChe.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            💼 GV bị nhận thêm tiết (vượt định mức)
            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs">{nhanhChe.length}</span>
          </h4>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-50">
                <tr>
                  <th className="px-3 py-2 text-left">Giáo viên</th>
                  <th className="px-3 py-2 text-left">Phân hiệu</th>
                  <th className="px-3 py-2 text-center">Đã dạy</th>
                  <th className="px-3 py-2 text-center">Định mức</th>
                  <th className="px-3 py-2 text-center">Vượt</th>
                </tr>
              </thead>
              <tbody>
                {nhanhChe.map((c, idx) => (
                  <tr key={idx} className={`border-t ${c.soTietDu > 0 ? 'bg-red-50' : 'hover:bg-purple-50'}`}>
                    <td className="px-3 py-1.5 font-medium">{c.gv}</td>
                    <td className="px-3 py-1.5"><span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">{c.phanHieu}</span></td>
                    <td className="px-3 py-1.5 text-center">{c.soTietDaDay}</td>
                    <td className="px-3 py-1.5 text-center">{c.soTietDinhMuc}</td>
                    <td className={`px-3 py-1.5 text-center font-bold ${c.soTietDu > 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {c.soTietDu > 0 ? `+${c.soTietDu}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lịch sử điều chuyển từng tiết (Bước 2 - GV dư) */}
      {lichSu.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            🗂 Chi tiết từng tiết điều chuyển (Bước 2: GV dư → lớp thiếu)
            <span className="bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full text-xs">{lichSu.length}</span>
          </h4>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cyan-50">
                <tr>
                  <th className="px-3 py-2 text-left">GV</th>
                  <th className="px-3 py-2 text-left">Từ PH</th>
                  <th className="px-3 py-2 text-left">Đến PH</th>
                  <th className="px-3 py-2 text-left">Lớp</th>
                  <th className="px-3 py-2 text-left">Môn</th>
                  <th className="px-3 py-2 text-center">Thứ</th>
                  <th className="px-3 py-2 text-center">Buổi</th>
                  <th className="px-3 py-2 text-center">Tiết</th>
                </tr>
              </thead>
              <tbody>
                {lichSu.map((r, idx) => (
                  <tr key={idx} className="border-t hover:bg-cyan-50">
                    <td className="px-3 py-1.5 font-medium">{r.gvTen}</td>
                    <td className="px-3 py-1.5"><span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs">{r.tuPhanHieu}</span></td>
                    <td className="px-3 py-1.5"><span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">{r.denPhanHieu}</span></td>
                    <td className="px-3 py-1.5">{r.lopTen}</td>
                    <td className="px-3 py-1.5">{r.mon}</td>
                    <td className="px-3 py-1.5 text-center">{r.thu}</td>
                    <td className="px-3 py-1.5 text-center">{r.buoi}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-cyan-700">{r.tiet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vẫn chưa xếp được */}
      {stillUnresolved.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            ⚠️ Lớp-môn vẫn chưa điều chuyển được
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">{stillUnresolved.length}</span>
          </h4>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-3 py-2 text-left">Lớp</th>
                  <th className="px-3 py-2 text-left">Môn</th>
                  <th className="px-3 py-2 text-left">Phân hiệu</th>
                  <th className="px-3 py-2 text-center">Tiết thiếu</th>
                  <th className="px-3 py-2 text-left">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {stillUnresolved.map((r, idx) => (
                  <tr key={idx} className="border-t hover:bg-red-50">
                    <td className="px-3 py-1.5 font-medium">{r.lop}</td>
                    <td className="px-3 py-1.5">{r.mon}</td>
                    <td className="px-3 py-1.5">{r.phanHieu}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-red-700">{r.soTietConThieu}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-xs">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThoiKhoaBieuPage;

/**
 * Component hiển thị danh sách các lớp-môn CHƯA xếp được, group theo phân hiệu.
 */
function UnresolvedCasesList({ groups, totalCount }) {
  if (!groups || totalCount === 0) return null;
  const phKeys = Object.keys(groups);

  return (
    <div className="mt-3 px-3 py-2 bg-white border border-red-200 rounded max-h-80 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-700 mb-2">
        📋 Danh sách {totalCount} lớp-môn chưa xếp được:
      </div>
      {phKeys.map(ph => (
        <div key={ph} className="mb-2 last:mb-0">
          <div className="text-xs font-bold text-red-700 mb-1">
            📍 {ph} ({groups[ph].length} lớp-môn):
          </div>
          <ul className="text-xs text-gray-700 space-y-0.5 pl-3">
            {groups[ph].map((c, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-red-600 flex-shrink-0">•</span>
                <span>
                  Lớp "<b className="text-gray-900">{c.lop}</b>" - môn "<b className="text-gray-900">{c.mon}</b>"
                  {' '}<span className="text-red-700 font-semibold">thiếu {c.missing}/{c.needed} tiết</span>
                  {' '}<span className="text-gray-500 italic">({c.reason})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Component hiển thị chi tiết lần assignOverflow vừa chạy xong:
 * cho mỗi case đã giải quyết, ghi rõ "đã phân công cho GV X - PH Y - buổi Z - tiết T".
 */
function LastResolutionDetail({ last }) {
  if (!last || !last.resolvedFromUnresolved) return null;
  const list = last.resolvedFromUnresolved;
  if (list.length === 0) {
    return (
      <div className="mt-2 px-3 py-2 bg-white border border-emerald-200 rounded text-xs text-gray-600">
        Không có case nào được giải quyết (đã hết từ trước, hoặc không có gì để điều chuyển).
      </div>
    );
  }
  const thuLabel = (n) => ['CN','T2','T3','T4','T5','T6','T7'][n] || `T${n}`;
  const buoiLabel = (b) => b === 'sang' ? 'sáng' : b === 'chieu' ? 'chiều' : b;

  return (
    <div className="mt-2 px-3 py-2 bg-white border border-emerald-200 rounded max-h-64 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-700 mb-1">
        📋 Chi tiết phân công ({list.length} case):
      </div>
      <ul className="text-xs text-gray-700 space-y-0.5">
        {list.map((r, idx) => {
          if (r.action === 'move') {
            return (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-orange-600 flex-shrink-0">🔄 MOVE</span>
                <span>
                  <b className="text-gray-900">{r.gvTen || '(không rõ GV)'}</b>
                  {' '}(PH: <span className="text-blue-700">{r.phanHieu || '?'}</span>)
                  → từ lớp "<span className="text-gray-900">{r.tuLop}</span>" môn "<span className="text-gray-900">{r.tuMon}</span>"
                  → sang lớp "<span className="text-gray-900">{r.lop}</span>" môn "<span className="text-gray-900">{r.mon}</span>"
                  {' '}<span className="text-purple-700">{thuLabel(r.thu)} {buoiLabel(r.buoi)} tiết {r.tiet}</span>
                </span>
              </li>
            );
          }
          return (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-emerald-600 flex-shrink-0">✅ ADD</span>
              <span>
                <b className="text-gray-900">{r.gvTen || '(không rõ GV)'}</b>
                {' '}(PH: <span className="text-blue-700">{r.phanHieu || '?'}</span>)
                → lớp "<span className="text-gray-900">{r.lop}</span>" môn "<span className="text-gray-900">{r.mon}</span>"
                {' '}<span className="text-purple-700">{thuLabel(r.thu)} {buoiLabel(r.buoi)} tiết {r.tiet}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
