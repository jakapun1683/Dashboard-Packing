import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LabelList
} from 'recharts';
import {
  RefreshCw, User, Users, Calendar, Clock, Box, Truck, TrendingUp, Filter, AlertCircle, Info, XCircle,
  Download, Image as ImageIcon, FileText, Loader2
} from 'lucide-react';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQi8zQULkdkvxAqX8R2Sxcej99RFL90cbmQiWUf4CtViqa3XZlQNceThIBGqVMIbSBAKcSl6_2J-7tM/pub?gid=640931357&single=true&output=csv';

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#EAB308', '#D946EF', '#06B6D4', '#22C55E', '#F43F5E', '#A855F7'
];

function parseCSV(str) {
  const arr = [];
  let quote = false;
  let row = 0;
  let col = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c+1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { ++col; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc === '\n' && !quote) { ++row; col = 0; continue; }
    if (cc === '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  return arr;
}

function parseDateExt(dateStr) {
  if (!dateStr) return null;
  const cleanStr = dateStr.split(' ')[0];
  const parts = cleanStr.split(/[\/\-\s]/);
  
  if (parts.length >= 3) {
    let p1 = parseInt(parts[0], 10), p2 = parseInt(parts[1], 10), p3 = parseInt(parts[2], 10);
    let year, month, day;
    
    if (p1 > 1000) { year = p1; month = p2 - 1; day = p3; } 
    else if (p3 > 1000) {
      year = p3;
      if (year > 2500) year -= 543;
      if (p2 > 12) { month = p1 - 1; day = p2; } else { month = p2 - 1; day = p1; }
    } else { return new Date(dateStr); }
    return new Date(year, month, day);
  }
  return new Date(dateStr);
}

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// เพิ่มฟังก์ชั่นคำนวณเลขสัปดาห์ (Week Number)
function getWeekNumber(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 p-3 border border-gray-600 rounded-lg shadow-xl z-50">
        <p className="font-semibold text-gray-200 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color || entry.fill }} className="font-medium text-sm">
            {entry.name}: {entry.value.toLocaleString()} ออเดอร์
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// เพิ่มฟังก์ชั่นล็อกสี Channel หลัก
const getChannelColor = (channelName) => {
  const name = String(channelName).toLowerCase();
  if (name.includes('shopee')) return '#F97316'; // สีส้ม
  if (name.includes('tiktok')) return '#000000'; // สีดำ
  if (name.includes('walk in') || name.includes('walk-in') || name.includes('walkin')) return '#9CA3AF'; // สีเทา
  if (name.includes('lazada')) return '#2563EB'; // สีน้ำเงิน
  return '#6366F1'; // สี Default
};

// ฟังก์ชั่นสำหรับโหลด Library ภายนอก (เพื่อใช้ทำ PDF/JPEG)
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Script load error for ${src}`));
    document.head.appendChild(script);
  });
};

export default function App() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const [filterYear, setFilterYear] = useState('All');
  const [filterMonth, setFilterMonth] = useState('All');
  const [filterWeek, setFilterWeek] = useState('All');
  const [filterDay, setFilterDay] = useState('All');
  
  const [selectedPackers, setSelectedPackers] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  // State สำหรับปุ่ม Export
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${CSV_URL}&t=${new Date().getTime()}`);
      if (!response.ok) throw new Error('ไม่สามารถดึงข้อมูลจาก Google Sheets ได้');
      const csvText = await response.text();
      
      const parsed = parseCSV(csvText);
      if (parsed.length < 2) throw new Error('ไม่พบข้อมูลในไฟล์ หรือรูปแบบไฟล์ไม่ถูกต้อง');

      const headers = parsed[0];
      let cols = { date: 0, packer: -1, station: -1, channel: 17, shipping: -1, time: 12 };
      headers.forEach((h, i) => {
        const text = h.toLowerCase().trim();
        
        if ((text.includes('วัน') || text.includes('date')) && !text.includes('เวลา')) cols.date = i;
        
        // แก้ไข: บล็อกไม่ให้ดึงคอลัมน์ที่มีคำว่า "เวลา" หรือ "เกณฑ์" มาเป็นชื่อพนักงาน
        if ((text.includes('พนักงาน') || text.includes('ชื่อ') || text.includes('packer')) && !text.includes('เวลา')) {
          cols.packer = i;
        } else if (text.includes('แพ็ค') && !text.includes('เวลา') && !text.includes('เกณฑ์') && cols.packer === -1) {
          cols.packer = i;
        }
        
        if (text.includes('station') || text.includes('จุด') || text.includes('โต๊ะ')) cols.station = i;
        if (text.includes('จัดส่ง') || text.includes('ขนส่ง') || text.includes('ship')) cols.shipping = i;
      });

      if (cols.packer === -1) cols.packer = 1;
      if (cols.station === -1) cols.station = 2;
      if (cols.shipping === -1) cols.shipping = 4;

      const formattedData = [];
      for (let i = 1; i < parsed.length; i++) {
        const row = parsed[i];
        if (row.length < 5 || !row[cols.date]) continue;
        const dateObj = parseDateExt(row[cols.date]);
        if (!dateObj || isNaN(dateObj)) continue;

        formattedData.push({
          id: i, dateObj,
          packer: row[cols.packer]?.trim() || 'ไม่ระบุ',
          station: row[cols.station]?.trim() || 'ไม่ระบุ',
          channel: row[cols.channel]?.trim() || 'ไม่ระบุ',
          shipping: row[cols.shipping]?.trim() || 'ไม่ระบุ',
          timeCriteria: row[cols.time]?.trim() || 'ไม่ระบุ',
          year: dateObj.getFullYear(),
          month: dateObj.getMonth() + 1,
          week: getWeekNumber(dateObj),
          day: dateObj.getDate(),
          monday: getMonday(dateObj),
        });
      }
      setRawData(formattedData); setLastUpdate(new Date());
    } catch (err) { setError(err.message); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const filterOptions = useMemo(() => {
    const years = new Set(), months = new Set(), weeks = new Set(), days = new Set();
    rawData.forEach(d => {
      years.add(d.year);
      if (filterYear === 'All' || d.year === parseInt(filterYear)) {
        months.add(d.month);
        if (filterMonth === 'All' || d.month === parseInt(filterMonth)) {
          weeks.add(d.week);
          if (filterWeek === 'All' || d.week === parseInt(filterWeek)) {
            days.add(d.day);
          }
        }
      }
    });
    return {
      years: Array.from(years).sort((a, b) => b - a),
      months: Array.from(months).sort((a, b) => a - b),
      weeks: Array.from(weeks).sort((a, b) => a - b),
      days: Array.from(days).sort((a, b) => a - b)
    };
  }, [rawData, filterYear, filterMonth, filterWeek]);

  const dateFilteredData = useMemo(() => {
    return rawData.filter(d => {
      if (filterYear !== 'All' && d.year !== parseInt(filterYear)) return false;
      if (filterMonth !== 'All' && d.month !== parseInt(filterMonth)) return false;
      if (filterWeek !== 'All' && d.week !== parseInt(filterWeek)) return false;
      if (filterDay !== 'All' && d.day !== parseInt(filterDay)) return false;
      return true;
    });
  }, [rawData, filterYear, filterMonth, filterWeek, filterDay]);

  const interactiveData = useMemo(() => {
    return dateFilteredData.filter(d => {
      if (selectedPackers.length > 0 && !selectedPackers.includes(d.packer)) return false;
      if (selectedStation && d.station !== selectedStation) return false;
      if (selectedChannel && d.channel !== selectedChannel) return false;
      if (selectedShipping && d.shipping !== selectedShipping) return false;
      if (selectedTime && d.timeCriteria !== selectedTime) return false;
      return true;
    });
  }, [dateFilteredData, selectedPackers, selectedStation, selectedChannel, selectedShipping, selectedTime]);

  const systemSummary = useMemo(() => {
    const total = dateFilteredData.length;
    if (total === 0) return { total: 0, avgMonth: 0, avgDay: 0 };
    
    const uniqueDays = new Set();
    const uniqueMonths = new Set();
    dateFilteredData.forEach(d => {
      uniqueDays.add(d.dateObj.toDateString());
      uniqueMonths.add(`${d.year}-${d.month}`);
    });
    
    return {
      total,
      avgDay: Math.round(total / (uniqueDays.size || 1)),
      avgMonth: Math.round(total / (uniqueMonths.size || 1))
    };
  }, [dateFilteredData]);

  const overallInsights = useMemo(() => {
    if (dateFilteredData.length === 0) return null;
    
    const channelMap = {}, stationMap = {}, shippingMap = {};
    
    dateFilteredData.forEach(d => {
      channelMap[d.channel] = (channelMap[d.channel] || 0) + 1;
      stationMap[d.station] = (stationMap[d.station] || 0) + 1;
      shippingMap[d.shipping] = (shippingMap[d.shipping] || 0) + 1;
    });
    
    const getTop = (map) => {
      const entries = Object.entries(map).sort((a,b) => b[1] - a[1]);
      return entries.length > 0 ? { name: entries[0][0], value: entries[0][1] } : { name: '-', value: 0 };
    };
    
    const avgPerHour = Math.round(systemSummary.avgDay / 8); // Assuming 8 hr workday
    
    return {
      packer: 'ภาพรวมทั้งหมด',
      avgPerHour,
      avgPerDay: systemSummary.avgDay,
      topChannel: getTop(channelMap), 
      topStation: getTop(stationMap), 
      topShipping: getTop(shippingMap)
    };
  }, [dateFilteredData, systemSummary]);

  const individualInsights = useMemo(() => {
    if (selectedPackers.length === 0) return [];
    return selectedPackers.map(packer => {
      const pData = dateFilteredData.filter(d => d.packer === packer);
      if (pData.length === 0) return null;
      
      const uniqueDaysMap = new Set();
      const channelMap = {}, stationMap = {}, shippingMap = {};
      
      pData.forEach(d => {
        uniqueDaysMap.add(d.dateObj.toDateString());
        channelMap[d.channel] = (channelMap[d.channel] || 0) + 1;
        stationMap[d.station] = (stationMap[d.station] || 0) + 1;
        shippingMap[d.shipping] = (shippingMap[d.shipping] || 0) + 1;
      });
      
      const getTop = (map) => {
        const entries = Object.entries(map).sort((a,b) => b[1] - a[1]);
        return entries.length > 0 ? { name: entries[0][0], value: entries[0][1] } : { name: '-', value: 0 };
      };
      
      const uniqueDays = uniqueDaysMap.size || 1;
      const totalOrders = pData.length;
      const avgPerDay = Math.round(totalOrders / uniqueDays);
      const avgPerHour = Math.round(avgPerDay / 8); // Assuming 8 hr workday
      
      return {
        packer, totalOrders, avgPerDay, avgPerHour,
        topChannel: getTop(channelMap), topStation: getTop(stationMap), topShipping: getTop(shippingMap)
      };
    }).filter(Boolean);
  }, [dateFilteredData, selectedPackers]);

  const chartData = useMemo(() => {
    const agg = (data, key) => {
      const map = {};
      data.forEach(d => { map[d[key]] = (map[d[key]] || 0) + 1; });
      return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };

    const packerData = agg(dateFilteredData, 'packer');
    const stationData = agg(interactiveData, 'station');
    const shippingData = agg(interactiveData, 'shipping');

    // Helper สำหรับกราฟเปรียบเทียบ (Channel, Time)
    const buildCompareData = (data, categoryKey) => {
      const map = {};
      data.forEach(d => {
        const cat = d[categoryKey];
        if (!map[cat]) map[cat] = { name: cat };
        if (selectedPackers.length > 0) {
           map[cat][d.packer] = (map[cat][d.packer] || 0) + 1;
        } else {
           map[cat]['Total'] = (map[cat]['Total'] || 0) + 1;
        }
      });
      return Object.values(map);
    };

    let channelData = buildCompareData(interactiveData, 'channel');
    channelData.sort((a, b) => {
      const sumA = Object.keys(a).filter(k => k !== 'name').reduce((sum, k) => sum + a[k], 0);
      const sumB = Object.keys(b).filter(k => k !== 'name').reduce((sum, k) => sum + b[k], 0);
      return sumB - sumA;
    });

    let timeData = buildCompareData(interactiveData, 'timeCriteria');
    timeData.sort((a, b) => a.name.localeCompare(b.name));

    // แก้ไขระบบคำนวณกราฟแนวโน้มรายสัปดาห์เป็น เลขสัปดาห์ (Week Number)
    const weeklyMap = {};
    interactiveData.forEach(d => {
      const weekNum = getWeekNumber(d.monday);
      const sortKey = d.monday.getTime();
      const weekStr = `สัปดาห์ ${weekNum}`;
      
      if (!weeklyMap[sortKey]) weeklyMap[sortKey] = { name: weekStr, sortKey: sortKey };
      
      if (selectedPackers.length > 0) {
        if (selectedPackers.includes(d.packer)) {
          weeklyMap[sortKey][d.packer] = (weeklyMap[sortKey][d.packer] || 0) + 1;
        }
      } else {
        weeklyMap[sortKey]['Total'] = (weeklyMap[sortKey]['Total'] || 0) + 1;
      }
    });

    const weeklyTrendData = Object.values(weeklyMap).sort((a, b) => a.sortKey - b.sortKey);
    
    return { packers: packerData, stations: stationData, channels: channelData, shipping: shippingData, time: timeData, weekly: weeklyTrendData };
  }, [dateFilteredData, interactiveData, selectedPackers]);

  const handlePackerClick = (data) => {
    if (!data || !data.name) return;
    const packer = data.name;
    setSelectedPackers(prev => prev.includes(packer) ? prev.filter(p => p !== packer) : (prev.length < 3 ? [...prev, packer] : prev));
  };
  const handleChartClick = (selection, setSelected, data) => setSelected(prev => prev === data.name ? null : data.name);
  const resetAllFilters = () => {
    setFilterYear('All'); setFilterMonth('All'); setFilterWeek('All'); setFilterDay('All');
    setSelectedPackers([]); setSelectedStation(null); setSelectedChannel(null); setSelectedShipping(null); setSelectedTime(null);
  };
  const getPackerColor = (packerName) => {
    const index = selectedPackers.indexOf(packerName);
    return index !== -1 ? COLORS[index] : '#3B82F6';
  };

  // ฟังก์ชั่น Export หน้าจอ
  const handleExport = async (format) => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const element = document.getElementById('dashboard-container');
      
      const canvas = await window.html2canvas(element, {
        backgroundColor: '#0F172A',
        scale: 2, // ความคมชัด x2
        useCORS: true,
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const timestamp = new Date().toISOString().split('T')[0];

      if (format === 'jpeg') {
        const link = document.createElement('a');
        link.href = imgData;
        link.download = `Packer_Dashboard_${timestamp}.jpg`;
        link.click();
      } else if (format === 'pdf') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(`Packer_Dashboard_${timestamp}.pdf`);
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert("เกิดข้อผิดพลาดในการบันทึกไฟล์ โปรดลองใหม่อีกครั้ง");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading && rawData.length === 0) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0F172A]">
      <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mb-4" />
      <h2 className="text-xl font-bold text-gray-200">กำลังโหลดข้อมูล...</h2>
    </div>
  );
  
  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0F172A]">
      <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-200 mb-2">เกิดข้อผิดพลาด</h2>
      <p className="text-gray-400 mb-6">{error}</p>
      <button onClick={fetchData} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">ลองใหม่อีกครั้ง</button>
    </div>
  );

  const hasActiveFilters = filterYear !== 'All' || filterMonth !== 'All' || filterWeek !== 'All' || filterDay !== 'All' || selectedPackers.length > 0 || selectedStation || selectedChannel || selectedShipping || selectedTime;

  // ฟังก์ชั่นจัดการหน้าตาของการ์ด Insight เพื่อให้แสดงผลเปรียบเทียบได้สวยงาม
  const renderInsightCard = (insight, isOverall = false) => {
    const pColor = isOverall ? '#818CF8' : COLORS[selectedPackers.indexOf(insight.packer)];
    const title = isOverall ? 'ภาพรวมทั้งหมด' : insight.packer;

    return (
      <div key={insight.packer || 'overall'} className="bg-[#1E293B] p-5 rounded-2xl shadow-lg border h-full flex flex-col transition-all duration-300 hover:shadow-xl hover:shadow-black/20" style={{ borderColor: `${pColor}40` }}>
        <h3 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: pColor }}>
          <Info className="w-5 h-5 shrink-0" /> <span className="truncate">ข้อมูลเชิงลึก: {title}</span>
        </h3>
        <div className="space-y-4 flex-1 flex flex-col justify-between">
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
            <div>
              <p className="text-slate-400 text-[11px] mb-1 uppercase">ความเร็วโดยเฉลี่ย</p>
              <p className="text-2xl font-bold text-emerald-400">{insight.avgPerHour} <span className="text-sm font-normal text-slate-300">ออเดอร์/ชม.</span></p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-[11px] mb-1 uppercase">เฉลี่ยต่อวัน</p>
              <p className="text-xl font-bold text-slate-200">{insight.avgPerDay}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700">
              <p className="text-slate-400 text-[10px] mb-1 uppercase flex items-center gap-1"><Filter className="w-3 h-3"/> Channel หลัก</p>
              <p className="font-semibold text-sm text-pink-400 truncate">{insight.topChannel.name}</p>
              <p className="text-[11px] text-slate-500">{insight.topChannel.value.toLocaleString()} ออเดอร์</p>
            </div>
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700">
              <p className="text-slate-400 text-[10px] mb-1 uppercase flex items-center gap-1"><Box className="w-3 h-3"/> Station หลัก</p>
              <p className="font-semibold text-sm text-blue-400 truncate">{insight.topStation.name}</p>
              <p className="text-[11px] text-slate-500">{insight.topStation.value.toLocaleString()} ออเดอร์</p>
            </div>
            <div className="col-span-2 bg-slate-900/50 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-orange-400"/>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase">ขนส่งที่ใช้เยอะสุด</p>
                  <p className="font-semibold text-sm text-orange-400 truncate max-w-[140px]">{insight.topShipping.name}</p>
                </div>
              </div>
              <span className="bg-slate-800 px-2 py-1 rounded text-[11px] text-slate-300 border border-slate-700">{insight.topShipping.value.toLocaleString()} กล่อง</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    // เพิ่ม id="dashboard-container" เพื่อให้ระบบรู้ว่าจะถ่ายภาพส่วนไหน
    <div id="dashboard-container" className="min-h-screen bg-[#0F172A] font-sans p-4 md:p-6 text-gray-100">
      
      {/* Filters Header */}
      <div className="bg-[#1E293B] p-5 rounded-2xl shadow-lg mb-6 border border-gray-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3"><Box className="w-7 h-7 text-indigo-400" /> Packing Performance</h1>
            <p className="text-gray-400 text-sm mt-1 flex items-center gap-2"><Clock className="w-4 h-4" /> อัปเดตล่าสุด: {lastUpdate?.toLocaleTimeString('th-TH')}</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0 z-50">
            {hasActiveFilters && <button onClick={resetAllFilters} className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-lg transition text-sm"><XCircle className="w-4 h-4" /> ล้างตัวกรองทั้งหมด</button>}
            
            {/* Export Dropdown Button */}
            <div className="relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)} 
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm border border-slate-600 disabled:opacity-50 relative z-50"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? 'กำลังบันทึก...' : 'บันทึก (Export)'}
              </button>
              
              {showExportMenu && (
                <>
                  {/* พื้นหลังล่องหนสำหรับกดปิดเมนู (Click-away overlay) */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)}></div>
                  
                  {/* กล่องเมนูตัวเลือก */}
                  <div className="absolute right-0 mt-2 w-44 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden z-50">
                     <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-slate-700 transition text-left">
                       <FileText className="w-4 h-4 text-red-400" /> เป็นไฟล์ PDF
                     </button>
                     <button onClick={() => handleExport('jpeg')} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-slate-700 transition text-left border-t border-slate-700">
                       <ImageIcon className="w-4 h-4 text-blue-400" /> เป็นไฟล์ JPEG
                     </button>
                  </div>
                </>
              )}
            </div>

            <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition text-sm"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-gray-300 font-medium text-sm mr-2"><Filter className="w-4 h-4" /> กรองวันที่:</div>
          <select className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm" value={filterYear} onChange={(e) => { setFilterYear(e.target.value); setFilterMonth('All'); setFilterWeek('All'); setFilterDay('All'); }}><option value="All">ทุกปี</option>{filterOptions.years.map(y => <option key={y} value={y}>{y}</option>)}</select>
          <select className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm" value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); setFilterWeek('All'); setFilterDay('All'); }}><option value="All">ทุกเดือน</option>{filterOptions.months.map(m => <option key={m} value={m}>เดือน {m}</option>)}</select>
          <select className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm" value={filterWeek} onChange={(e) => { setFilterWeek(e.target.value); setFilterDay('All'); }}><option value="All">ทุกสัปดาห์</option>{filterOptions.weeks.map(w => <option key={w} value={w}>สัปดาห์ {w}</option>)}</select>
          <select className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm" value={filterDay} onChange={(e) => setFilterDay(e.target.value)}><option value="All">ทุกวัน</option>{filterOptions.days.map(d => <option key={d} value={d}>วันที่ {d}</option>)}</select>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedPackers.map(p => <span key={p} className="px-3 py-1 rounded-full text-xs bg-indigo-500/30 text-indigo-200 border border-indigo-500/50">พนักงาน: {p}</span>)}
          {selectedStation && <span className="px-3 py-1 rounded-full text-xs bg-blue-500/30 text-blue-200 border border-blue-500/50">Station: {selectedStation}</span>}
          {selectedChannel && <span className="px-3 py-1 rounded-full text-xs bg-pink-500/30 text-pink-200 border border-pink-500/50">Channel: {selectedChannel}</span>}
          {selectedShipping && <span className="px-3 py-1 rounded-full text-xs bg-orange-500/30 text-orange-200 border border-orange-500/50">ขนส่ง: {selectedShipping}</span>}
          {selectedTime && <span className="px-3 py-1 rounded-full text-xs bg-violet-500/30 text-violet-200 border border-violet-500/50">เวลา: {selectedTime}</span>}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Left Column: Leaderboard */}
        <div className="lg:col-span-2 bg-[#1E293B] p-5 rounded-2xl shadow-lg border border-gray-700 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-indigo-300">
              🏆 ผลงานพนักงานแพ็ค (Leaderboard)
            </h3>
            {selectedPackers.length > 0 && <span className="px-3 py-1 bg-indigo-900/50 text-indigo-200 text-xs rounded-full border border-indigo-700">เปรียบเทียบ {selectedPackers.length}/3</span>}
          </div>
          <p className="text-xs text-gray-400 mb-4">คลิกที่แท่งกราฟเพื่อดู Insight และเปรียบเทียบ (สูงสุด 3 คน)</p>
          <div className="flex-1 min-h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.packers} layout="vertical" margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#94A3B8'}} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#E2E8F0', fontSize: 13}} width={120} />
                <RechartsTooltip cursor={{fill: '#334155', opacity: 0.4}} content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28} onClick={handlePackerClick}>
                  <LabelList dataKey="value" position="right" fill="#94A3B8" fontSize={12} formatter={(val) => val.toLocaleString()} />
                  {chartData.packers.map((entry, index) => {
                    const isSelected = selectedPackers.includes(entry.name);
                    const isFaded = selectedPackers.length > 0 && !isSelected;
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getPackerColor(entry.name)} 
                        opacity={isFaded ? 0.3 : 1}
                        className="cursor-pointer transition-all hover:opacity-80" 
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column: Insights & Summary */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          
          {/* Summary Card */}
          <div className="bg-gradient-to-br from-indigo-900/60 to-slate-800 p-5 rounded-2xl shadow-lg border border-indigo-500/30 shrink-0">
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-indigo-200">
              <TrendingUp className="w-5 h-5" /> สรุปออเดอร์ (ภาพรวม)
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-[11px] mb-1">ทั้งหมด</p>
                <p className="text-lg font-bold text-white">{systemSummary.total.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-[11px] mb-1">เฉลี่ย/เดือน</p>
                <p className="text-lg font-bold text-white">{systemSummary.avgMonth.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-[11px] mb-1">เฉลี่ย/วัน</p>
                <p className="text-lg font-bold text-white">{systemSummary.avgDay.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Conditional Insight Logic (No more scrollbar!) */}
          {selectedPackers.length === 0 && overallInsights && renderInsightCard(overallInsights, true)}
          {selectedPackers.length === 1 && individualInsights.length > 0 && renderInsightCard(individualInsights[0], false)}
          
          {/* Placeholder for when 2-3 are selected */}
          {selectedPackers.length > 1 && (
            <div className="bg-[#1E293B] p-5 rounded-2xl shadow-lg border border-slate-700 flex-1 flex flex-col items-center justify-center text-center opacity-70 min-h-[250px]">
              <Users className="w-12 h-12 text-slate-500 mb-4" />
              <p className="text-slate-300 font-medium mb-1">เปรียบเทียบข้อมูลเชิงลึก {selectedPackers.length} คน</p>
              <p className="text-slate-400 text-xs">แสดงผลแบบคู่ขนานที่ด้านล่างกราฟ</p>
            </div>
          )}

        </div>
      </div>

      {/* Comparison Insights Row (Shows only when > 1 packer is selected) */}
      {selectedPackers.length > 1 && (
        <div className="mb-6 bg-[#1E293B]/40 p-5 rounded-2xl border border-indigo-500/20">
          <h3 className="text-lg font-semibold mb-5 flex items-center gap-2 text-indigo-300">
            <Users className="w-5 h-5" /> เปรียบเทียบข้อมูลเชิงลึกรายบุคคล
          </h3>
          <div className={`grid grid-cols-1 gap-6 ${selectedPackers.length === 2 ? 'md:grid-cols-2 lg:grid-cols-2' : 'md:grid-cols-3 lg:grid-cols-3'}`}>
            {individualInsights.map((insight) => renderInsightCard(insight, false))}
          </div>
        </div>
      )}

      {/* Bottom Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
         {/* Weekly Trend Bar Chart */}
         <div className="lg:col-span-2 bg-[#1E293B] p-5 rounded-2xl shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-400">
            <TrendingUp className="w-5 h-5" /> แนวโน้มงานแต่ละสัปดาห์
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.weekly} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94A3B8'}} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{fill: '#334155', opacity: 0.4}} />
                <Legend verticalAlign="top" height={36} iconType="circle" formatter={(value) => <span className="text-slate-300">{value}</span>} />
                {selectedPackers.length > 0 ? (
                  selectedPackers.map((packer, index) => (
                    <Bar key={packer} dataKey={packer} fill={COLORS[index]} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  ))
                ) : (
                  <Bar dataKey="Total" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={60} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Station Pie Chart */}
        <div className="bg-[#1E293B] p-5 rounded-2xl shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-400">
            <Box className="w-5 h-5" /> สัดส่วนการใช้ Station
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData.stations} cx="50%" cy="45%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} onClick={(data) => handleChartClick(selectedStation, setSelectedStation, data)}>
                  {chartData.stations.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="cursor-pointer hover:opacity-80" stroke={selectedStation === entry.name ? '#fff' : 'none'} strokeWidth={2} />)}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" height={60} iconType="circle" formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Channel Bar Chart */}
        <div className="bg-[#1E293B] p-5 rounded-2xl shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-pink-400">
            <Filter className="w-5 h-5" /> ช่องทางการขาย
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.channels} layout="vertical" margin={{top: 10, right: 30, left: 0, bottom: 20}}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#94A3B8'}} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12}} width={70} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{fill: '#334155', opacity: 0.4}} />
                
                {selectedPackers.length > 0 ? (
                  <>
                    <Legend verticalAlign="top" height={36} iconType="circle" formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>} />
                    {selectedPackers.map((packer, index) => (
                      <Bar 
                        key={packer} 
                        dataKey={packer} 
                        fill={COLORS[index]} 
                        radius={[0, 4, 4, 0]} 
                        barSize={8} 
                        onClick={(data) => handleChartClick(selectedChannel, setSelectedChannel, { name: data.payload?.name || data.name })}
                      />
                    ))}
                  </>
                ) : (
                  <Bar dataKey="Total" radius={[0, 4, 4, 0]} barSize={24} onClick={(data) => handleChartClick(selectedChannel, setSelectedChannel, data)}>
                     {chartData.channels.map((entry, index) => (
                       <Cell 
                         key={`cell-${index}`} 
                         fill={getChannelColor(entry.name)} 
                         className="cursor-pointer hover:opacity-80" 
                         stroke={selectedChannel === entry.name ? '#fff' : (getChannelColor(entry.name) === '#000000' ? '#475569' : 'none')} 
                         strokeWidth={2} 
                       />
                     ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Time Criteria Area Chart */}
        <div className="lg:col-span-2 bg-[#1E293B] p-5 rounded-2xl shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-violet-400">
            <Clock className="w-5 h-5" /> Peak Time
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.time} margin={{top: 10, right: 10, left: 0, bottom: 20}}>
                <defs>
                  <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.8}/><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 11}} angle={-45} textAnchor="end" interval={0} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94A3B8'}} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{stroke: '#334155'}} />
                
                {selectedPackers.length > 0 ? (
                  <>
                    <Legend verticalAlign="top" height={36} iconType="circle" formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>} />
                    {selectedPackers.map((packer, index) => (
                      <Area 
                        key={packer} 
                        type="monotone" 
                        dataKey={packer} 
                        stroke={COLORS[index]} 
                        strokeWidth={2} 
                        fillOpacity={0.15} 
                        fill={COLORS[index]} 
                        className="hover:opacity-80 transition-opacity"
                        onClick={(data) => handleChartClick(selectedTime, setSelectedTime, { name: data.payload?.name || data.name })}
                      />
                    ))}
                  </>
                ) : (
                  <Area type="monotone" dataKey="Total" stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorTime)" onClick={(data) => handleChartClick(selectedTime, setSelectedTime, data)} className="cursor-pointer hover:opacity-80" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}