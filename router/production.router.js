const express = require('express');
const router = express.Router();

const ProductionRequest = require('../models/productionRequest.model');
const ProductionResult = require('../models/productionResult.model');
const Stage = require('../models/stage.model');
const Phase = require('../models/phase.model');
const Room = require('../models/room.model');


// Timeline Generator using Stage ID
const generateExpandedTimeline = async (requestEntry) => {
  const allStages = await Stage.find().sort({ position: 1 });

  const flattened = [];
  for (let s of allStages) {
    const prefix = s.code || s.name[0].toUpperCase();
    for (let i = 0; i < s.minDays; i++) {
      flattened.push({
        stageId: s._id,
        stage: s.name,
        code: prefix,
        flow: `${prefix}${i}`,
        position: s.position
      });
    }
  }


  const targetStage = await Stage.findById(requestEntry.stage);
  const stageFlow = requestEntry.flow;



  const targetIndex = flattened.findIndex(
    f => f.stageId.equals(requestEntry.stage) && f.flow.toUpperCase() === stageFlow.toUpperCase()
  );

  if (targetIndex === -1) throw new Error(`Invalid stage/flow combination`);

  const entries = [];
  let currentDate = new Date(requestEntry.startDate);
  currentDate.setDate(currentDate.getDate() - targetIndex);

  for (let i = 0; i < flattened.length; i++) {
    const f = flattened[i];
    const entryStart = new Date(currentDate);
    const entryEnd = new Date(currentDate);
    entryEnd.setDate(entryEnd.getDate() + 1);

    entries.push({
      requestId: requestEntry._id,
      name: requestEntry.name,
      phase: requestEntry.phase,
      room: requestEntry.room,
      stage: f.stageId,
      flow: f.flow,
      currentFlow: f.flow,
      startDate: entryStart,
      endDate: entryEnd,
      date: entryStart,
      specialCase: requestEntry.specialCase || false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return entries;
};

// === Add Production Request ===
router.post('/add-production', async (req, res) => {
  try {
    const { name, phase, room, stage, flow, startDate, specialCase } = req.body;

    if (!name || !phase || !room || !stage || !flow || !startDate) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check duplicate name
    const existing = await ProductionRequest.findOne({ name });
    if (existing) {
      return res.status(400).json({ error: `Production name '${name}' already exists.` });
    }

    // Validate all IDs
    const phaseExists = await Phase.findById(phase);
    const roomExists = await Room.findById(room);
    const stageExists = await Stage.findById(stage);

    if (!phaseExists || !roomExists || !stageExists) {
      return res.status(400).json({ error: 'Invalid phase, room or stage ID' });
    }

    // Save request
    const newRequest = await ProductionRequest.create({
      name, phase, room, stage, flow, startDate, specialCase
    });

    // Generate timeline
    const fullEntries = await generateExpandedTimeline(newRequest);

    // Attach productionRequestId to each result
    const entriesWithId = fullEntries.map(entry => ({
      ...entry,
      productionRequestId: newRequest._id
    }));

    await ProductionResult.insertMany(entriesWithId);

    res.status(201).json({
      message: "Production timeline created successfully.",
      requestId: newRequest._id
    });

  } catch (err) {
    console.error("Error in /add-production:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ==== Get Production by Request ID ====
router.get('/get-production/:requestId', async (req, res) => {
  try {
    const results = await ProductionResult.find({ productionRequestId: req.params.requestId })

      .sort({ startDate: 1 })
      .populate('stage', 'name');

    if (!results.length) {
      return res.status(404).json({ message: 'No results found for this request ID' });
    }

    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==== Update production entry ====
router.put('/update-flow-by-request/:requestId', async (req, res) => {
  try {
    const { currentFlow, newFlow } = req.body;
    if (!currentFlow || !newFlow) {
      return res.status(400).json({ error: "Both currentFlow and newFlow are required." });
    }

    // 1) Find the current row for to update
    const currentEntry = await ProductionResult.findOne({
      productionRequestId: req.params.requestId,
      currentFlow
    });

    if (!currentEntry) {
      return res.status(404).json({ error: 'Current flow not found for this request.' });
    }

    // 2)allow only updation in Spawn Run, Case Run, or Venting
    const stageDoc = await Stage.findById(currentEntry.stage).lean();
    const stageName = (stageDoc?.name || "").trim();
    const ALLOWED_UPDATE_STAGE_NAMES = new Set(["Spawn Run", "Case Run", "Venting"]);
    if (!ALLOWED_UPDATE_STAGE_NAMES.has(stageName)) {
      return res.status(403).json({
        error: 'Flow changes only allowed in Spawn Run, Case Run, or Venting stages.'
      });
    }

    // 3) Transition rules:

    const getPrefix = (f) => (f.match(/[A-Z]+/i) || [])[0]?.toUpperCase() || "";
    const getStep   = (f) => parseInt((f.match(/\d+/) || [])[0], 10);

    const curPrefix = getPrefix(currentFlow);
    const curStep   = getStep(currentFlow);
    const newPrefix = getPrefix(newFlow);
    const newStep   = getStep(newFlow);

    // Load stage meta
    const allStagesMeta = await Stage.find().lean();
    const prefixOf = (s) => (s.code ? s.code.toUpperCase() : s.name[0].toUpperCase());

    // Identify current, previous, next by position
    const currentStage = allStagesMeta.find(s => String(s._id) === String(currentEntry.stage));
    if (!currentStage) {
      return res.status(400).json({ error: "Current stage metadata not found." });
    }
    const stagesByPos = [...allStagesMeta].sort((a,b) => a.position - b.position);
    const curIdx = stagesByPos.findIndex(s => String(s._id) === String(currentStage._id));
    const prevStage = curIdx > 0 ? stagesByPos[curIdx - 1] : null;
    const nextStage = curIdx >= 0 && curIdx < stagesByPos.length - 1 ? stagesByPos[curIdx + 1] : null;

    const prevPrefix = prevStage ? prefixOf(prevStage) : null;
    const nextPrefix = nextStage ? prefixOf(nextStage) : null;

    const atFirst = curStep === 0;
    const atLast  = curStep === (currentStage.maxDays - 1);

    let allowed = false;
    let moveKind = "none";

    // Rule A: at step 0 -> only previous stage any step
    if (atFirst) {
      allowed =
        !!prevStage &&
        newPrefix === prevPrefix &&
        Number.isInteger(newStep) &&
        newStep >= 0 &&
        newStep < prevStage.maxDays;

      moveKind = allowed ? "backward_boundary" : "blocked_at_first";
    }
    // Rule B: inside stage (not first/last)
else if (!atLast && !atFirst) {
  const isForwardWithin  = (newPrefix === curPrefix && newStep === curStep + 1);
  const isBackwardWithin = (newPrefix === curPrefix && newStep === curStep - 1);
  const isEarlyForwardBoundary = (nextStage && newPrefix === nextPrefix && newStep === 0);

  allowed = isForwardWithin || isBackwardWithin || isEarlyForwardBoundary;

  if (isEarlyForwardBoundary) {
    moveKind = "forward_boundary";
  } else if (isForwardWithin) {
    moveKind = "forward";
  } else if (isBackwardWithin) {
    moveKind = "backward";
  } else {
    moveKind = "blocked_inside";
  }
}

    // Rule C: at last step -> forward boundary to next@0 OR step back 1 within same stage
    else {
      allowed =
        (newPrefix === curPrefix && newStep === curStep - 1) || // one step back
        (nextStage && newPrefix === nextPrefix && newStep === 0); // forward boundary

      moveKind = allowed
        ? (newPrefix === curPrefix ? "backward" : "forward_boundary")
        : "blocked_at_last";
    }

    if (!allowed) {
      return res.status(400).json({
        error:
          "Invalid flow transition."
      });
    }

    // 3b) Validate newFlow is within that stage's maxDays
    const stageForNewPrefix = allStagesMeta.find(s => prefixOf(s) === newPrefix);
    if (!stageForNewPrefix) {
      return res.status(400).json({ error: `No stage found for prefix '${newPrefix}'. Check stage.code.` });
    }
    if (Number.isNaN(newStep) || newStep < 0 || newStep >= stageForNewPrefix.maxDays) {
      return res.status(400).json({
        error: `Flow '${newFlow}' exceeds limits for stage '${stageForNewPrefix.name}'. ` +
               `Valid flows: ${newPrefix}0…${newPrefix}${Math.max(0, stageForNewPrefix.maxDays - 1)}`
      });
    }

    //  V0 -> CR4
    if (moveKind === "backward_boundary") {
      const dayMs = 24 * 60 * 60 * 1000;

      // Update ONLY today's row to newFlow 
      const targetStage = stageForNewPrefix; 
      await ProductionResult.updateOne(
        { _id: currentEntry._id },
        {
          $set: {
            stage: targetStage._id,
            flow: newFlow.toUpperCase(),
            currentFlow: newFlow.toUpperCase(),
            updatedAt: new Date()
          }
        }
      );

      // Delete future rows 
      await ProductionResult.deleteMany({
        productionRequestId: req.params.requestId,
        date: { $gt: currentEntry.date }
      });

      // Rebuild future starting TOMORROW from the ORIGINAL 
      const requestDoc = await ProductionRequest.findById(req.params.requestId).lean();
      if (!requestDoc) {
        return res.status(404).json({ error: 'Production request not found.' });
      }

      // Build a minDays sequence (original schedule) for resume
      const allStagesSortedMin = [...allStagesMeta].sort((a, b) => a.position - b.position);
      const seqMin = [];
      for (let s of allStagesSortedMin) {
        const p = prefixOf(s);
        for (let i = 0; i < s.minDays; i++) {
          seqMin.push({ stageId: s._id, stageName: s.name, flow: `${p}${i}` });
        }
      }

      const resumeFlow = `${curPrefix}0`; 
      const resumeIndex = seqMin.findIndex(x => x.flow.toUpperCase() === resumeFlow);
      if (resumeIndex === -1) {
        return res.status(500).json({ error: `Cannot resume from ${resumeFlow}.` });
      }

      const baseDate = new Date(currentEntry.date.getTime() + dayMs);
      const flowsToInsert = seqMin.slice(resumeIndex);

      const newResults = flowsToInsert.map((f, i) => {
        const d0 = new Date(baseDate.getTime() + i * dayMs);
        const d1 = new Date(baseDate.getTime() + (i + 1) * dayMs);
        return {
          productionRequestId: requestDoc._id,
          requestId: requestDoc._id,
          name: requestDoc.name,
          phase: requestDoc.phase,
          room: requestDoc.room,
          stage: f.stageId,
          flow: f.flow,
          currentFlow: f.flow,
          startDate: d0,
          endDate: d1,
          date: d0,
          specialCase: requestDoc.specialCase || false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      });

      if (newResults.length) {
        await ProductionResult.insertMany(newResults);
      }

      return res.status(200).json({
        updatedTodayFrom: currentFlow,
        updatedTodayTo: newFlow,
        
      });
    }

    
// Direction-specific updates & deletions
const dayMs = 24 * 60 * 60 * 1000;
const isForwardish  = (moveKind === "forward" || moveKind === "forward_boundary");
const isBackwardish = (moveKind === "backward");

if (isForwardish) {
  // Update TODAY to newFlow (e.g., CR4 -> V0 today)
  const targetStage = stageForNewPrefix; 
  await ProductionResult.updateOne(
    { _id: currentEntry._id },
    {
      $set: {
        stage: targetStage._id,
        flow: newFlow.toUpperCase(),
        currentFlow: newFlow.toUpperCase(),
        updatedAt: new Date()
      }
    }
  );

  // Delete ONLY future (tomorrow+)
  await ProductionResult.deleteMany({
    productionRequestId: req.params.requestId,
    date: { $gt: currentEntry.date }
  });
} else if (isBackwardish) {
  // Replace today, so remove today+future
  await ProductionResult.deleteMany({
    productionRequestId: req.params.requestId,
    date: { $gte: currentEntry.date }
  });
}

// Get the request doc 
const requestDoc = await ProductionRequest.findById(req.params.requestId).lean();
if (!requestDoc) {
  return res.status(404).json({ error: 'Production request not found.' });
}

// Use maxDays for the stage matching newPrefix, minDays for others.
const allStagesSorted = [...allStagesMeta].sort((a, b) => a.position - b.position);
const sequence = [];
for (let s of allStagesSorted) {
  const p = prefixOf(s);
  const limit = (p === newPrefix) ? s.maxDays : s.minDays;
  for (let i = 0; i < limit; i++) {
    sequence.push({ stageId: s._id, stageName: s.name, flow: `${p}${i}` });
  }
}

// Find index of the new flow in the global sequence
const startIndex = sequence.findIndex(x => x.flow.toUpperCase() === newFlow.toUpperCase());
if (startIndex === -1) {
  return res.status(500).json({ error: 'Invalid new flow' }); 
}

// Dates & which flows to insert

const baseDate = new Date(currentEntry.date.getTime() + (isBackwardish ? 0 : dayMs));

let flowsToInsert;
if (isBackwardish) {
  flowsToInsert = [sequence[startIndex]];           
} else if (isForwardish) {
  flowsToInsert = sequence.slice(startIndex + 1);   
} else {
  flowsToInsert = []; 
}

const newResults = flowsToInsert.map((f, i) => {
  const d0 = new Date(baseDate.getTime() + i * dayMs);
  const d1 = new Date(baseDate.getTime() + (i + 1) * dayMs);
  return {
    productionRequestId: requestDoc._id,
    requestId: requestDoc._id,
    name: requestDoc.name,
    phase: requestDoc.phase,
    room: requestDoc.room,
    stage: f.stageId,
    flow: f.flow,
    currentFlow: f.flow,
    startDate: d0,
    endDate: d1,
    date: d0,
    specialCase: requestDoc.specialCase || false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
});

if (newResults.length) {
  await ProductionResult.insertMany(newResults);
}

return res.status(200).json({
  message: "Flow updated successfully",
  updatedFrom: currentFlow,
  updatedTo: newFlow
});


  } catch (err) {
    console.error("Update Flow Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
