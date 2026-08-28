import { Fragment, useState, useEffect, useRef } from 'react';
import { lopAPI, khoiAPI, tkbAPI, giaoVienAPI } from '../services/api';

const THU_NAMES = ['', '', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
const BUOI_CONFIG = {
  sang: { label: 'Sáng', tiets: [1, 2, 3, 4], moTa: ['Chào cờ', 'Tiết 2', 'Tiết 3', 'Tiết 4'] },
  chieu: { label: 'Chiều', tiets: [5, 6, 7], moTa: ['Tiết 5', 'Tiết 6', 'Tiết 7'] }
};

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
  const [viPhamNV, setViPhamNV] = useState(null); // {tongSoTiet, danhSachGV} khi có vi phạm
  const [thongKeBuoi, setThongKeBuoi] = useState(null); // mảng thống kê desired/actual per GV
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedLop, setSelectedLop] = useState('');
  const [selectedKhoi, setSelectedKhoi] = useState('');
  const [namHoc, setNamHoc] = useState('2024-2025');
  const [viewMode, setViewMode] = useState('lop'); // 'lop' or 'giao-vien'
  const [selectedGV, setSelectedGV] = useState('');
  const [gvSchedule, setGvSchedule] = useState([]);
  const [allTkbsCache, setAllTkbsCache] = useState([]); // cache tất cả TKB của năm học (cho preview GV)
  const [reloadTick, setReloadTick] = useState(0); // force re-render sau commit
  const [expandedGV, setExpandedGV] = useState(null); // GV đang mở rộng chi tiết
  const [showConfirmModal, setShowConfirmModal] = useState(false); // modal xác nhận sắp xếp TKB

  // Drag & Drop state
  const [draggedTiet, setDraggedTiet] = useState(null); // { tkbId, thu, buoi, tiet, tietData, lopId }
  const [dropTarget, setDropTarget] = useState(null); // { thu, buoi, tiet }
  const [swapConfirm, setSwapConfirm] = useState(null); // { source, target } khi cần xác nhận swap
  const [error, setError] = useState(null); // thông báo lỗi

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

  const confirmGenerateTKB = async () => {
    setShowConfirmModal(false);

    try {
      setGenerating(true);
      setViPhamNV(null);
      setThongKeBuoi(null);
      const result = await tkbAPI.autoGenerate(namHoc);

      if (result.data.success) {
        // Lưu thống kê buổi để hiển thị
        if (result.data.thongKeBuoi) {
          setThongKeBuoi(result.data.thongKeBuoi);
        }
        // Hiện modal vi phạm NV nếu có
        if (result.data.viPhamNV && result.data.viPhamNV.tongSoTiet > 0) {
          setViPhamNV(result.data.viPhamNV);
        } else if (result.data.warnings && result.data.warnings.length > 0) {
          let message = result.data.message + '\n\nCảnh báo:\n' + result.data.warnings.slice(0, 10).join('\n');
          if (result.data.warnings.length > 10) {
            message += `\n... và ${result.data.warnings.length - 10} cảnh báo khác`;
          }
          alert(message);
        } else {
          alert(result.data.message);
        }
      } else {
        alert('Lỗi: ' + result.data.message);
      }

      if (selectedLop) fetchTKB();
      if (selectedGV) fetchGVSchedule();
    } catch (err) {
      alert('Lỗi khi sắp xếp TKB: ' + (err.response?.data?.message || err.message));
    } finally {
      setGenerating(false);
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
    const filteredLops = khoiId 
      ? lops.filter(l => l.khoi === khoiId || l.khoi?._id === khoiId)
      : lops;
    
    setSelectedLop(filteredLops.length > 0 ? filteredLops[0]._id : '');
  };

  const filteredLops = selectedKhoi
    ? lops.filter(l => l.khoi === selectedKhoi || l.khoi?._id === selectedKhoi)
    : lops;

  // Tạo grid TKB - dùng preview
  const renderTKBGrid = () => {
    const previewTkbData = getPreviewTkb(tkb);
    if (!previewTkbData || !previewTkbData.ngayTrongTuan) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Chưa có thời khóa biểu</p>
          <p className="text-sm mt-2">Nhấn "Sắp xếp TKB tự động" để tạo</p>
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
                              }`}
                              title={isMoved ? 'Tiết vừa được di chuyển đến (chưa lưu)' : ''}
                            >
                              <div className="font-medium text-blue-700">{tietHoc.chuyenMon}</div>
                              <div className="text-sm text-gray-600">
                                {tietHoc.giaoVien?.hoTen || 'GV'}
                              </div>
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
                                  : 'hover:bg-blue-50'
                            }`}
                        >
                          {tietHocs.length > 0 ? (
                            <div className="space-y-1">
                              {tietHocs.map((tietHoc, idx) => {
                                const tietTkbId = tietHoc.tkbId || lopTkbMap[tietHoc.lop?._id];
                                return (
                                  <div key={`${thu}-${buoi}-${tiet}-${idx}`}
                                       className={`rounded p-1 transition-colors ${
                                         isSelected
                                           ? 'bg-blue-300 border-2 border-blue-700'
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
                                    <div className="font-medium text-green-800 text-sm">{tietHoc.lop?.tenLop}</div>
                                    <div className="text-xs text-green-600">{tietHoc.chuyenMon}</div>
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
            onClick={handleGenerateTKB}
            disabled={generating}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              generating 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {generating ? 'Đang sắp xếp...' : '🔄 Sắp xếp TKB tự động'}
          </button>
        </div>
      </div>

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
          <div className="flex gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Giáo Viên</label>
              <select
                value={selectedGV}
                onChange={(e) => setSelectedGV(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-48"
              >
                <option value="">Chọn giáo viên</option>
                {giaoViens.filter(g => g.trangThai === 'active').map(gv => (
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
          <h3 className="font-semibold text-gray-800 mb-3">Thống kê nguyện vọng số buổi của giáo viên</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Giáo viên</th>
                  <th className="px-3 py-2 text-center">Nguyện vọng</th>
                  <th className="px-3 py-2 text-center">Thực tế</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {thongKeBuoi.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{row.gv}</td>
                    <td className="px-3 py-2 text-center">{row.desired ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{row.actual}</td>
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

      {/* Modal cảnh báo vi phạm nguyện vọng */}
      {viPhamNV && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 my-8 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b bg-orange-50">
              <h3 className="text-lg font-semibold text-orange-800">
                ⚠️ Giáo viên có nguyện vọng - hệ thống không tìm được hướng giải quyết
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                Đã phải xếp <b>{viPhamNV.tongSoTiet} tiết</b> vi phạm nguyện vọng giáo viên (do không tìm được phương án khác):
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {viPhamNV.danhSachGV.map((gv, idx) => (
                  <div key={idx} className="border border-orange-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedGV(expandedGV === idx ? null : idx)}
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
                          {expandedGV === idx ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {expandedGV === idx && (
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

              <div className="mt-5 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                💡 <b>Gợi ý xử lý:</b>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Tăng "Số buổi tối đa" cho giáo viên, hoặc</li>
                  <li>Bỏ/bớt "Thứ nghỉ" trong nguyện vọng, hoặc</li>
                  <li>Thêm giáo viên khác cùng chuyên môn để phân bổ tiết</li>
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
    </div>
  );
}

export default ThoiKhoaBieuPage;
