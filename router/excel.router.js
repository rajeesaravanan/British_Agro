const express = require('express');
const ExcelJS = require('exceljs');

const ProductionRequest = require('../models/productionRequest.model');
const ProductionResult  = require('../models/productionResult.model');
const Phase             = require('../models/phase.model');
const Room              = require('../models/room.model');
const Stage             = require('../models/stage.model');

const router = express.Router();

/* ---- helpers ---- */
const toId = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v._id) return String(v._id);
  try { return String(v); } catch { return null; }
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const displayName = (doc) =>
  (doc?.name ?? doc?.room_number ?? doc?.roomName ?? doc?.phaseName ?? doc?.title ?? '');

const resolveName = (fieldValue, fallbackMap) => {
  if (fieldValue && typeof fieldValue === 'object') {
    const dn = displayName(fieldValue);
    if (dn) return dn;
  }
  const id = toId(fieldValue);
  return id ? (fallbackMap.get(id) || '') : '';
};

/* ---- workbook (no Meta sheet) ---- */
async function buildWorkbook(results, maps, reqMeta) {
  const { phaseMap, roomMap, stageMap, stageCodeMap } = maps;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Agro Dashboard';
  wb.created = new Date();

  const ws = wb.addWorksheet('Production');
  ws.columns = [
    { header: 'No',           key: 'no',           width: 6  },
    { header: 'Name',         key: 'name',         width: 22 },
    { header: 'Phase',        key: 'phase',        width: 18 },
    { header: 'Room Number',  key: 'room',         width: 18 },
    { header: 'Stage',        key: 'stage',        width: 18 },
    { header: 'Stage Code',   key: 'stageCode',    width: 12 },
    { header: 'Flow',         key: 'flow',         width: 10 },
    { header: 'Current Flow', key: 'currentFlow',  width: 14 },
    { header: 'Start Date',   key: 'startDate',    width: 20 },
    { header: 'End Date',     key: 'endDate',      width: 20 },
    { header: 'Date',         key: 'date',         width: 20 },
    { header: 'Special Case', key: 'specialCase',  width: 12 },
    { header: 'Request ID',   key: 'requestId',    width: 28 },
    { header: 'Result ID',    key: 'resultId',     width: 28 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'N1' };

  results.forEach((r, i) => {
    const phaseName =
      resolveName(r.phase, phaseMap) ||
      resolveName(reqMeta?.phase, phaseMap) ||
      displayName(reqMeta?.phase) || '';

    const roomName  =
      resolveName(r.room, roomMap) ||
      resolveName(reqMeta?.room, roomMap) ||
      displayName(reqMeta?.room) || '';

    const stageName = (r.stage && typeof r.stage === 'object' && 'name' in r.stage)
      ? (r.stage.name || '')
      : resolveName(r.stage, stageMap);

    const stageIdForCode = toId(r.stage);
    const stageCode = (r.stage && typeof r.stage === 'object' && 'code' in r.stage)
      ? (r.stage.code || '')
      : (stageIdForCode ? (stageCodeMap.get(stageIdForCode) || '') : '');

    ws.addRow({
      no: i + 1,
      name: r.name,
      phase: phaseName,
      room:  roomName,
      stage: stageName,
      stageCode,
      flow: r.flow,
      currentFlow: r.currentFlow,
      startDate: r.startDate ? new Date(r.startDate) : null,
      endDate:   r.endDate   ? new Date(r.endDate)   : null,
      date:      r.date      ? new Date(r.date)      : null,
      specialCase: !!r.specialCase,
      requestId: String(r.productionRequestId || r.requestId || ''),
      resultId: String(r._id),
    });
  });

  ['startDate','endDate','date'].forEach(k => { ws.getColumn(k).numFmt = 'yyyy-mm-dd hh:mm'; });
  for (let r = 2; r <= ws.rowCount; r++) {
    if (r % 2 === 0) ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
  }

  return wb; 
}

/* --- data fetch + maps --- */
async function fetchResultsAndMeta(requestId, timeFilter) {
  const q = { productionRequestId: requestId };
  if (timeFilter?.dateFrom || timeFilter?.dateTo) {
    q.date = {};
    if (timeFilter.dateFrom) q.date.$gte = new Date(timeFilter.dateFrom);
    if (timeFilter.dateTo)   q.date.$lte = new Date(timeFilter.dateTo);
  }

  const results = await ProductionResult.find(q)
    .sort({ startDate: 1 })
    .populate({ path: 'stage', select: 'name code title',        model: 'Stage' })
    .populate({ path: 'phase', select: 'name phaseName title',   model: 'Phase' })
    .populate({ path: 'room',  select: 'room_number name title', model: 'Room'  })
    .lean();

  if (!results.length) return { results, reqMeta: null };

  const reqMeta = await ProductionRequest.findById(requestId)
    .populate({ path: 'phase', select: 'name phaseName title',   model: 'Phase' })
    .populate({ path: 'room',  select: 'room_number name title', model: 'Room'  })
    .lean();

  return { results, reqMeta };
}

async function buildFallbackMaps(results, reqMeta) {
  const phaseIds = uniq([
    ...results.map(r => toId(r.phase)),
    toId(reqMeta?.phase),
  ]);
  const roomIds  = uniq([
    ...results.map(r => toId(r.room)),
    toId(reqMeta?.room),
  ]);
  const stageIds = uniq(results.map(r => toId(r.stage)));

  const [phDocs, rmDocs, stDocs] = await Promise.all([
    Phase.find({ _id: { $in: phaseIds } }, { name: 1, phaseName: 1, title: 1 }).lean(),
    Room.find({ _id: { $in: roomIds } },   { room_number: 1, name: 1, title: 1 }).lean(),
    Stage.find({ _id: { $in: stageIds } }, { name: 1, code: 1, title: 1 }).lean(),
  ]);

  const phaseMap     = new Map(phDocs.map(d => [String(d._id), displayName(d)]));
  const roomMap      = new Map(rmDocs.map(d => [String(d._id), displayName(d)]));
  const stageMap     = new Map(stDocs.map(d => [String(d._id), displayName(d)]));
  const stageCodeMap = new Map(stDocs.map(d => [String(d._id), d.code || '']));

  if (reqMeta?.phase) phaseMap.set(toId(reqMeta.phase), displayName(reqMeta.phase));
  if (reqMeta?.room)  roomMap.set(toId(reqMeta.room),   displayName(reqMeta.room));

  return { phaseMap, roomMap, stageMap, stageCodeMap };
}


// GET /api/excel/download/:requestId.xlsx  
router.get('/download/:requestId.xlsx', async (req, res) => {
  try {
    const { requestId } = req.params;

    const { results, reqMeta } = await fetchResultsAndMeta(requestId);
    if (!results || !results.length) {
      return res.status(404).json({ message: 'No results found for this request ID' });
    }

    const maps = await buildFallbackMaps(results, reqMeta);
    const wb = await buildWorkbook(results, maps, reqMeta);

    const safeName = (displayName(reqMeta) || reqMeta?.name || 'production').replace(/[^\w\-]+/g, '_');
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_${requestId}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
